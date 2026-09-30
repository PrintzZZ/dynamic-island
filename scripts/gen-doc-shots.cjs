// 一键重新生成 docs/images 里的界面截图（真实构建产物离屏渲染，不是手绘稿）
//
//   node_modules/.bin/electron scripts/gen-doc-shots.cjs
//     或  npx electron scripts/gen-doc-shots.cjs
//
// 运行前先 `npm run build`（脚本用的是 dist-electron/main.js 与 dist/）。
// 想把图直接写到 docs/images：加个 --write 参数。
//
// 踩过的坑（改这个脚本前务必读一遍）：
//   1. 清空 profile 后**必须重新 mkdirSync**，否则 main.js 加载即 ENOENT，并且会弹一个
//      错误弹窗卡在那里等点击，看起来像"卡死"。
//   2. **种子数据必须在 require(main.js) 之前写好** —— 主进程启动时才读 phrases/images，
//      启动后再写文件它看不见（渲染进程 reload 也没用）。
//   3. **不能靠改 settings.json 切默认应用**：defaultApp 是主进程启动时读的。
//      要换应用请发主进程已有的 `island:switch-app` 通道（托盘菜单用的就是它）。
//   4. 常用语 / 图片 / 剪贴板是「效率」应用的卡片，**时间应用下这些卡片根本不挂载** ——
//      所以脚本会把 defaultApp 设成 efficiency；切不到卡片就直接报错，别静默出图。
//   5. 窗口要放在**屏幕内**：放在屏幕外时 Chromium 判 document.hidden = true，
//      通知态（「已截图 ☆」）根本不会弹。
//   6. 离屏窗口的 capturePage 会拿到重绘前的旧帧 → 先改一下窗口尺寸逼它重绘，
//      再连抓两次、只用第二张。
//   7. 展开 / 切卡片一律走**渲染进程内派发的鼠标事件**：岛开着 setIgnoreMouseEvents(true,
//      { forward: true }) 时 sendInputEvent 不可靠。
//   8. 岛内应用由 CardCarousel 承载，卡片选择器是 `.deck .card`（不是老的 .app-tabs .tab）。
const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, clipboard, nativeImage } = require('electron')

const WRITE = process.argv.includes('--write')
const PROJ = path.resolve(__dirname, '..')
const ROOT = path.join(PROJ, '.doc-shots')
const PROFILE = path.join(ROOT, 'profile')
const OUT = WRITE ? path.join(PROJ, 'docs', 'images') : path.join(ROOT, 'out')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

