// 全部设置的主进程侧存储（userData/settings.json）。
//
// 为什么不全放渲染进程的 localStorage：设置面板是**独立窗口**，
// 和灵动岛是两个渲染进程。放主进程才有一份确定共享的真相，
// 启动位置 / 开机自启这类还必须在本进程启动早期就可用。
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export const START_POSITIONS = ['last', 'center']
export const CLOSE_ACTIONS = ['tray', 'quit']
export const NOTICE_SECONDS = [5, 6, 7, 10]
export const THEMES = ['dark', 'system']
export const ANIMATIONS = ['full', 'simple', 'off']
export const VISUAL_EFFECTS = ['standard', 'soft']
export const CLIP_DEDUPE = ['move-top', 'ignore']
export const MBOX_SAVE_DIRS = ['auto', 'desktop', 'downloads']
export const MBOX_SAME_NAME = ['rename', 'ask']
export const TIME_MODES = ['clock', 'countdown', 'reminder', 'focus']
export const MUSIC_PLAYERS = ['auto', 'netease', 'qqmusic', 'kugou', 'spotify', 'browser']
export const REPEAT_COUNTS = ['off', 1, 3, 'unlimited']
export const REPEAT_INTERVALS = [30, 60, 300]

// 可整体启停的一级模块（对应「应用」页的分组）
export const APP_MODULES = {
  time: true, // 时间（日常时间 / 倒计时 / 提醒 / 专注）
  efficiency: true, // 效率（便签 / 待办 / 常用语 / 剪贴板）
  music: true, // 音乐（跟随系统媒体会话，紧凑态显示歌词）
  collect: true, // 收集（材料箱）
  system: true, // 系统（网速）
}

// 可以单独启停的「小功能」。
// 多模式应用（time / efficiency）下就是应用内部的模式，其余就是岛内应用本身。
export const SUB_ITEM_IDS = [
  'clock',
  'countdown',
  'reminder',
  'focus',
  'notes',
  'todo',
  'phrases',
  'clipboard',
  'material-box',
  'net',
  'music',
]

export const DEFAULTS = {
  // ---------- 常规 ----------
  autostart: false, // 开机自动启动
  showOnStart: true, // 启动后显示灵动岛
  startPosition: 'last', // last | center
  displayId: 'auto', // 'auto' 或显示器 id
  closeAction: 'tray', // 展开态 ✕：tray 隐藏到托盘 / quit 直接退出

  // ---------- 外观 ----------
  theme: 'dark', // dark | system
  animation: 'full', // full | simple | off
  visualEffect: 'standard', // standard | soft
  defaultApp: 'time', // 展开时默认打开的应用

  // ---------- 行为 ----------
  hoverExpand: true,
  autoCollapse: true,
  escCollapse: true,
  docked: false,
  notifySeconds: 6, // 通知显示时长（秒）
  notifyLink: true, // 复制链接时提醒
  notifyTimer: true, // 计时结束时提醒
  notifyReminder: true, // 提醒到点时提醒

  // ---------- 卡片滑动提示 ----------
  // 灵动岛的卡片堆栈可以左右拖；展开时给一次"旁边还有卡"的提示。
  //   关掉条件 = 用户明确不再提示，或者自己滑动满 CARD_HINT_LIMIT 次
  cardHintOff: false,
  cardHintSwipes: 0,

  // ---------- 音效 ----------
  // null = 还没初始化过，首次启动用旧的 island.sound 值播种
  soundEnabled: null,
  volume: 70, // 0–100
  sfxExpand: true, // 展开 / 收起
  sfxStart: true, // 计时开始
  sfxDone: true, // 计时完成
  sfxRemind: true, // 提醒

  // ---------- 应用 ----------
  enabledApps: { ...APP_MODULES },
  enabledSubs: Object.fromEntries(SUB_ITEM_IDS.map((k) => [k, true])),

  // 剪贴板
  clipboardEnabled: true,
  clipboardLimit: 60,
  clipDedupe: 'move-top', // move-top | ignore
  clipRemindLink: true,

  // 时间
  timeDefaultMode: 'clock',
  timeWorkStart: '09:00',
  timeWorkEnd: '18:00',
  timeLunchStart: '12:00',
  timeLunchEnd: '13:00',
  timeRepeatCount: 'unlimited',
  timeRepeatInterval: 30,
  timeFocusMinutes: 25,

  // 音乐
  musicPlayer: 'auto', // auto | netease | qqmusic | kugou | spotify | browser
  musicLyricPill: true, // 紧凑态胶囊是否接管显示歌词
  musicLyricOnline: true, // 允许在线找歌词（会把歌名与歌手发到公开歌词库）
  musicLyricNetease: true, // 网易云歌词源（非官方接口，可单独关）
  musicLyricQQ: true, // QQ音乐歌词源（非官方接口，可单独关）
  // 按需启动：是否已经为用户拉起过常驻的 SMTC helper。
  // 它是个 PowerShell 子进程，实测常驻约 100MB，所以没被真正用到之前不启动；
  // 用户第一次展开到音乐面板时置 true，之后每次启动直接恢复。
  // 属于「使用记录」而不是偏好，恢复默认设置时不重置（见 reset 的 keep）。
  musicArmed: false,

  // 材料箱
  mboxOpenAfterZip: true,
  mboxSaveDir: 'auto', // auto | desktop | downloads
  mboxSameName: 'rename', // rename | ask

  // 内部：未初始化标记 + 上次窗口位置
  seeded: false,
  lastX: null,
  lastY: null,
}

