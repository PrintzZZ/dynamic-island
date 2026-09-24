// 系统媒体会话（SMTC）桥接：常驻 PowerShell helper 的 spawn / 守护 / 解析 / 控制。
//
// helper 是个 300ms 轮询的长驻子进程（单次查询约 1.4ms，见 docs/音乐模块设计.md）。
// 不能每次重新起进程 —— 实测一次起进程要 900ms。
import { app } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { HELPER_SCRIPT } from './helperScript.js'

const PS_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

// 已知的音乐播放器包名（小写子串匹配）
const PLAYER_MATCH = {
  netease: ['cloudmusic', 'netease'],
  qqmusic: ['qqmusic'],
  kugou: ['kugou'],
  spotify: ['spotify'],
  browser: ['chrome', 'msedge', 'firefox', 'brave', 'opera'],
}
const MUSIC_APPS = [
  ...PLAYER_MATCH.netease,
  ...PLAYER_MATCH.qqmusic,
  ...PLAYER_MATCH.kugou,
  ...PLAYER_MATCH.spotify,
  'lx-music',
  'cn.toside.music.desktop',
  'potplayer',
  'foobar2000',
  'musicbee',
  'aimp',
]
// 浏览器里的抖音之类不算"在听歌"，要排掉（实测 Chrome 那条会话标题就是抖音页面）
const NOISE = ['douyin', '抖音']

export const media = {
  sessions: [],
  fallback: null, // helper 报上来的播放器窗口标题（拿不到 SMTC 会话时才用）
  current: null, // 选中的那条会话
  cover: '', // data URI，仅当前曲目有
  coverKey: '',
  at: 0, // 最近一次收到 state 的时刻（本地时钟）
}

let child = null
let scriptPath = ''
let cmdPath = ''
let outBuf = ''
let restartTimer = null
let stopping = false
let restarts = 0
let listener = null

export function setMediaListener(fn) {
  listener = fn
}

function notify() {
  if (listener) {
    try {
      listener()
    } catch {
      /* ignore */
    }
  }
}

// ---------- 选哪条会话 ----------
function appOf(s) {
  return String(s && s.app ? s.app : '').toLowerCase()
}

function isNoise(s) {
  const t = `${s.title || ''} ${s.artist || ''}`.toLowerCase()
  return NOISE.some((n) => t.includes(n))
}

function pickSession(sessions, target) {
  const list = (sessions || []).filter((s) => s && s.app)
  if (!list.length) return null

  if (target && PLAYER_MATCH[target]) {
    for (const key of PLAYER_MATCH[target]) {
      const hit = list.find((s) => appOf(s).includes(key))
      if (hit) return hit
    }
    return null
  }

  // auto：优先已知音乐应用，其次系统认定的当前会话，最后第一条非噪音会话
  const music = list.filter((s) => MUSIC_APPS.some((k) => appOf(s).includes(k)))
  const clean = (arr) => arr.filter((s) => !isNoise(s))
  return (
    clean(music).find((s) => s.playing) ||
    clean(music)[0] ||
    list.find((s) => s.isCur && !isNoise(s)) ||
    clean(list).find((s) => s.playing) ||
    clean(list)[0] ||
    null
  )
}

// ---------- 窗口标题兜底 ----------
// 原版网易云音乐（Win32）根本不注册 SMTC（Lyricify 官方 FAQ 有明确说明，必须靠 InfLink /
// BetterNCM 这类插件），所以一条会话都拿不到时，用 helper 读到的播放器主窗口标题合成一条
// "只有歌名/歌手"的伪会话。
//
// 关键在于 dur=0：index.js 会判定 hasTimeline=false → 自动走本地秒表估算 + 点歌词对轴；
// canPlay/canPause/canNext/canPrev 全 false → 界面不显示播放/切歌按钮（不会出现死按钮）。
// 它没有播放状态，暂停时歌词仍会继续走 —— 这是拿窗口标题做数据源换来的已知代价。
// 一旦真实会话出现，pickSession 优先返回它，兜底自动让位，不需要重启任何东西。
function fallbackSession(fb, target) {
  if (!fb || !fb.title) return null
  const app = appOf(fb)
  if (target && PLAYER_MATCH[target] && !PLAYER_MATCH[target].some((k) => app.includes(k))) {
    return null
  }
  return {
    app,
    status: 'Playing',
    playing: true,
    title: String(fb.title || ''),
    artist: String(fb.artist || ''),
    album: '',
    pos: 0,
    dur: 0,
    lastUpd: 0,
    canPlay: false,
    canPause: false,
    canNext: false,
    canPrev: false,
    canPos: false,
    isCur: false,
    titleOnly: true,
  }
}