// ---------------- 演示素材：用 canvas 画几张"真会被收藏的图" ----------------
// 比拿界面截图当素材可信得多：物流运单 / 收货信息 / 收款码
const MATERIAL = [
  {
    file: 'demo0.png',
    name: '顺丰运单',
    w: 420,
    h: 300,
    draw: `(ctx, w, h) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = '#0a0a0a'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('顺丰速运', 22, 44);
      ctx.fillStyle = '#8a8a8e'; ctx.font = '13px sans-serif'; ctx.fillText('运单号', 22, 78);
      ctx.fillStyle = '#0a0a0a'; ctx.font = 'bold 17px monospace'; ctx.fillText('SF1234567890123', 22, 102);
      ctx.fillStyle = '#8a8a8e'; ctx.font = '13px sans-serif'; ctx.fillText('收件人', 22, 138);
      ctx.fillStyle = '#0a0a0a'; ctx.font = '15px sans-serif'; ctx.fillText('张先生  138 0013 8000', 22, 162);
      ctx.fillStyle = '#8a8a8e'; ctx.font = '13px sans-serif'; ctx.fillText('地址', 22, 198);
      ctx.fillStyle = '#0a0a0a'; ctx.font = '15px sans-serif'; ctx.fillText('广东省深圳市南山区科技园路 1 号', 22, 222);
      ctx.fillStyle = '#30d158'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('派送中 · 预计今天 18:00 送达', 22, 262);
    }`,
  },
  {
    file: 'demo1.png',
    name: '收货信息',
    w: 420,
    h: 260,
    draw: `(ctx, w, h) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = '#0a0a0a'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('常用收货信息', 22, 40);
      const rows = [['姓名','李女士'],['电话','139 1234 5678'],['地址','北京市朝阳区建国路 88 号 SOHO 现代城 A 座 1801'],['备注','工作日 9:00-18:00 可收货']];
      let y = 78;
      for (const [k,v] of rows) {
        ctx.fillStyle = '#8a8a8e'; ctx.font = '13px sans-serif'; ctx.fillText(k, 22, y);
        ctx.fillStyle = '#0a0a0a'; ctx.font = '15px sans-serif'; ctx.fillText(v, 76, y);
        y += 42;
      }
    }`,
  },
  {
    file: 'demo2.png',
    name: '收款码',
    w: 300,
    h: 360,
    draw: `(ctx, w, h) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = '#0a0a0a'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('扫码付款', w/2, 38);
      const n = 21, pad = 42, cell = Math.floor((w - pad*2) / n);
      for (let y=0;y<n;y++) for (let x=0;x<n;x++) {
        const corner = (x<7&&y<7)||(x>n-8&&y<7)||(x<7&&y>n-8);
        const on = corner ? (x%6===0||y%6===0||(x>1&&x<5&&y>1&&y<5)) : ((x*7+y*13+((x*y)%5))%3===0);
        if (on) { ctx.fillStyle = '#0a0a0a'; ctx.fillRect(pad+x*cell, pad+y*cell, cell-1, cell-1); }
      }
      ctx.fillStyle = '#8a8a8e'; ctx.font = '13px sans-serif'; ctx.fillText('向「UsePro」付款', w/2, h-24);
    }`,
  },
  // 再掺两张界面截图，凑出"平时随手存的截图"
  { file: 'shot0.png', name: 'app-music', w: 408, h: 272, copyFrom: 'docs/images/app-music.png' },
  { file: 'shot1.png', name: 'app-net', w: 408, h: 504, copyFrom: 'docs/images/app-net.png' },
]

