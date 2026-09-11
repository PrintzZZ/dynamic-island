const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Menu,
  Tray,
  nativeImage,
  clipboard,
  shell,
} = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
// 用 import 而不是 require：入口按 ESM 解析，只有 import 才会被 Rollup 打进产物，
// require('./xxx') 会被原样保留成运行期调用，打包后就找不到文件了。
import * as mbox from './materialbox.js'

// 允许渲染进程在无用户手势下播放 Web Audio 音效
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// 单实例锁，避免重复开启多个灵动岛
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// 固定窗口尺寸：比展开态胶囊略大，用于容纳投影与点击穿透。
// 高度额外留了余量：形变用 back.out 缓动，展开途中胶囊高度会"过冲"到 ~524px，
// 窗口不够高的话，弹起来的一瞬间会被下边缘裁掉。形变全部在渲染进程内用 GSAP 完成。
const WIN = { width: 424, height: 560 }

let win = null
let tray = null
let docked = false
let soundOn = true

// ---------- 网速采样：netstat -e 增量统计 ----------
// 每秒 spawn 一次 netstat（约 140ms），取首行「字节」累计收发值做差分；
// 仅在「网速为当前应用 且 窗口可见」时轮询，窗口隐藏到托盘即停止。
let netSched = null
let netPending = false
let netPrev = null // { t, rx, tx }
let netCur = { down: 0, up: 0 }
let netWanted = false // 渲染进程上报：网速是否当前活跃应用
let netVisible = false // 窗口是否可见

// 解析 netstat -e：第一行含 >=2 个数字的行即「字节」行（兼容中英文系统）
function netParse(text) {
  for (const ln of text.split(/\r?\n/)) {
    const m = ln.match(/\d+/g)
    if (m && m.length >= 2) return [parseInt(m[0], 10), parseInt(m[1], 10)]
  }
  return null
}

function netApply(rx, tx) {
  const now = Date.now()
  const p = netPrev
  netPrev = { t: now, rx, tx }
  if (!p) return
  const dt = now - p.t
  if (dt < 200 || dt > 3000) return // 跳过暂停/异常间隔
  if (rx < p.rx || tx < p.tx) return // 计数器重置
  const down = ((rx - p.rx) * 1000) / dt
  const up = ((tx - p.tx) * 1000) / dt
  // 一阶指数平滑，抑制瞬时抖动
  netCur.down = netCur.down ? netCur.down * 0.5 + down * 0.5 : down
  netCur.up = netCur.up ? netCur.up * 0.5 + up * 0.5 : up
}

function netEmit() {
  if (win && !win.isDestroyed() && win.isVisible()) {
    win.webContents.send('net:stats', {
      down: Math.max(0, Math.round(netCur.down)),
      up: Math.max(0, Math.round(netCur.up)),
      t: Date.now(),
    })
  }
}

function netPoll() {
  return new Promise((resolve) => {
    if (netPending) return resolve()
    netPending = true
    let child
    try {
      child = spawn('netstat', ['-e'], { windowsHide: true })
    } catch {
      netPending = false
      return resolve()
    }
    let out = ''
    child.stdout.on('data', (d) => {
      out += d.toString('latin1')
    })
    const done = () => {
      netPending = false
      const nums = netParse(out)
      if (nums) netApply(nums[0], nums[1])
      netEmit()
      resolve()
    }
    child.on('error', () => {
      netPending = false
      resolve()
    })
    child.on('close', done)
  })
}

// 启停调度：仅在 netWanted && netVisible 时保持 ~1Hz 循环
function netTick() {
  if (!netWanted || !netVisible) {
    netStop()
    return
  }
  if (netSched) return
  netSched = setTimeout(async () => {
    netSched = null
    await netPoll()
    if (netWanted && netVisible) netTick()
    else netStop()
  }, 860)
}

function netStart() {
  netPrev = null
  netTick()
}

function netStop() {
  if (netSched) {
    clearTimeout(netSched)
    netSched = null
  }
}

// ---------- 剪贴板历史 ----------
// 轮询 system clipboard，做去重 + 上限的历史队列；识别出 http(s) 链接时
// 一并把 url 存进条目，渲染进程据此在右侧给出「一键跳转」按钮。
const CLIP_MAX = 60
const CLIP_POLL_MS = 700
let clipItems = []
let clipLast = ''
let clipTimer = null
let clipSaveTimer = null