// 真实会话优先，但"没有标题的会话"不算数 —— 实测抖音桌面版会注册一条 app 为空、标题也为空的
// 会话，它压掉兜底只会让界面变成"未在播放"。没有兜底时仍然返回它，行为与以前一致。
function resolveCurrent() {
  const target = media.targetOverride || ''
  const real = pickSession(media.sessions, target)
  if (real && String(real.title || '').trim()) return real
  return fallbackSession(media.fallback, target) || real
}

// ---------- 位置补偿 ----------
// SMTC 的 Position 只在播放器更新会话时刷新，本身不够平滑；
// 加上"距上次更新的时间差"才是连续可用的位置（参考 NetSpeed-Dynamic 的做法）。
// 注意：网易云音乐从不上报 timeline（lastUpd 是 1601 年），所以对它这条不生效 —— 那是
// 数据源的根本缺失，只能靠渲染层的估算 + 手动对轴兜底。
export function currentPositionMs() {
  const c = media.current
  if (!c) return 0
  let p = Number(c.pos) || 0
  if (c.playing && Number(c.lastUpd) > 0) {
    const d = Date.now() - Number(c.lastUpd)
    if (d > 0 && d < 86400000) p += d
  }
  return Math.max(0, Math.round(p))
}

// ---------- helper 生命周期 ----------
function ensureScript() {
  try {
    let cur = ''
    try {
      cur = fs.readFileSync(scriptPath, 'utf8')
    } catch {
      /* 首次 */
    }
    if (cur !== HELPER_SCRIPT) fs.writeFileSync(scriptPath, HELPER_SCRIPT, 'utf8')
  } catch (e) {
    console.error('[music] 写 helper 脚本失败:', e && e.message)
  }
}

function scheduleRestart() {
  if (stopping || restartTimer) return
  // 连续重启要退避，避免 helper 一启动就崩时把 CPU 打满
  const delay = Math.min(15000, 800 * Math.pow(2, Math.min(restarts, 4)))
  restarts += 1
  restartTimer = setTimeout(() => {
    restartTimer = null
    spawnHelper()
  }, delay)
}

function spawnHelper() {
  if (stopping || child) return
  try {
    child = spawn(
      PS_EXE,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-CmdFile', cmdPath, '-ParentPid', String(process.pid)],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
  } catch (e) {
    console.error('[music] 启动 helper 失败:', e && e.message)
    child = null
    scheduleRestart()
    return
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', onStdout)
  // helper 的 stderr 只在脚本本身出错时才有内容；收集但不刷屏
  child.stderr.on('data', () => {})
  child.on('error', () => {
    child = null
    scheduleRestart()
  })
  child.on('exit', () => {
    child = null
    if (!stopping) scheduleRestart()
  })
}

function onStdout(chunk) {
  outBuf += chunk
  let i
  while ((i = outBuf.indexOf('\n')) >= 0) {
    const line = outBuf.slice(0, i).trim()
    outBuf = outBuf.slice(i + 1)
    if (line) handleLine(line)
  }
}

function handleLine(line) {
  let msg = null
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (!msg || typeof msg !== 'object') return

  if (msg.kind === 'state') {
    restarts = 0 // 正常收到数据就把退避计数清零
    media.sessions = Array.isArray(msg.sessions) ? msg.sessions : []
    media.fallback = msg.fb && msg.fb.title ? msg.fb : null
    media.at = Date.now()
    media.current = resolveCurrent()
    notify()
    return
  }

  if (msg.kind === 'thumb' && typeof msg.data === 'string' && msg.data) {
    media.cover = `data:image/jpeg;base64,${msg.data}`
    media.coverKey = appOf({ app: msg.app })
    notify()
  }
}

export function startSmtc() {
  if (child) return
  stopping = false
  scriptPath = path.join(app.getPath('userData'), 'smtc-helper.ps1')
  cmdPath = path.join(app.getPath('userData'), 'smtc-cmd.txt')
  ensureScript()
  spawnHelper()
}

export function stopSmtc() {
  stopping = true
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (child) {
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    child = null
  }
}

// 切换跟随的播放器：立刻重选一次，不用等下一个 tick
export function setTargetPlayer(target) {
  media.targetOverride = target === 'auto' ? '' : String(target || '')
  media.current = resolveCurrent()
  notify()
}

// 播放控制：把指令写进文件，helper 下一轮（≤300ms）读到并执行。
// 指令格式是 "cmd|app"：带上我们**选中的**那条会话。否则 helper 只认
// GetCurrentSession()，用户同时挂着浏览器会话（实测 Chrome 的抖音页）时，
// "暂停"会打到浏览器而不是界面上显示的那个播放器。
export function sendMediaCommand(cmd) {
  if (!cmdPath) return false
  if (!['playpause', 'play', 'pause', 'next', 'prev', 'stop'].includes(cmd)) return false
  try {
    const app = appOf(media.current)
    fs.writeFileSync(cmdPath, app ? `${cmd}|${app}` : cmd, 'utf8')
    return true
  } catch (e) {
    console.error('[music] 写控制指令失败:', e && e.message)
    return false
  }
}
