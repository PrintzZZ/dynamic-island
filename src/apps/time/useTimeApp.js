import { computed, reactive, ref, watch } from 'vue'
import { sfx } from '../../utils/sound'
import { island, onNoticeAction, onNoticeDismiss, showNotice, pulsePill } from '../../composables/useIsland'
import { notifyAllowed, settings as appSettings, subEnabled, update } from '../../composables/useSettings'
import { defaultSchedule, durText, hm, normalizeSchedule, workStats } from './worktime'

const STORAGE_KEY = 'island.time.v2' // 继续沿用，靠字段补全做兼容，不丢老数据

// 岛内可显示的四种功能
export const MODES = [
  { id: 'clock', name: '日常时间', icon: 'clock', accent: '#0A84FF' },
  { id: 'countdown', name: '倒计时', icon: 'timer', accent: '#30D158' },
  { id: 'reminder', name: '提醒', icon: 'bell', accent: '#FF9F0A' },
  { id: 'focus', name: '专注', icon: 'focus', accent: '#BF5AF2' },
]

export const MODE_IDS = MODES.map((m) => m.id)

export const COUNTDOWN_PRESETS = [1, 3, 5, 10, 25, 45]
export const FOCUS_PRESETS = [15, 25, 45, 60]
export const BREAK_PRESETS = [3, 5, 10]

// 「多次提醒」策略（见需求 10.4）
export const REPEAT_COUNTS = [
  { id: 'off', label: '关闭' },
  { id: 1, label: '1次' },
  { id: 3, label: '3次' },
  { id: 'unlimited', label: '直到确认' },
]
export const REPEAT_INTERVALS = [
  { sec: 30, label: '30秒' },
  { sec: 60, label: '1分钟' },
  { sec: 300, label: '5分钟' },
]
// 相对时间预设（分钟）
export const RELATIVE_PRESETS = [
  { min: 30, label: '30分钟后' },
  { min: 60, label: '1小时后' },
  { min: 120, label: '2小时后' },
]

// 统计只保留最近这些天，不无限增长
const STATS_KEEP_DAYS = 60

const pad2 = (n) => String(n).padStart(2, '0')

// 兼容旧引用：TimeCompact / 面板都在用
export const toMinutes = hm

