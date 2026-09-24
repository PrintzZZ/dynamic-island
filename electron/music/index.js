// 音乐模块的主进程编排：SMTC 快照 → 歌词/封面 → 广播给渲染进程。
//
// 两个关键设计：
//
// 1) 「有进度」和「没进度」两条路（docs/音乐模块设计.md §4）
//    · 播放器上报 timeline（Chrome / Spotify / Groove）→ 直接用
//      position + (now - lastUpdatedTime)，是真同步；
//    · 不上报（网易云音乐）→ 主进程维护一个本地秒表 est，
//      Playing 走、Paused 停，换歌归零。
//    两条路对外都表示成 {positionMs, positionAt, playing} 这个锚点，
//    渲染层用同一个公式推算"现在唱到哪"。
//
// 2) 手动对轴（B 方案）
//    估算会漂（中途打开、拖动进度条、播放器重启）。渲染层点某句歌词时调
//    music:realign(ms)，把本地秒表的基准挪过去。
import { ipcMain, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import * as settings from '../settings.js'
import {
  media,
  startSmtc,
  stopSmtc,
  setMediaListener,
  setTargetPlayer,
  sendMediaCommand,
  currentPositionMs,
} from './smtc.js'
import { findLyrics, findCover } from './sources.js'

let islandWin = null
let gen = 0 // 曲目变更代数：丢弃换歌之后才回来的旧请求结果
let lastTrackKey = null

// 没有 timeline 的播放器靠这个本地秒表
const est = { base: 0, startedAt: 0, running: false }

function estNow() {
  if (!est.running) return est.base
  return est.base + (Date.now() - est.startedAt)
}
function estSetRunning(playing) {
  if (playing === est.running) return
  if (playing) {
    est.startedAt = Date.now()
    est.running = true
  } else {
    est.base = estNow()
    est.running = false
  }
}
function estReset(playing) {
  est.base = 0
  est.startedAt = Date.now()
  est.running = !!playing
}

function baseSnapshot() {
  return {
    playing: false,
    app: '',
    title: '',
    artist: '',
    album: '',
    durationMs: 0,
    positionMs: 0,
    positionAt: Date.now(),
    hasTimeline: false,
    estimated: false,
    // true = 歌名/歌手来自播放器窗口标题（没有系统媒体会话），控制能力全无
    fallback: false,
    canPlay: false,
    canPause: false,
    canNext: false,
    canPrev: false,
    cover: '',
    lyrics: [],
    lyricSource: '',
    loading: false,
  }
}

let snap = baseSnapshot()

function broadcast() {
  const w = islandWin
  if (!w || w.isDestroyed()) return
  try {
    w.webContents.send('music:changed', snap)
  } catch {
    /* ignore */
  }
}

function controls(c) {
  return {
    canPlay: !!(c && c.canPlay),
    canPause: !!(c && c.canPause),
    canNext: !!(c && c.canNext),
    canPrev: !!(c && c.canPrev),
  }
}

function positionFor(c) {
  const hasTimeline = !!(c && Number(c.dur) > 0)
  return hasTimeline ? currentPositionMs() : estNow()
}

function refreshPosition() {
  const c = media.current
  snap.positionMs = positionFor(c)
  snap.positionAt = Date.now()
  snap.hasTimeline = !!(c && Number(c.dur) > 0)
  snap.estimated = !snap.hasTimeline
}

// 引擎顺序按"当前在放的是哪个播放器"来定。
//
// 起因：LRCLIB 对中文歌常常只收得到繁体（实测"難以忘記 初次見你""故事的小黃花"），
// 而网易云/QQ 给的是和播放器界面上一致的简体。所以优先用播放器自家那家的歌词源，
// 把 LRCLIB 放到最后兜底（它最开放、覆盖最广，但中文曲库偏繁体）。
// 非中文播放器（浏览器等）维持原样：LRCLIB 优先。
function engineOrder(app, s) {
  if (s.musicLyricOnline === false) return []
  const netease = s.musicLyricNetease !== false
  const qq = s.musicLyricQQ !== false
  const a = String(app || '').toLowerCase()
  const list = []
  const add = (k, on) => {
    if (on && !list.includes(k)) list.push(k)
  }
  if (a.includes('cloudmusic') || a.includes('netease')) {
    add('netease', netease)
    add('qq', qq)
    add('lrclib', true)
  } else if (a.includes('qqmusic')) {
    add('qq', qq)
    add('netease', netease)
    add('lrclib', true)
  } else if (a.includes('kugou') || a.includes('kuwo')) {
    add('netease', netease)
    add('qq', qq)
    add('lrclib', true)
  } else {
    add('lrclib', true)
    add('netease', netease)
    add('qq', qq)
  }
  return list
}

async function loadLyricsFor(myGen, title, artist, durationMs, app) {
  const s = settings.load()
  const online = s.musicLyricOnline !== false
  const engines = engineOrder(app, s)
  let res = null
  try {
    res = await findLyrics({ title, artist, durationMs, online, engines })
  } catch {
    res = null
  }
  if (myGen !== gen) return // 已经换歌了
  snap.loading = false
  snap.lyrics = res && res.lines ? res.lines : []
  snap.lyricSource = res && res.source ? res.source : ''
  // 进度总长：播放器不给就借歌词引擎匹配到的那条记录的时长。
  // 实测网易云即使打开了 SMTC 也恒定 pos=0/dur=0（Lyricify FAQ 也这么说），没有这一步
  // 界面永远画不出进度。位置仍是本地秒表估算，所以 estimated 保持 true、界面上标注"估算"。
  if (res && Number(res.durMs) > 0 && !(Number(snap.durationMs) > 0)) {
    snap.durationMs = Number(res.durMs)
  }
  broadcast()
}

async function loadCoverFor(myGen, title, artist) {
  let url = ''
  try {
    url = await findCover({ title, artist })
  } catch {
    url = ''
  }
  if (myGen !== gen) return
  if (url) {
    snap.cover = url
    broadcast()
  }
}

function onMediaChanged() {
  const c = media.current
  const playing = !!(c && c.playing)
  const title = c ? String(c.title || '') : ''
  const artist = c ? String(c.artist || '') : ''
  const key = c ? `${c.app}|${title}|${artist}|${Number(c.dur) || 0}` : ''

  if (key !== lastTrackKey) {
    lastTrackKey = key
    gen += 1
    const my = gen
    estReset(playing)
    snap = {
      ...baseSnapshot(),
      app: c ? String(c.app || '') : '',
      title,
      artist,
      album: c ? String(c.album || '') : '',
      playing,
      durationMs: c ? Number(c.dur) || 0 : 0,
      cover: media.cover || '',
      fallback: !!(c && c.titleOnly),
      ...controls(c),
    }
    refreshPosition()
    snap.loading = !!title
    broadcast()
    if (title) {
      loadLyricsFor(my, title, artist, snap.durationMs, c ? String(c.app || '') : '')
      loadCoverFor(my, title, artist)
    }
    return
  }

  // 同一首：只更新播放状态与位置锚点
  estSetRunning(playing)
  snap.playing = playing
  snap.app = c ? String(c.app || '') : ''
  snap.fallback = !!(c && c.titleOnly)
  Object.assign(snap, controls(c))
  if (media.cover && media.cover !== snap.cover) snap.cover = media.cover
  refreshPosition()
  broadcast()
}

export function attachMusicWindow(win) {
  islandWin = win
}

export function initMusic() {
  setMediaListener(onMediaChanged)
  refreshMusicSettings()
}

export function disposeMusic() {
  stopSmtc()
}

// 设置变了：开关音乐模块、换播放器、改歌词源，都要立刻生效。
// helper 常驻是有成本的（一个 powershell.exe 大约 40MB），所以模块被关掉时就停掉它。
export function refreshMusicSettings() {
  const s = settings.load()
  const on = s.enabledApps?.music !== false && s.enabledSubs?.music !== false
  lastTrackKey = null // 强制造一次曲目变更，重新拉歌词
  gen += 1
  if (!on) {
    stopSmtc()
    snap = baseSnapshot()
    broadcast()
    return
  }
  setTargetPlayer(s.musicPlayer || 'auto')
  startSmtc()
  onMediaChanged()
}

export function registerMusicIpc() {
  ipcMain.handle('music:get', () => snap)

  // 本地歌词目录（用户可以往里放 .lrc 覆盖在线结果）
  ipcMain.handle('music:lyrics-dir', () => {
    const dir = path.join(app.getPath('userData'), 'lyrics')
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {
      /* ignore */
    }
    return dir
  })

  ipcMain.handle('music:open-lyrics-dir', async () => {
    const dir = path.join(app.getPath('userData'), 'lyrics')
    try {
      fs.mkdirSync(dir, { recursive: true })
      await shell.openPath(dir)
      return true
    } catch {
      return false
    }
  })

  ipcMain.on('music:command', (_e, cmd) => {
    sendMediaCommand(String(cmd || ''))
  })

  // 手动对轴：把"现在"钉在某一句的起始时间上
  ipcMain.on('music:realign', (_e, ms) => {
    const v = Math.max(0, Number(ms) || 0)
    est.base = v
    est.startedAt = Date.now()
    snap.positionMs = positionFor(media.current)
    snap.positionAt = Date.now()
    broadcast()
  })
}