function clipStorePath() {
  return path.join(app.getPath('userData'), 'clipboard-history.json')
}

function clipLoad() {
  try {
    const raw = JSON.parse(fs.readFileSync(clipStorePath(), 'utf8'))
    if (Array.isArray(raw)) {
      clipItems = raw
        .filter((x) => x && typeof x.text === 'string')
        .slice(0, CLIP_MAX)
        .map((x) => ({
          id: String(x.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
          text: x.text,
          url: typeof x.url === 'string' ? x.url : clipExtractUrl(x.text),
          at: Number(x.at) || Date.now(),
        }))
    }
  } catch {
    clipItems = []
  }
}

function clipWriteNow() {
  try {
    fs.writeFileSync(clipStorePath(), JSON.stringify(clipItems))
  } catch (err) {
    console.error('保存剪贴板历史失败：', err)
  }
}

// 退出前强制落盘，避免最后 400ms 内的复制记录丢失
function clipFlush() {
  if (clipSaveTimer) {
    clearTimeout(clipSaveTimer)
    clipSaveTimer = null
  }
  clipWriteNow()
}

function clipSave() {
  if (clipSaveTimer) return
  clipSaveTimer = setTimeout(() => {
    clipSaveTimer = null
    clipWriteNow()
  }, 400)
}

// 取文本里第一个 http(s) 链接，并剥掉结尾常见的标点
function clipExtractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"'`]+/i)
  if (!m) return null
  const url = m[0].replace(/[.,;:!?，。；：！？）)】\]}》>'"”’]+$/, '')
  return url || null
}

function clipPush(text) {
  const t = String(text || '').trim()
  if (!t) return
  const dup = clipItems.findIndex((x) => x.text === t)
  if (dup !== -1) clipItems.splice(dup, 1)
  const item = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    text: t,
    url: clipExtractUrl(t),
    at: Date.now(),
  }
  clipItems.unshift(item)
  if (clipItems.length > CLIP_MAX) clipItems.length = CLIP_MAX
  clipSave()
  if (win && !win.isDestroyed()) win.webContents.send('clipboard:new', item)
}

function clipPoll() {
  let text = ''
  try {
    text = clipboard.readText()
  } catch {
    return
  }
  if (!text || text === clipLast) return
  clipLast = text
  clipPush(text)
}

function clipStart() {
  if (clipTimer) return
  clipTimer = setInterval(clipPoll, CLIP_POLL_MS)
}

// 取窗口所在显示器的可用区域（支持多显示器拖拽）
function workAreaFor(target) {
  const d = screen.getDisplayMatching(target.getBounds())
  return d.workArea
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const x = workArea.x + Math.round((workArea.width - WIN.width) / 2)
  const y = workArea.y

  win = new BrowserWindow({
    width: WIN.width,
    height: WIN.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // 初始为鼠标穿透：透明区域不阻挡点击，仅转发 mousemove 用于命中检测
  win.setIgnoreMouseEvents(true, { forward: true })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => win.show())
  win.on('show', () => {
    netVisible = true
    if (netWanted) netStart()
  })
  win.on('hide', () => {
    netVisible = false
    netStop()
  })
  win.on('closed', () => {
    win = null
    netVisible = false
    netStop()
  })
}

function showIsland() {
  if (!win) return
  win.setOpacity(1)
  win.show()
  win.setAlwaysOnTop(true)
}

function hideIsland() {
  if (!win) return
  // 三重保险：穿透 + 透明 + 隐藏，规避 Windows 透明窗口 hide 后仍复现的问题
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setOpacity(0)
  win.hide()
}

// 系统托盘：隐藏到托盘后从此恢复
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../build/icon.png'))
  const resized = icon.resize({ width: 16, height: 16 })
  tray = new Tray(resized)
  tray.setToolTip('DynamicIsland 灵动岛')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示灵动岛', click: () => showIsland() },
      { type: 'separator' },
      { label: '退出灵动岛', click: () => app.quit() },
    ])
  )
  // Windows：单击托盘图标恢复灵动岛
  tray.on('click', () => showIsland())
}