// ---------------- 先画素材（需要在 ready 之后、加载 main.js 之前） ----------------
async function makeMaterial(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const tmp = new BrowserWindow({ show: false, width: 500, height: 500 })
  await tmp.loadURL('about:blank')
  for (const m of MATERIAL) {
    const dst = path.join(dir, m.file)
    if (m.copyFrom) {
      fs.copyFileSync(path.join(PROJ, m.copyFrom), dst)
      log('  素材', m.name, '(来自', m.copyFrom + ')')
      continue
    }
    const dataUrl = await tmp.webContents.executeJavaScript(
      `(() => { const c = document.createElement('canvas'); c.width = ${m.w}; c.height = ${m.h};
        ;(${m.draw})(c.getContext('2d'), ${m.w}, ${m.h}); return c.toDataURL('image/png') })()`
    )
    fs.writeFileSync(dst, Buffer.from(String(dataUrl).split(',')[1], 'base64'))
    log('  素材', m.name, `${m.w}×${m.h}`)
  }
  tmp.destroy()
}

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  try {
    // 先把 profile 与素材准备好，再加载主进程
    fs.rmSync(PROFILE, { recursive: true, force: true })
    fs.mkdirSync(PROFILE, { recursive: true })
    fs.mkdirSync(OUT, { recursive: true })

    const MATDIR = path.join(ROOT, 'material')
    log('生成演示素材：')
    await makeMaterial(MATDIR)

    const D = path.join(PROFILE, 'data')
    const IMGDIR = path.join(D, 'phrases', 'images')
    for (const p of [IMGDIR, path.join(D, 'phrases', 'thumbnails'), path.join(D, 'clipboard', 'images')]) {
      fs.mkdirSync(p, { recursive: true })
    }
    // 默认应用「效率」：常用语/图片/剪贴板卡片一开始就挂载
    fs.writeFileSync(path.join(PROFILE, 'settings.json'), JSON.stringify({ defaultApp: 'efficiency' }), 'utf8')

    const now = Date.now()
    const images = MATDIR === '' ? [] : MATERIAL.map((m, i) => {
      fs.copyFileSync(path.join(MATDIR, m.file), path.join(IMGDIR, m.file))
      return {
        id: m.file.replace('.png', ''),
        name: m.name,
        category: ['售前', '', '售后', '使用', ''][i] || '',
        favorite: i < 2,
        useCount: [12, 8, 5, 3, 1][i] || 0,
        lastUsedAt: now - i * 3600000,
        createdAt: now - i * 86400000,
        updatedAt: now,
        ext: 'png',
        bytes: fs.statSync(path.join(MATDIR, m.file)).size,
        w: m.w,
        h: m.h,
      }
    })
    fs.writeFileSync(path.join(D, 'phrases', 'images.json'), JSON.stringify({ version: 1, images }), 'utf8')
    fs.writeFileSync(
      path.join(D, 'phrases', 'phrases.json'),
      JSON.stringify({
        version: 2,
        groups: ['售前', '安装', '使用', '售后', '其他'],
        phrases: [
          ['你好，请问需要什么帮助？', '售前', true, 42],
          ['这款支持 7 天无理由退货，运费我们承担', '售前', false, 18],
          ['远程协助需要先安装 AnyDesk，装好把 9 位连接码发我', '安装', false, 12],
          ['按 F2 打开设置，「行为」里可以调整展开方式', '使用', false, 7],
          ['发票会在 3 个工作日内发到你的邮箱，注意查收', '售后', false, 11],
          ['辛苦啦，有问题随时找我', '', false, 3],
        ].map(([text, category, favorite, useCount], i) => ({
          id: `p${i}`,
          text,
          category,
          favorite,
          useCount,
          lastUsedAt: now - i * 7200000,
          createdAt: now - i * 86400000,
          updatedAt: now,
        })),
      }),
      'utf8'
    )

    // ---------------- 现在才加载主进程 ----------------
    app.setPath('userData', PROFILE)
    require(path.join(PROJ, 'dist-electron', 'main.js'))

    // ---- 工具 ----
    const pillRect = async (win) => {
      const r = await win.webContents.executeJavaScript(
        `(() => { const p = document.querySelector('.pill'); if (!p) return 'null'; const r = p.getBoundingClientRect();
          return JSON.stringify({ x: Math.max(0, Math.round(r.x) - 6), y: Math.max(0, Math.round(r.y) - 6), width: Math.round(r.width) + 12, height: Math.round(r.height) + 12 }) })()`
      )
      return r === 'null' ? null : JSON.parse(r)
    }
    const moveTo = (win, x, y) =>
      win.webContents.executeJavaScript(
        `window.dispatchEvent(new MouseEvent('mousemove', { clientX: ${x}, clientY: ${y}, bubbles: true }))`
      )
    async function expand(win) {
      const c = JSON.parse(
        await win.webContents.executeJavaScript(
          `(() => { const p = document.querySelector('.pill'); const r = p.getBoundingClientRect();
            return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }) })()`
        )
      )
      await moveTo(win, c.x, c.y)
      await sleep(2400)
    }
    async function switchCard(win, kw) {
      const ok = await win.webContents.executeJavaScript(
        `(() => { const cards = [...document.querySelectorAll('.deck .card')];
          const t = cards.find(c => (c.textContent || '').includes(${JSON.stringify(kw)})); if (!t) return false; t.click(); return true })()`
      )
      await sleep(1700)
      return ok
    }
    async function shot(win, name, opts = {}) {
      const b = win.getBounds()
      win.setSize(b.width + 2, b.height + 2)
      await sleep(420)
      win.setSize(b.width, b.height)
      await sleep(opts.settle || 900)
      await win.webContents.capturePage()
      await sleep(320)
      const img = opts.rect ? await win.webContents.capturePage(opts.rect) : await win.webContents.capturePage()
      fs.writeFileSync(path.join(OUT, name), img.toPNG())
      log(`  ${name}  ${img.getSize().width}x${img.getSize().height}`)
    }

    await sleep(4500)
    const win = BrowserWindow.getAllWindows()[0]
    win.setPosition(120, 80) // 必须在屏幕内，否则通知态不弹
    win.show()
    win.focus()
    await sleep(2500)

    log('')
    log('岛内应用（效率）：')
    await expand(win)
    const cards = await win.webContents.executeJavaScript(
      `(() => [...document.querySelectorAll('.deck .card')].map(c => (c.textContent || '').trim().slice(0, 10)))()`
    )
    log('  卡片:', JSON.stringify(cards))

    if (!(await switchCard(win, '常用语'))) throw new Error('切不到常用语卡片：' + JSON.stringify(cards))
    await shot(win, 'app-phrases.png', { rect: await pillRect(win) })

    await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelectorAll('.seg button'); if (b[1]) b[1].click(); return true })()`
    )
    await sleep(1600)
    await shot(win, 'app-images.png', { rect: await pillRect(win) })

    if (!(await switchCard(win, '剪贴板'))) throw new Error('切不到剪贴板卡片')
    clipboard.clear()
    await sleep(400)
    for (const t of [
      '张三\n13800138000\n广东省深圳市南山区科技园路1号',
      'SF1234567890123',
      '13800138000',
      '今晚八点上门安装，麻烦留人在家',
      'https://github.com/PrintzZZ/dynamic-island',
    ]) {
      clipboard.writeText(t)
      await sleep(480)
    }
    await sleep(1000)
    await win.webContents.executeJavaScript(
      `(() => { const s = document.querySelector('.notice-slot'); if (s) s.click(); return true })()`
    )
    await sleep(800)
    await expand(win)
    await shot(win, 'app-clipboard.png', { rect: await pillRect(win) })

    await win.webContents.executeJavaScript(
      `(() => { const r = document.querySelector('.clip-item'); if (r) r.click(); return !!r })()`
    )
    await sleep(700)
    await shot(win, 'clipboard-copied.png', { rect: await pillRect(win) })

    // ---- 时间应用：紧凑态 / 展开态 / 截图弱提示 ----
    log('')
    log('岛（时间应用）：')
    win.webContents.send('island:switch-app', 'time')
    await sleep(2000)
    await moveTo(win, 5, 5)
    await sleep(2000)
    await shot(win, 'island-compact.png', { rect: await pillRect(win) })

    await expand(win)
    await shot(win, 'island-expanded.png', { rect: await pillRect(win) })
    await moveTo(win, 5, 5)
    await sleep(1800)

    clipboard.clear()
    await sleep(400)
    clipboard.writeImage(nativeImage.createFromPath(path.join(MATDIR, 'shot0.png')))
    await sleep(1300)
    const notice = await win.webContents.executeJavaScript(
      `(() => { const s = document.querySelector('.notice-slot'); return s ? s.innerText.replace(/\\n/g, ' / ') : null })()`
    )
    log('  截图弱提示:', notice || '未出现')
    if (notice) await shot(win, 'island-notice.png', { rect: await pillRect(win), settle: 300 })
    await moveTo(win, 5, 5)
    await sleep(600)

    // ---- 设置窗口 ----
    log('')
    log('设置窗口：')
    win.webContents.executeJavaScript('window.api.openSettings()')
    await sleep(3200)
    const sw = BrowserWindow.getAllWindows().find((w) => w !== win && !w.isDestroyed())
    if (!sw) throw new Error('设置窗口没打开')
    sw.setPosition(200, 120)
    sw.show()
    sw.focus()
    await sleep(1500)
    await sw.webContents.executeJavaScript(
      `(() => { for (const b of document.querySelectorAll('button')) { if (b.textContent.trim().startsWith('常用')) { b.click(); return true } } return false })()`
    )
    await sleep(1600)
    await shot(sw, 'settings-collect.png')
    await sw.webContents.executeJavaScript(
      `(() => { const b = document.querySelectorAll('.cl-seg button'); if (b[1]) b[1].click(); return true })()`
    )
    await sleep(1700)
    await shot(sw, 'settings-collect-images.png')

    for (const [kw, name] of [
      ['常规', 'settings-general.png'],
      ['外观', 'settings-appearance.png'],
      ['应用', 'settings-apps.png'],
    ]) {
      const ok = await sw.webContents.executeJavaScript(
        `(() => { for (const b of document.querySelectorAll('button')) { if (b.textContent.trim().startsWith(${JSON.stringify(kw)})) { b.click(); return true } } return false })()`
      )
      await sleep(1300)
      log(`  ${kw}: ${ok}`)
      await shot(sw, name)
    }

    log('')
    log('完成。输出目录：', OUT, WRITE ? '（已直接写入 docs/images）' : '（加 --write 可直接覆盖 docs/images）')
    app.exit(0)
  } catch (e) {
    console.error('FAIL', e && e.stack)
    app.exit(1)
  }
})