// 毫秒 → MM:SS / H:MM:SS
export function fmtMs(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function defaults() {
  return {
    mode: 'clock',
    cd: {
      total: 5 * 60000,
      remaining: 5 * 60000,
      running: false,
      endAt: null,
      finished: false,
      lastTotal: 5 * 60000, // 上一次计时时长，「再来一次」用
    },
    focus: {
      focusMs: 25 * 60000,
      breakMs: 5 * 60000,
      phase: 'focus',
      remaining: 25 * 60000,
      running: false,
      endAt: null,
      rounds: 0,
      taskId: null,
      taskTitle: '',
      stats: {}, // { 'Y-M-D': { minutes, rounds } }
    },
    workSchedule: defaultSchedule(),
    reminders: [],
  }
}

function normalizeReminder(r) {
  const type = r.type === 'once' ? 'once' : 'daily'
  const at = Number(r.at) || 0
  const time =
    typeof r.time === 'string' && /^\d{1,2}:\d{2}$/.test(r.time)
      ? r.time
      : type === 'once' && at
        ? `${pad2(new Date(at).getHours())}:${pad2(new Date(at).getMinutes())}`
        : '09:00'
  const rc = r.repeatCount
  const repeatCount =
    rc === 'off' || rc === 'unlimited' || Number(rc) > 0 ? (rc === 'off' ? 'off' : rc === 'unlimited' ? 'unlimited' : Number(rc)) : r.repeat === false ? 'off' : 'unlimited'
  const ri = Number(r.repeatInterval)
  return {
    id: String(r.id || newId('rem')),
    type,
    time,
    at: type === 'once' ? at : 0,
    label: typeof r.label === 'string' ? r.label : '',
    enabled: r.enabled !== false,
    done: !!r.done,
    repeatCount,
    repeatInterval: [30, 60, 300].includes(ri) ? ri : 30,
    lastFired: typeof r.lastFired === 'string' ? r.lastFired : '',
  }
}

function load() {
  const base = defaults()
  let raw = null
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    /* ignore */
  }
  if (!raw || typeof raw !== 'object') return base

  const s = { ...base, ...raw }
  s.cd = { ...base.cd, ...(raw.cd || {}) }
  s.focus = { ...base.focus, ...(raw.focus || {}) }
  if (!s.focus.stats || typeof s.focus.stats !== 'object') s.focus.stats = {}
  s.workSchedule = normalizeSchedule(raw.workSchedule)
  s.reminders = Array.isArray(raw.reminders)
    ? raw.reminders.filter((r) => r && (typeof r.time === 'string' || Number(r.at))).map(normalizeReminder)
    : []
  if (!MODE_IDS.includes(s.mode)) s.mode = 'clock'
  if (!s.cd.lastTotal) s.cd.lastTotal = s.cd.total

  // 跨重启恢复进行中的计时：以 endAt 为准重新校准
  const t = Date.now()
  if (s.cd.running && typeof s.cd.endAt === 'number') {
    const left = s.cd.endAt - t
    if (left > 0) {
      s.cd.remaining = left
    } else {
      s.cd.remaining = 0
      s.cd.running = false
      s.cd.endAt = null
      s.cd.finished = true
    }
  }
  if (s.focus.running && typeof s.focus.endAt === 'number') {
    const left = s.focus.endAt - t
    if (left > 0) {
      s.focus.remaining = left
    } else {
      // 关岛期间整段跑完：退回到该阶段的起点，等用户手动继续
      s.focus.running = false
      s.focus.endAt = null
      s.focus.remaining = s.focus.phase === 'focus' ? s.focus.focusMs : s.focus.breakMs
    }
  }
  return s
}

// 模块级单例：展开视图与紧凑视图共享同一份状态
const state = reactive(load())

// 设置里被单独关掉的模式不出现在模式切换器里。
// 兜底：全关掉时退回完整列表（否则时间应用会没有任何页可显示）。
// 和 useIsland 的 apps 一样用 ref + watch 显式重建，不依赖模块级 computed 的失效传播。
export const visibleModes = ref(MODES.filter((m) => subEnabled(m.id)))

watch(
  () => JSON.stringify(appSettings.enabledSubs || {}),
  () => {
    const on = MODES.filter((m) => subEnabled(m.id))
    visibleModes.value = on.length ? on : MODES
    // 正在看的模式被关掉 → 落到第一个还开着的
    if (!visibleModes.value.some((m) => m.id === state.mode)) {
      state.mode = visibleModes.value[0].id
      save()
    }
  }
)

