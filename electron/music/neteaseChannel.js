// 网易云静默通道：走 CDP（Chrome DevTools Protocol）。
//
// 为什么需要它：网易云的 SMTC 会话既不上报时间轴、也不声明可写进度
// （实测 pos=0 dur=0 lastUpd=0 canPos=false），所以只走系统媒体会话的客户端
// 既拿不到真实进度、也拖不动它。它的界面是 CEF，只有带
// `--remote-debugging-port=<port>` 启动时才会开这个调试口子。
//
// 这里只做两件"主进程才方便做"的事：
//   1. 探测端口并取到页面列表（Node 的 http 不受 file:// 的 CORS 限制）
//   2. 按调试参数重启网易云（拿 exe 路径要用 PowerShell，Node 读不到别人的 Path）
// 真正的 evaluate / seek 在渲染进程里用原生 WebSocket 做，见 useNeteaseChannel.js。
import http from 'node:http'
import { execFile } from 'node:child_process'

const PAGE_URL = 'orpheus://orpheus/pub/app.html'
const DEFAULT_PORT = 9223

function httpJson(port, path, timeout = 1200) {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    const req = http.get({ host: '127.0.0.1', port, path, timeout }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return finish(null)
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (d) => {
        if (body.length < 512 * 1024) body += d
      })
      res.on('end', () => {
        try {
          finish(JSON.parse(body))
        } catch {
          finish(null)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy()
      finish(null)
    })
    req.on('error', () => finish(null))
  })
}

/**
 * 探测静默通道。
 * 返回 { ok, port, wsUrl, title, reason }：
 *   ok=false 时 reason 是给用户看的一句话（端口没开 / 页面不对 / 请求失败）。
 */
export async function probeNetease(port = DEFAULT_PORT) {
  const p = Number(port) > 0 ? Number(port) : DEFAULT_PORT
  const list = await httpJson(p, '/json/list')
  if (!Array.isArray(list)) {
    return { ok: false, port: p, reason: `端口 ${p} 没有响应（网易云没有以调试参数启动？）` }
  }
  const page = list.find((it) => it && it.type === 'page' && String(it.url || '').split(/[?#]/)[0] === PAGE_URL)
  if (!page) {
    return { ok: false, port: p, reason: '调试端口开着，但没找到网易云的播放页（orpheus://orpheus/pub/app.html）' }
  }
  const wsUrl = String(page.webSocketDebuggerUrl || '')
  // 只连本机回环地址：调试口子暴露在别的地址上属于异常情况，不接受。
  if (!/^ws:\/\/127\.0\.0\.1:\d+\//.test(wsUrl)) {
    return { ok: false, port: p, reason: '调试地址不是本机回环地址，已拒绝连接' }
  }
  return { ok: true, port: p, wsUrl, title: String(page.title || '') }
}

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout }, (err, stdout) => {
      resolve({ ok: !err, out: String(stdout || '').trim(), err: err ? String(err.message || err) : '' })
    })
  })
}

/**
 * 用调试参数重启网易云。这一步会**退出用户正在用的播放器**，
 * 所以只能由用户在设置页显式点按钮触发，绝不自动执行。
 */
export async function relaunchNetease(port = DEFAULT_PORT) {
  const p = Number(port) > 0 ? Number(port) : DEFAULT_PORT
  // 1) 取 exe 路径。Node 读不到别的进程的 Path，交给 PowerShell 问一次。
  const q = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "(Get-Process cloudmusic -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1).Path",
  ])
  const exe = (q.out || '').split(/\r?\n/).map((s) => s.trim()).find((s) => /\.exe$/i.test(s)) || ''
  if (!exe) {
    return { ok: false, reason: '没找到网易云的安装路径（它没在运行？）' }
  }

  // 2) 先温和关闭，再兜底强杀。网易云有单实例锁，不退出的话新参数会被忽略。
  await run('taskkill.exe', ['/IM', 'cloudmusic.exe'], 6000)
  await new Promise((r) => setTimeout(r, 1200))
  const still = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "(Get-Process cloudmusic -ErrorAction SilentlyContinue | Measure-Object).Count",
  ])
  if (Number(still.out) > 0) {
    await run('taskkill.exe', ['/IM', 'cloudmusic.exe', '/F'], 6000)
    await new Promise((r) => setTimeout(r, 1200))
  }

  // 3) 带调试参数拉起
  const { spawn } = await import('node:child_process')
  try {
    spawn(exe, [`--remote-debugging-port=${p}`], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  } catch (e) {
    return { ok: false, reason: `启动网易云失败：${e && e.message ? e.message : e}` }
  }

  // 4) 等端口起来（最多 ~12 秒）
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800))
    const got = await probeNetease(p)
    if (got.ok) return { ok: true, port: p, wsUrl: got.wsUrl }
  }
  return { ok: false, reason: '网易云已重启，但调试端口仍然没起来（可能被安全软件拦了）' }
}
