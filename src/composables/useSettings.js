// 渲染进程侧设置镜像。
//
// 所有设置都存在主进程的 userData/settings.json（见 electron/settings.js），
// 这里只做三件事：
//   1. 启动时 hydrate 一次，之后本地读，事件回调里同步可用；
//   2. 任何字段被改动就自动发回主进程（乐观更新，不回读）；
//   3. 主进程广播 settings:changed 时反向同步（两个窗口同时开着也不打架）。
import { reactive, readonly } from 'vue'

export const DEFAULTS = {
  // 常规
  autostart: false,
  showOnStart: true,
  startPosition: 'last',
  displayId: 'auto',
  closeAction: 'tray',
  // 外观
  theme: 'dark',
  animation: 'full',
  visualEffect: 'standard',
  defaultApp: 'time',
  // 行为
  hoverExpand: true,
  autoCollapse: true,
  escCollapse: true,
  docked: false,
  notifySeconds: 6,
  notifyLink: true,
  notifyTimer: true,
  notifyReminder: true,
  // 卡片滑动提示（灵动岛的卡片堆栈右侧还有卡时的引导提示）
  cardHintOff: false,
  cardHintSwipes: 0,
  // 音效
  soundEnabled: null,
  volume: 70,
  sfxExpand: true,
  sfxStart: true,
  sfxDone: true,
  sfxRemind: true,
  // 应用
  enabledApps: { time: true, efficiency: true, music: true, collect: true, system: true },
  enabledSubs: {
    clock: true,
    countdown: true,
    reminder: true,
    focus: true,
    todo: true,
    notes: true,
    clipboard: true,
    phrases: true,
    'material-box': true,
    net: true,
  },
  clipboardEnabled: true,
  clipboardLimit: 60,
  clipDedupe: 'move-top',
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
  musicPlayer: 'auto',
  musicLyricPill: true,
  musicLyricOnline: true,
  musicLyricNetease: true,
  musicLyricQQ: true,
  musicArmed: false,
  // 材料箱
  mboxOpenAfterZip: true,
  mboxSaveDir: 'auto',
  mboxSameName: 'rename',
  // 内部
  seeded: false,
  lastX: null,
  lastY: null,
}

// 「恢复默认设置」只重置这些键；内部标记与窗口位置保留
export const PREF_KEYS = Object.keys(DEFAULTS).filter(
  (k) => !['seeded', 'lastX', 'lastY'].includes(k)
)

// 判断「是不是全默认」时要额外忽略的键。
// cardHintSwipes 是使用计数而不是用户偏好：用户正常滑几下卡片不该把
// 「恢复默认设置」点亮。但它仍留在 PREF_KEYS 里 —— 真的恢复默认时应该一起清零。
// musicArmed 同理（音乐 helper 是否已经按需拉起过）；不过它在主进程的 reset() 里
// 和窗口位置一样被保留，否则正在用音乐的人会突然丢掉歌词条。
const USAGE_KEYS = ['cardHintSwipes', 'musicArmed']

// systemDark 不进 DEFAULTS：它来自主进程的 nativeTheme，不是用户设置
const state = reactive({ ...DEFAULTS, ready: false, systemDark: true })

// 卡片滑动提示：用户自己滑动满这个次数就不再提示。
// 岛内提示（CardCarousel）和设置面板的说明都用它，避免两边各写一份。
export const CARD_HINT_LIMIT = 3

const hasApi = () => typeof window !== 'undefined' && window.api && window.api.settingsGet

export const settings = readonly(state)

function applyLocal(next) {
  for (const k of Object.keys(DEFAULTS)) {
    if (k in next) state[k] = next[k]
  }
}

// 首次启动：把老的 island.sound 值播种进 settings.json
function seedLegacySound() {
  if (state.seeded) return null
  try {
    const legacy = localStorage.getItem('island.sound')
    if (legacy === '0' || legacy === '1') return { soundEnabled: legacy !== '0', seeded: true }
  } catch {
    /* ignore */
  }
  return null
}

export async function hydrate() {
  if (!hasApi()) {
    state.ready = true
    return state
  }
  try {
    const s = await window.api.settingsGet()
    applyLocal(s)
    const seed = seedLegacySound()
    if (seed) await update(seed)
    await readSystemTheme()
  } catch {
    /* 读不到就用默认值跑 */
  }
  state.ready = true
  return state
}

async function readSystemTheme() {
  if (!hasApi() || !window.api.settingsSystemTheme) return
  try {
    const dark = await window.api.settingsSystemTheme()
    if (typeof dark === 'boolean') state.systemDark = dark
  } catch {
    /* ignore */
  }
}

export async function update(patch) {
  applyLocal(patch)
  if (!hasApi()) return
  try {
    const next = await window.api.settingsSet(patch)
    if (next) applyLocal(next)
  } catch {
    /* ignore */
  }
}