// 这个用户之前有没有留下过时间应用的数据？决定设置与岛内状态谁说了算。
const hadStoredState = (() => {
  try {
    return !!localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
})()

// ---------- 设置面板「时间」详情页 ↔ 岛内状态 ----------
// 作息 / 默认模式 / 专注时长这三处两边都能改，规则：
//   · 老用户（本地已有数据）→ 以岛内为准，hydrate 时把现有值回填进设置；
//   · 新用户 → 以设置为准，把默认值灌进 state；
//   · 之后谁改谁生效，值相同就不动，不会来回弹。
function applyScheduleFromSettings() {
  const next = normalizeSchedule({
    ...state.workSchedule,
    start: appSettings.timeWorkStart,
    end: appSettings.timeWorkEnd,
    lunchStart: appSettings.timeLunchStart,
    lunchEnd: appSettings.timeLunchEnd,
  })
  const cur = state.workSchedule
  if (
    cur.start === next.start &&
    cur.end === next.end &&
    cur.lunchStart === next.lunchStart &&
    cur.lunchEnd === next.lunchEnd
  ) {
    return false
  }
  state.workSchedule = next
  save()
  return true
}

function applyModeFromSettings() {
  if (!MODE_IDS.includes(appSettings.timeDefaultMode)) return
  if (state.mode === appSettings.timeDefaultMode) return
  state.mode = appSettings.timeDefaultMode
  save()
}

function applyFocusFromSettings() {
  const fm = Number(appSettings.timeFocusMinutes)
  if (!(fm >= 5 && fm <= 120)) return
  if (state.focus.running) return // 正在跑就别动它
  state.focus.focusMs = fm * 60000
  if (state.focus.phase === 'focus') state.focus.remaining = state.focus.focusMs
  save()
}

// hydrated 之前的变化都是 hydrate 本身写进来的，不当作「用户改动」
let hydrated = false

watch(
  () => appSettings.ready,
  (ready) => {
    if (!ready || hydrated) return
    if (hadStoredState) {
      // 老用户：岛内作息回填到设置，别让默认值把人家改好的作息冲掉
      update({
        timeWorkStart: state.workSchedule.start,
        timeWorkEnd: state.workSchedule.end,
        timeLunchStart: state.workSchedule.lunchStart,
        timeLunchEnd: state.workSchedule.lunchEnd,
      })
    } else {
      applyScheduleFromSettings()
      applyModeFromSettings()
      applyFocusFromSettings()
    }
    hydrated = true
  },
  { immediate: true }
)

watch(
  () => [
    appSettings.timeWorkStart,
    appSettings.timeWorkEnd,
    appSettings.timeLunchStart,
    appSettings.timeLunchEnd,
  ],
  () => {
    if (hydrated) applyScheduleFromSettings()
  }
)
watch(
  () => appSettings.timeDefaultMode,
  () => {
    if (hydrated) applyModeFromSettings()
  }
)
watch(
  () => appSettings.timeFocusMinutes,
  () => {
    if (hydrated) applyFocusFromSettings()
  }
)

// 共享时钟：只在「秒」变化时推进，避免 4Hz 无谓刷新时间类 UI
export const now = ref(Date.now())

// 正在"催"的提醒：{ id, nextAt, repeats }；确认 / 停用 / 催够次数后清空
export const firingReminder = ref(null)

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode,
        cd: { ...state.cd },
        focus: { ...state.focus, stats: { ...state.focus.stats } },
        workSchedule: { ...state.workSchedule },
        reminders: state.reminders.map((r) => ({ ...r })),
      })
    )
  } catch {
    /* ignore */
  }
}