// 原生菜单被点过具体项 → 说明用户是在"操作岛"，
// 此时菜单关闭后不该顺手把岛收起来（否则刚打开的面板/弹窗会立刻被收起）
let menuActionTaken = false

function markMenuActions(template) {
  return template.map((item) =>
    typeof item.click === 'function'
      ? {
          ...item,
          click: (...args) => {
            menuActionTaken = true
            return item.click(...args)
          },
        }
      : item
  )
}

function showMenu() {
  if (!win) return
  menuActionTaken = false
  const menu = Menu.buildFromTemplate(
    markMenuActions([
      {
        label: '便签',
        click: () => win.webContents.send('island:switch-app', 'notes'),
      },
      {
        label: '待办',
        click: () => win.webContents.send('island:switch-app', 'todo'),
      },
      {
        label: '时间',
        click: () => win.webContents.send('island:switch-app', 'time'),
      },
      {
        label: '常用语',
        click: () => win.webContents.send('island:switch-app', 'phrases'),
      },
      {
        label: '网速',
        click: () => win.webContents.send('island:switch-app', 'net'),
      },
      {
        label: '剪贴板',
        click: () => win.webContents.send('island:switch-app', 'clipboard'),
      },
      {
        label: '材料箱',
        click: () => win.webContents.send('island:switch-app', 'material-box'),
      },
      { type: 'separator' },
      {
        label: '吸附顶部',
        type: 'checkbox',
        checked: docked,
        click: () => win.webContents.send('island:menu-dock'),
    },
    {
      label: '音效',
      type: 'checkbox',
      checked: soundOn,
      click: () => win.webContents.send('island:menu-sound'),
    },
    { type: 'separator' },
    { label: '隐藏到托盘', click: () => hideIsland() },
    { label: '退出灵动岛', click: () => app.quit() },
    ])
  )
  menu.popup({ window: win, callback: () => notifyMenuClosed() })
}

// 原生菜单弹出期间，渲染进程收不到 mousemove，`hovering` 会一直停在 true，
// 于是菜单关掉之后岛再也不会自动收起。这里在菜单关闭时把光标位置回传，
// 让渲染进程重新做一次命中检测；keepOpen 表示用户点了具体菜单项（在操作岛），
// 这种情况不要顺手把岛收起来。
function notifyMenuClosed() {
  if (!win || win.isDestroyed()) return
  const keepOpen = menuActionTaken
  menuActionTaken = false
  try {
    const p = screen.getCursorScreenPoint()
    const b = win.getBounds()
    win.webContents.send('island:menu-closed', { x: p.x - b.x, y: p.y - b.y, keepOpen })
  } catch {
    win.webContents.send('island:menu-closed', { keepOpen })
  }
}