function file() {
  return path.join(app.getPath('userData'), 'settings.json')
}

const clamp = (v, lo, hi, dflt) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.min(hi, Math.max(lo, Math.round(n)))
}
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt)
const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt)
const hhmm = (v, dflt) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : dflt)

function sanitize(raw) {
  const s = { ...DEFAULTS, ...(raw || {}) }
  // 常规
  s.autostart = bool(s.autostart, DEFAULTS.autostart)
  s.showOnStart = bool(s.showOnStart, DEFAULTS.showOnStart)
  s.startPosition = oneOf(s.startPosition, START_POSITIONS, DEFAULTS.startPosition)
  s.displayId = typeof s.displayId === 'number' || s.displayId === 'auto' ? s.displayId : 'auto'
  s.closeAction = oneOf(s.closeAction, CLOSE_ACTIONS, DEFAULTS.closeAction)
  // 外观
  s.theme = oneOf(s.theme, THEMES, DEFAULTS.theme)
  s.animation = oneOf(s.animation, ANIMATIONS, DEFAULTS.animation)
  s.visualEffect = oneOf(s.visualEffect, VISUAL_EFFECTS, DEFAULTS.visualEffect)
  s.defaultApp = typeof s.defaultApp === 'string' && s.defaultApp ? s.defaultApp : DEFAULTS.defaultApp
  // 行为
  s.hoverExpand = bool(s.hoverExpand, DEFAULTS.hoverExpand)
  s.autoCollapse = bool(s.autoCollapse, DEFAULTS.autoCollapse)
  s.escCollapse = bool(s.escCollapse, DEFAULTS.escCollapse)
  s.docked = bool(s.docked, DEFAULTS.docked)
  s.notifySeconds = oneOf(Number(s.notifySeconds), NOTICE_SECONDS, DEFAULTS.notifySeconds)
  s.notifyLink = bool(s.notifyLink, DEFAULTS.notifyLink)
  s.notifyTimer = bool(s.notifyTimer, DEFAULTS.notifyTimer)
  s.notifyReminder = bool(s.notifyReminder, DEFAULTS.notifyReminder)
  // 音效
  s.soundEnabled = typeof s.soundEnabled === 'boolean' ? s.soundEnabled : null
  s.volume = clamp(s.volume, 0, 100, DEFAULTS.volume)
  s.sfxExpand = bool(s.sfxExpand, DEFAULTS.sfxExpand)
  s.sfxStart = bool(s.sfxStart, DEFAULTS.sfxStart)
  s.sfxDone = bool(s.sfxDone, DEFAULTS.sfxDone)
  s.sfxRemind = bool(s.sfxRemind, DEFAULTS.sfxRemind)
  // 卡片滑动提示
  s.cardHintOff = bool(s.cardHintOff, DEFAULTS.cardHintOff)
  s.cardHintSwipes = clamp(Number(s.cardHintSwipes) || 0, 0, 9999, DEFAULTS.cardHintSwipes)
  // 应用
  const ea = s.enabledApps && typeof s.enabledApps === 'object' ? s.enabledApps : {}
  s.enabledApps = Object.fromEntries(
    Object.keys(APP_MODULES).map((k) => [k, bool(ea[k], APP_MODULES[k])])
  )
  const es = s.enabledSubs && typeof s.enabledSubs === 'object' ? s.enabledSubs : {}
  s.enabledSubs = Object.fromEntries(SUB_ITEM_IDS.map((k) => [k, bool(es[k], true)]))
  // 剪贴板
  s.clipboardEnabled = bool(s.clipboardEnabled, DEFAULTS.clipboardEnabled)
  s.clipboardLimit = clamp(s.clipboardLimit, 20, 200, DEFAULTS.clipboardLimit)
  s.clipDedupe = oneOf(s.clipDedupe, CLIP_DEDUPE, DEFAULTS.clipDedupe)
  s.clipRemindLink = bool(s.clipRemindLink, DEFAULTS.clipRemindLink)
  // 时间
  s.timeDefaultMode = oneOf(s.timeDefaultMode, TIME_MODES, DEFAULTS.timeDefaultMode)
  s.timeWorkStart = hhmm(s.timeWorkStart, DEFAULTS.timeWorkStart)
  s.timeWorkEnd = hhmm(s.timeWorkEnd, DEFAULTS.timeWorkEnd)
  s.timeLunchStart = hhmm(s.timeLunchStart, DEFAULTS.timeLunchStart)
  s.timeLunchEnd = hhmm(s.timeLunchEnd, DEFAULTS.timeLunchEnd)
  s.timeRepeatCount = REPEAT_COUNTS.includes(s.timeRepeatCount)
    ? s.timeRepeatCount
    : DEFAULTS.timeRepeatCount
  s.timeRepeatInterval = oneOf(Number(s.timeRepeatInterval), REPEAT_INTERVALS, DEFAULTS.timeRepeatInterval)
  s.timeFocusMinutes = clamp(s.timeFocusMinutes, 5, 120, DEFAULTS.timeFocusMinutes)
  // 音乐
  s.musicPlayer = oneOf(s.musicPlayer, MUSIC_PLAYERS, DEFAULTS.musicPlayer)
  s.musicLyricPill = bool(s.musicLyricPill, DEFAULTS.musicLyricPill)
  s.musicLyricOnline = bool(s.musicLyricOnline, DEFAULTS.musicLyricOnline)
  s.musicLyricNetease = bool(s.musicLyricNetease, DEFAULTS.musicLyricNetease)
  s.musicLyricQQ = bool(s.musicLyricQQ, DEFAULTS.musicLyricQQ)
  s.musicArmed = bool(s.musicArmed, DEFAULTS.musicArmed)
  // 材料箱
  s.mboxOpenAfterZip = bool(s.mboxOpenAfterZip, DEFAULTS.mboxOpenAfterZip)
  s.mboxSaveDir = oneOf(s.mboxSaveDir, MBOX_SAVE_DIRS, DEFAULTS.mboxSaveDir)
  s.mboxSameName = oneOf(s.mboxSameName, MBOX_SAME_NAME, DEFAULTS.mboxSameName)
  // 内部
  s.seeded = bool(s.seeded, DEFAULTS.seeded)
  s.lastX = Number.isFinite(s.lastX) ? Math.round(s.lastX) : null
  s.lastY = Number.isFinite(s.lastY) ? Math.round(s.lastY) : null
  return s
}