export async function resetAll() {
  if (!hasApi()) {
    applyLocal({ ...DEFAULTS })
    return
  }
  try {
    const next = await window.api.settingsReset()
    if (next) applyLocal(next)
  } catch {
    /* ignore */
  }
}

// 主进程广播（例如另一个窗口改了设置 / 系统换了浅深色）
export function listen() {
  if (!hasApi()) return
  if (window.api.onSettingsChanged) window.api.onSettingsChanged((s) => applyLocal(s))
  if (window.api.onSystemTheme) {
    window.api.onSystemTheme((dark) => {
      if (typeof dark === 'boolean') state.systemDark = dark
    })
  }
}

// ---------- 派生 ----------
// 主题：深色固定深色；跟随系统则看 Windows 的浅色/深色。
// 灵动岛本身永远纯黑（它模拟的是 iPhone 的灵动岛），主题影响的是设置窗口。
export function effectiveTheme() {
  if (state.theme === 'dark') return 'dark'
  return state.systemDark ? 'dark' : 'light'
}
export function soundOn() {
  return state.soundEnabled !== false
}
export function volumeGain() {
  return Math.max(0, Math.min(1, Number(state.volume) / 100))
}

// 动画强度：岛内形变用。0 表示不做过渡（直接到位）
export function motionScale() {
  if (state.animation === 'off') return 0
  return state.animation === 'simple' ? 0.55 : 1
}
export function motionEnabled() {
  return state.animation !== 'off'
}

// 通知总闸：按来源判断该不该弹条（提示音另算，不受这里影响）
export function notifyAllowed(source) {
  if (source === 'clipboard') return state.notifyLink !== false
  if (source === 'countdown' || source === 'timer') return state.notifyTimer !== false
  if (source === 'reminder') return state.notifyReminder !== false
  return true
}

// 分项提示音开关
const SFX_GATE = {
  expand: 'sfxExpand',
  collapse: 'sfxExpand',
  dock: 'sfxExpand',
  undock: 'sfxExpand',
  switchApp: 'sfxExpand',
  start: 'sfxStart',
  alarm: 'sfxDone',
  notice: 'sfxRemind',
  tick: null, // 轻反馈始终允许
}
export function sfxAllowed(name) {
  // 总开关 + 音量都为 0 时一律不出声
  if (!soundOn() || volumeGain() <= 0) return false
  const key = SFX_GATE[name]
  if (!key) return true
  return state[key] !== false
}

// 一级模块是否启用
export function moduleEnabled(id) {
  return state.enabledApps?.[id] !== false
}

// 单个「小功能」是否启用（多模式应用下就是应用内部的模式，其余就是应用本身）
export function subEnabled(id) {
  return state.enabledSubs?.[id] !== false
}

// 可独立启停的条目目录：id → { module, name }
export const SUB_ITEMS = {
  clock: { module: 'time', name: '日常时间' },
  countdown: { module: 'time', name: '倒计时' },
  reminder: { module: 'time', name: '提醒' },
  focus: { module: 'time', name: '专注' },
  notes: { module: 'efficiency', name: '便签' },
  todo: { module: 'efficiency', name: '待办' },
  phrases: { module: 'efficiency', name: '常用语' },
  clipboard: { module: 'efficiency', name: '剪贴板' },
  'material-box': { module: 'collect', name: '材料箱' },
  net: { module: 'system', name: '网速' },
  music: { module: 'music', name: '音乐' },
}

// 某个模块下还有几个条目是启用的（用来判断整个模块是不是「空」了）
export function enabledSubCount(moduleId) {
  return Object.entries(SUB_ITEMS).filter(([id, s]) => s.module === moduleId && subEnabled(id)).length
}

// 是否全部都是默认值（用于「恢复默认设置」置灰）
export function isAllDefault() {
  return PREF_KEYS.filter((k) => !USAGE_KEYS.includes(k)).every(
    (k) => JSON.stringify(state[k]) === JSON.stringify(DEFAULTS[k])
  )
}

// 当前显示器列表（多显示器时给设置面板用）
export async function listDisplays() {
  if (!hasApi() || !window.api.settingsDisplays) return []
  try {
    return (await window.api.settingsDisplays()) || []
  } catch {
    return []
  }
}

// 素材箱/剪贴板等子设置页需要的枚举
export const ENUMS = {
  clipLimits: [20, 40, 60, 100, 200],
  notifySeconds: [5, 6, 7, 10],
  repeatCounts: ['off', 1, 3, 'unlimited'],
  repeatIntervals: [30, 60, 300],
  saveDirs: ['auto', 'desktop', 'downloads'],
}

export function useSettings() {
  return {
    settings,
    update,
    resetAll,
    hydrate,
    listen,
    isAllDefault,
    sfxAllowed,
    soundOn,
    volumeGain,
    motionEnabled,
    motionScale,
    notifyAllowed,
    moduleEnabled,
    subEnabled,
    listDisplays,
    effectiveTheme,
  }
}