// ---------- 提醒文案 ----------
// 一次性提醒可能不在今天，所以要带上日期
export function reminderWhenText(r, when = new Date(now.value)) {
  if (!r) return ''
  if (r.type !== 'once' || !r.at) return r.time
  const d = new Date(r.at)
  const sameDay = d.toDateString() === when.toDateString()
  if (sameDay) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const tomorrow = new Date(when)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `明天 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function reminderRepeatText(r) {
  if (!r || r.repeatCount === 'off') return '仅提醒一次'
  const cnt = r.repeatCount === 'unlimited' ? '直到确认' : `${r.repeatCount}次`
  const iv = REPEAT_INTERVALS.find((x) => x.sec === r.repeatInterval)
  return `${cnt} · 每${iv ? iv.label : '30秒'}`
}

// ---------- 动效 + 提醒 ----------
// 提醒 / 计时结束的通知条是否弹，由设置面板的「通知选项」决定。
// 注意：提示音和胶囊脉冲在上面，不受这里影响 —— 关掉通知条仍然会响。
const NOTIFY_SOURCE = {
  countdown: 'timer',
  focusEnd: 'timer',
  breakEnd: 'timer',
  reminder: 'reminder',
}

function alert(kind, payload = {}) {
  sfx.alarm()
  pulsePill('end')
  if (!notifyAllowed(NOTIFY_SOURCE[kind] || kind)) return
  if (island.mode !== 'compact' || document.hidden) return
  const table = {
    countdown: {
      icon: 'timer',
      accent: '#30D158',
      title: '倒计时结束',
      detail: payload.detail || '时间到了',
      source: 'countdown',
      // 直接在岛上给出下一步，不用展开应用
      actions: [
        { id: 'again', label: '再来一次', primary: true },
        { id: 'done', label: '完成' },
      ],
    },
    focusEnd: {
      icon: 'focus',
      accent: '#BF5AF2',
      title: '专注完成',
      detail: payload.detail || `休息 ${Math.round(state.focus.breakMs / 60000)} 分钟`,
    },
    breakEnd: {
      icon: 'focus',
      accent: '#30D158',
      title: '休息结束',
      detail: '开始下一轮专注',
    },
    reminder: {
      icon: 'bell',
      accent: '#FF9F0A',
      title: payload.label || '提醒',
      detail: payload.again
        ? `${payload.when} · 还没确认，再提醒一次`
        : payload.when || '',
      ack: true,
      source: 'reminder',
      id: payload.id,
    },
  }
  const spec = table[kind] || table.countdown
  // 已经播过警报音了，通知条不再叠一层提示音。
  // 不传 duration：停留时长统一由设置里的「通知显示时间」决定。
  showNotice({ silent: true, ...spec })
}

function announceStart() {
  sfx.start()
  pulsePill('start')
}

// ---------- 专注统计 ----------
function addFocusStat(minutes, rounds = 0) {
  const k = dayKey()
  const cur = state.focus.stats[k] || { minutes: 0, rounds: 0 }
  cur.minutes += Math.max(0, Math.round(minutes))
  cur.rounds += rounds
  state.focus.stats[k] = cur
  pruneStats()
}

// 只保留最近 STATS_KEEP_DAYS 天，避免统计无限增长
function pruneStats() {
  const keys = Object.keys(state.focus.stats)
  if (keys.length <= STATS_KEEP_DAYS) return
  keys.sort()
  for (const k of keys.slice(0, keys.length - STATS_KEEP_DAYS)) delete state.focus.stats[k]
}

export const todayStats = computed(() => state.focus.stats[dayKey(new Date(now.value))] || { minutes: 0, rounds: 0 })

// 当前生效的工作时间统计（跟着共享时钟走）
export const work = computed(() => workStats(state.workSchedule, new Date(now.value)))

// ---------- 提醒触发 ----------
function fireReminder(r, again = false) {
  alert('reminder', {
    label: r.label,
    when: reminderWhenText(r),
    id: r.id,
    again,
  })
  // 只有「第一次响」才初始化催办计数。
  // 再次提醒时计数由心跳推进（fr.repeats + 1），这里若再重置成 0，
  // 1次 / 3次 的上限就永远不成立 —— 实际表现是「选了 1 次也会一直响」。
  if (r.repeatCount !== 'off' && !again) {
    firingReminder.value = { id: r.id, nextAt: Date.now() + r.repeatInterval * 1000, repeats: 0 }
  }
}

function checkReminders() {
  const d = new Date()
  const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const today = dayKey(d)
  const t = d.getTime()
  let changed = false

  for (const r of state.reminders) {
    if (!r.enabled) continue
    let due = false
    if (r.type === 'once') {
      // 一次性：到点即触发，之后自动完成
      due = r.at > 0 && t >= r.at && r.lastFired !== 'once'
    } else {
      due = r.time === hhmm && r.lastFired !== today
    }
    if (!due) continue

    r.lastFired = r.type === 'once' ? 'once' : today
    if (r.type === 'once') {
      r.done = true
      // 这里**不能**无条件停用：一次性提醒如果选了催办策略，还要继续催到
      // 「知道了」为止。一旦置 enabled = false，下一拍心跳的
      // `!r.enabled` 就会把催办链掐断 —— 表现就是「只响一次就没了」。
      // 只有「关闭催办」的才是真的响一次就结束。
      if (r.repeatCount === 'off') r.enabled = false
    }
    changed = true
    fireReminder(r)
  }
  if (changed) save()
}

// 催办链收尾：一次性提醒到这一刻才真正「完成并停用」
function finishOnceNag(r) {
  if (r && r.type === 'once' && r.done && r.enabled) {
    r.enabled = false
    save()
  }
}

function ackReminder(id) {
  const fr = firingReminder.value
  if (!fr) return
  if (id && fr.id !== id) return
  finishOnceNag(state.reminders.find((x) => x.id === fr.id))
  firingReminder.value = null
}

// 点掉通知条 = 确认提醒；自动收起（reason = 'auto'）不算确认，所以会继续催
onNoticeDismiss((payload, reason) => {
  if (reason !== 'user') return
  if (!payload || payload.source !== 'reminder') return
  ackReminder(payload.id)
})

// ---------- 倒计时：结束后的「再来一次 / 完成」 ----------
// 放在模块级，这样通知条上的动作按钮可以直接调用，不必先 useTimeApp()
function cdAgain() {
  const cd = state.cd
  const ms = cd.lastTotal || cd.total
  cd.total = ms
  cd.remaining = ms
  cd.finished = false
  cd.endAt = Date.now() + ms
  cd.running = true
  announceStart()
  save()
}

function cdDismiss() {
  state.cd.finished = false
  state.cd.remaining = state.cd.total
  save()
}

// 岛上点了「再来一次 / 完成」
onNoticeAction((payload, actionId) => {
  if (!payload || payload.source !== 'countdown') return
  if (actionId === 'again') cdAgain()
  else if (actionId === 'done') cdDismiss()
})

// 专注阶段结束 → 结算 + 统计 + 自动进入下一阶段
function finishFocusPhase() {
  const f = state.focus
  if (f.phase === 'focus') {
    f.rounds += 1
    addFocusStat(f.focusMs / 60000, 1)
    f.phase = 'break'
    f.remaining = f.breakMs
    f.endAt = Date.now() + f.breakMs
    f.running = true
    alert('focusEnd', {
      detail: f.taskTitle ? `${f.taskTitle} · ${durText(f.focusMs / 60000)}` : undefined,
    })
  } else {
    f.phase = 'focus'
    f.remaining = f.focusMs
    f.endAt = Date.now() + f.focusMs
    f.running = true
    alert('breakEnd')
  }
  save()
}

// ---------- 模块级心跳 ----------
// 计时用 250ms 保证环形进度平滑；时间类 UI 只在秒变化时推进
setInterval(() => {
  const t = Date.now()
  if (Math.floor(t / 1000) !== Math.floor(now.value / 1000)) now.value = t

  const cd = state.cd
  if (cd.running && cd.endAt) {
    const left = cd.endAt - t
    if (left <= 0) {
      cd.remaining = 0
      cd.running = false
      cd.endAt = null
      cd.finished = true
      cd.lastTotal = cd.total
      alert('countdown')
      save()
    } else {
      cd.remaining = left
    }
  }

  const f = state.focus
  if (f.running && f.endAt) {
    const left = f.endAt - t
    if (left <= 0) finishFocusPhase()
    else f.remaining = left
  }

  // 未被确认的提醒：按策略继续催
  const fr = firingReminder.value
  if (fr) {
    const r = state.reminders.find((x) => x.id === fr.id)
    const maxRepeats = !r || r.repeatCount === 'off' ? 0 : r.repeatCount === 'unlimited' ? Infinity : Number(r.repeatCount) || 0
    if (!r || !r.enabled || maxRepeats === 0 || fr.repeats >= maxRepeats) {
      finishOnceNag(r)
      firingReminder.value = null
    } else if (t >= fr.nextAt) {
      firingReminder.value = {
        id: fr.id,
        nextAt: t + r.repeatInterval * 1000,
        repeats: fr.repeats + 1,
      }
      fireReminder(r, true)
    }
  }

  checkReminders()
}, 250)

// ---------- 下一次提醒 ----------
// 每日提醒按 HH:MM 找今天/明天；一次性提醒按绝对时间找
export function nextReminder(when = new Date(now.value)) {
  // 已触发、还在等确认的一次性提醒不该再当「下一提醒」（它的时间已经过去了）
  const list = state.reminders.filter((r) => r.enabled && !(r.type === 'once' && r.done))
  if (!list.length) return null
  const nowMin = when.getHours() * 60 + when.getMinutes()
  const t = when.getTime()

  const candidates = list.map((r) => {
    if (r.type === 'once') {
      return { r, ts: r.at || Infinity }
    }
    let min = hm(r.time, 0)
    let dayOffset = 0
    if (min < nowMin) {
      dayOffset = 1
      min += 1440
    }
    return { r, ts: t + (min - nowMin) * 60000, dayOffset }
  })
  candidates.sort((a, b) => a.ts - b.ts)
  return candidates[0]?.r || null
}

export function useTimeApp() {
  function setMode(id) {
    if (!MODE_IDS.includes(id) || state.mode === id) return
    // 被设置关掉的模式不允许切过去
    if (!visibleModes.value.some((m) => m.id === id)) return
    state.mode = id
    sfx.switchApp()
    save()
  }

  // ----- 倒计时 -----
  function cdStart() {
    if (state.cd.running) return
    if (state.cd.remaining <= 0) state.cd.remaining = state.cd.total
    state.cd.endAt = Date.now() + state.cd.remaining
    state.cd.running = true
    state.cd.finished = false
    announceStart()
    save()
  }

  function cdPause() {
    if (!state.cd.running) return
    state.cd.remaining = Math.max(0, state.cd.endAt - Date.now())
    state.cd.running = false
    state.cd.endAt = null
    save()
  }

  function cdToggle() {
    state.cd.running ? cdPause() : cdStart()
  }

  function cdReset() {
    state.cd.remaining = state.cd.total
    state.cd.running = false
    state.cd.endAt = null
    state.cd.finished = false
    save()
  }

  function cdSetDuration(ms) {
    const v = Number(ms) || 0
    if (v <= 0) return
    state.cd.total = v
    state.cd.remaining = v
    state.cd.running = false
    state.cd.endAt = null
    state.cd.finished = false
    save()
  }

  function cdSetPreset(min) {
    cdSetDuration(min * 60000)
  }

  // ----- 专注 -----
  function focusSetTask(taskId, taskTitle) {
    state.focus.taskId = taskId || null
    state.focus.taskTitle = taskTitle || ''
    save()
  }

  function focusStart() {
    if (state.focus.running) return
    const f = state.focus
    if (f.remaining <= 0) f.remaining = f.phase === 'focus' ? f.focusMs : f.breakMs
    f.endAt = Date.now() + f.remaining
    f.running = true
    announceStart()
    save()
  }

  function focusPause() {
    const f = state.focus
    if (!f.running) return
    f.remaining = Math.max(0, f.endAt - Date.now())
    f.running = false
    f.endAt = null
    save()
  }

  function focusToggle() {
    state.focus.running ? focusPause() : focusStart()
  }

  function focusReset() {
    const f = state.focus
    f.running = false
    f.endAt = null
    f.phase = 'focus'
    f.remaining = f.focusMs
    f.rounds = 0
    save()
  }

  function focusSkip() {
    const f = state.focus
    f.running = false
    f.endAt = null
    f.phase = f.phase === 'focus' ? 'break' : 'focus'
    f.remaining = f.phase === 'focus' ? f.focusMs : f.breakMs
    save()
  }

  // 「结束」：停表并回到就绪态（不结算统计，本轮作废）
  function focusStop() {
    const f = state.focus
    f.running = false
    f.endAt = null
    f.phase = 'focus'
    f.remaining = f.focusMs
    save()
  }

  function focusSetDuration(phase, ms) {
    const v = Number(ms) || 0
    if (v <= 0) return
    const f = state.focus
    if (phase === 'break') f.breakMs = v
    else f.focusMs = v
    if (!f.running && f.phase === phase) f.remaining = v
    save()
  }

  // ----- 作息 -----
  // 作息同时存在于两处：岛内 WorkPanel 直接改，设置面板的「时间」详情页也改。
  // 两处都往 settings.json 写一份，再由下面的 watch 同步回来，值不同才动，不会来回弹。
  function setWorkSchedule(patch) {
    state.workSchedule = normalizeSchedule({ ...state.workSchedule, ...patch })
    save()
    update({
      timeWorkStart: state.workSchedule.start,
      timeWorkEnd: state.workSchedule.end,
      timeLunchStart: state.workSchedule.lunchStart,
      timeLunchEnd: state.workSchedule.lunchEnd,
    })
  }

  // ----- 提醒 -----
  // type: 'daily' | 'once'；once 传 at（绝对时间戳），daily 传 time
  function addReminder({ type = 'daily', time = '09:00', at = 0, label = '', repeatCount = 'unlimited', repeatInterval = 30 } = {}) {
    const item = normalizeReminder({
      id: newId('rem'),
      type,
      time,
      at,
      label,
      enabled: true,
      repeatCount,
      repeatInterval,
    })
    if (item.type === 'once' && !item.at) return null
    state.reminders.push(item)
    sortReminders()
    save()
    return item
  }

  function sortReminders() {
    state.reminders.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'daily' ? -1 : 1
      if (a.type === 'once') return (a.at || 0) - (b.at || 0)
      return hm(a.time, 0) - hm(b.time, 0)
    })
  }

  function removeReminder(id) {
    const i = state.reminders.findIndex((r) => r.id === id)
    if (i === -1) return
    state.reminders.splice(i, 1)
    ackReminder(id)
    save()
  }

  function toggleReminder(id) {
    const r = state.reminders.find((x) => x.id === id)
    if (!r) return
    r.enabled = !r.enabled
    // 重新启用时清掉「已触发」标记，否则当天 / 本次不会再响
    if (r.enabled) {
      r.lastFired = ''
      r.done = false
      if (r.type === 'once' && r.at <= Date.now()) {
        // 一次性提醒已经过期，重新启用时顺延到下一个整点
        const d = new Date(Date.now() + 3600000)
        d.setMinutes(0, 0, 0)
        r.at = d.getTime()
        r.time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
      }
    } else {
      ackReminder(id)
    }
    save()
  }

  function setReminderRepeat(id, { repeatCount, repeatInterval }) {
    const r = state.reminders.find((x) => x.id === id)
    if (!r) return
    if (repeatCount !== undefined) r.repeatCount = repeatCount
    if (repeatInterval !== undefined) r.repeatInterval = repeatInterval
    if (r.repeatCount === 'off') ackReminder(id)
    save()
  }

  return {
    state,
    setMode,
    // 倒计时
    cdStart,
    cdPause,
    cdToggle,
    cdReset,
    cdSetDuration,
    cdSetPreset,
    cdAgain,
    cdDismiss,
    // 专注
    focusStart,
    focusPause,
    focusToggle,
    focusReset,
    focusSkip,
    focusStop,
    focusSetDuration,
    focusSetTask,
    // 作息
    setWorkSchedule,
    // 提醒
    addReminder,
    removeReminder,
    toggleReminder,
    setReminderRepeat,
    ackReminder,
    firingReminder,
    nextReminder,
    // 统计
    todayStats,
    work,
  }
}