app.whenReady().then(() => {
  createWindow()

  // 剪贴板历史：先读磁盘缓存，再以当前剪贴板为基准监听"新复制"
  clipLoad()
  try {
    clipLast = clipboard.readText()
  } catch {
    clipLast = ''
  }
  clipStart()

  // 材料箱：加载 userData/material-box.json，并校验一次文件路径是否还有效
  mbox.init(win)

  // 渲染进程按悬停状态动态切换鼠标穿透
  ipcMain.on('island:clickthrough', (e, ignore) => {
    if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true })
  })

  // 返回窗口当前位置 + 所在显示器可用区域，供吸附计算
  ipcMain.handle('island:get-window-state', () => {
    if (!win) return null
    const { x, y } = win.getBounds()
    return { x, y, workArea: workAreaFor(win) }
  })

  // 移动窗口（拖动 / 吸附）
  ipcMain.on('island:move-to', (e, x, y) => {
    if (win) win.setPosition(Math.round(x), Math.round(y))
  })

  // 渲染进程上报吸附状态，用于菜单勾选
  ipcMain.on('island:set-dock', (e, value) => {
    docked = !!value
  })

  // 渲染进程上报音效开关状态，用于菜单勾选
  ipcMain.on('island:set-sound', (e, value) => {
    soundOn = !!value
  })

  // 网速应用是否活跃：活跃且窗口可见时才开始采样
  ipcMain.on('net:set-active', (e, value) => {
    netWanted = !!value
    if (netWanted && netVisible) netStart()
    else if (!netWanted) netStop()
  })

  // 剪贴板历史：读取 / 复制 / 打开链接 / 删除 / 清空
  ipcMain.handle('clipboard:get', () => clipItems)

  ipcMain.handle('clipboard:copy', (e, text) => {
    const t = String(text || '')
    if (!t) return false
    clipboard.writeText(t)
    // 同步基准值，避免这次"程序内复制"又被轮询当成新记录
    clipLast = t
    const idx = clipItems.findIndex((x) => x.text === t.trim())
    if (idx > 0) {
      const [item] = clipItems.splice(idx, 1)
      item.at = Date.now()
      clipItems.unshift(item)
      clipSave()
    }
    return true
  })

  // 一键跳转：只放行 http(s)，避免被当成任意协议的命令执行
  ipcMain.handle('clipboard:open', (e, url) => {
    let parsed
    try {
      parsed = new URL(String(url || ''))
    } catch {
      return false
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    shell.openExternal(parsed.toString())
    return true
  })

  ipcMain.handle('clipboard:remove', (e, id) => {
    const i = clipItems.findIndex((x) => x.id === id)
    if (i === -1) return false
    clipItems.splice(i, 1)
    clipSave()
    return true
  })

  ipcMain.handle('clipboard:clear', () => {
    clipItems = []
    clipSave()
    return true
  })

  // ---------- 材料箱 ----------
  // Renderer 只拿「路径 + 元数据」，所有真实文件操作都在这里完成
  ipcMain.handle('mbox:get', () => mbox.snapshot())
  ipcMain.handle('mbox:create-task', (e, name, required) => mbox.createTask(name, required))
  ipcMain.handle('mbox:remove-task', (e, id) => mbox.removeTask(id))
  ipcMain.handle('mbox:set-active-task', (e, id) => mbox.setActiveTask(id))
  ipcMain.handle('mbox:clear-task', (e, id) => mbox.clearTask(id))
  ipcMain.handle('mbox:add-paths', (e, paths) => mbox.collectPaths(Array.isArray(paths) ? paths : []))
  ipcMain.handle('mbox:pick-files', () => mbox.pickFiles())
  ipcMain.handle('mbox:pick-folder', (e, title) => mbox.pickFolder(title))
  ipcMain.handle('mbox:remove-file', (e, taskId, fileId) => mbox.removeFile(taskId, fileId))
  ipcMain.handle('mbox:revalidate', () => mbox.revalidate())
  ipcMain.handle('mbox:relocate', (e, taskId, fileId) => mbox.relocate(taskId, fileId))
  ipcMain.handle('mbox:reveal', (e, p) => mbox.revealFile(p))
  ipcMain.handle('mbox:open-path', (e, p) => mbox.revealPath(p))
  ipcMain.handle('mbox:default-dirs', (e, taskId) => {
    const snap = mbox.snapshot()
    return mbox.defaultDirs(snap.tasks.find((t) => t.id === taskId))
  })
  ipcMain.handle('mbox:export-zip', (e, payload) => mbox.exportZip(payload || {}))
  ipcMain.handle('mbox:cancel-zip', () => mbox.cancelZip())
  ipcMain.handle('mbox:copy-to-folder', (e, payload) => mbox.copyToFolder(payload || {}))
  ipcMain.on('mbox:menu', (e, taskId) => mbox.popupMenu(taskId))

  // 隐藏到托盘（关闭按钮）
  ipcMain.on('island:hide', () => hideIsland())

  // 快捷复制：走 Electron 剪贴板，规避渲染进程焦点/权限限制
  ipcMain.handle('island:copy-text', (e, text) => {
    clipboard.writeText(String(text))
    return true
  })

  ipcMain.on('island:menu', () => showMenu())
  ipcMain.on('island:quit', () => app.quit())

  // 退出前把两处「防抖写盘」的待写数据强制落盘，
  // 否则最后几百毫秒内的改动会随进程一起丢掉
  app.on('before-quit', () => {
    try {
      mbox.flush()
    } catch (err) {
      console.error('材料箱落盘失败：', err)
    }
    try {
      clipFlush()
    } catch (err) {
      console.error('剪贴板落盘失败：', err)
    }
  })

  // 系统托盘：独立 try-catch，创建失败也不影响上面已注册的 IPC（尤其 island:hide）
  try {
    createTray()
  } catch (err) {
    console.error('创建系统托盘失败：', err)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