let cache = null

export function load() {
  if (cache) return cache
  let raw = null
  try {
    raw = JSON.parse(fs.readFileSync(file(), 'utf8'))
  } catch {
    /* 首次运行 / 文件损坏都回退默认值 */
  }
  cache = sanitize(raw)
  return cache
}

function save() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8')
  } catch {
    /* 写盘失败不影响本次会话 */
  }
}

// 同步到系统（目前只有开机自启要真正落到 OS）
export function apply() {
  const s = load()
  try {
    app.setLoginItemSettings({ openAtLogin: s.autostart, path: process.execPath, args: [] })
  } catch {
    /* 未打包运行时可能不支持，忽略 */
  }
}

export function get() {
  return { ...load() }
}

export function set(patch) {
  cache = sanitize({ ...load(), ...(patch || {}), seeded: true })
  save()
  apply()
  return get()
}

export function reset() {
  // 位置与初始化标记保留，其余回默认。**只动偏好**：
  // 便签 / 待办 / 时间统计 / 剪贴板历史 / 材料箱任务都不在这里，不会被碰。
  // musicArmed 是「使用记录」不是偏好：重置掉它会让正在用音乐的人突然丢掉歌词条，
  // 所以和位置一样保留。
  const keep = { lastX: load().lastX, lastY: load().lastY, musicArmed: load().musicArmed }
  cache = sanitize({ ...keep, seeded: true })
  save()
  apply()
  return get()
}

// 记住灵动岛最后停在哪，供「启动位置 = 上次位置」
export function rememberPosition(x, y) {
  const s = load()
  if (s.lastX === Math.round(x) && s.lastY === Math.round(y)) return
  s.lastX = Math.round(x)
  s.lastY = Math.round(y)
  save()
}
