import { reactive, ref } from 'vue'
import { sfx } from '../../utils/sound'
import { island, onNoticeDismiss, showNotice, pulsePill } from '../../composables/useIsland'

const STORAGE_KEY = 'island.time.v2'

// 开启「多次提醒」后，未被确认就每隔这么久再催一次
export const REPEAT_MS = 30000

// 岛内可显示的四种功能
export const MODES = [
  { id: 'clock', name: '日常时间', icon: 'clock', accent: '#0A84FF' },
  { id: 'countdown', name: '倒计时', icon: 'timer', accent: '#FF9F0A' },
  { id: 'reminder', name: '提醒', icon: 'bell', accent: '#30D158' },
  { id: 'focus', name: '专注时间', icon: 'focus', accent: '#BF5AF2' },
]

export const MODE_IDS = MODES.map((m) => m.id)

export const COUNTDOWN_PRESETS = [1, 3, 5, 10, 25, 45]
export const FOCUS_PRESETS = [15, 25, 45, 60]
export const BREAK_PRESETS = [3, 5, 10]

const pad2 = (n) => String(n).padStart(2, '0')

// 毫秒 → MM:SS / H:MM:SS
export function fmtMs(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

// 'HH:MM' → 一天中的分钟数
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  if (!m) return 0
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]))
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function defaults() {
  return {
    mode: 'clock',
    cd: { total: 5 * 60000, remaining: 5 * 60000, running: false, endAt: null, finished: false },
    focus: {
      focusMs: 25 * 60000,
      breakMs: 5 * 60000,
      phase: 'focus', // 'focus' | 'break'
      remaining: 25 * 60000,
      running: false,
      endAt: null,
      rounds: 0,
    },
    // 提醒：每天 HH:MM 触发，可单独启用/停用
    reminders: [],
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
  s.reminders = Array.isArray(raw.reminders)
    ? raw.reminders
        .filter((r) => r && typeof r.time === 'string')
        .map((r) => ({
          id: String(r.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
          time: r.time,
          label: typeof r.label === 'string' ? r.label : '',
          enabled: r.enabled !== false,
          // 多次提醒：未确认则 30 秒后再催（旧数据缺字段时默认开启）
          repeat: r.repeat !== false,
          lastFired: typeof r.lastFired === 'string' ? r.lastFired : '',
        }))
    : []
  if (!MODE_IDS.includes(s.mode)) s.mode = 'clock'

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

// 共享时钟：由心跳推进，供「日常时间」显示与「下一条提醒」这类派生计算依赖，
// 避免每个组件各起一个定时器、也保证跨分钟时能自动重算
export const now = ref(Date.now())

// 正在"催"的提醒：{ id, nextAt, count }；确认（点通知 / 知道了）或停用后清空
export const firingReminder = ref(null)

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode,
        cd: { ...state.cd },
        focus: { ...state.focus },
        reminders: state.reminders.map((r) => ({ ...r })),
      })
    )
  } catch {
    /* ignore */
  }
}

// ---------- 动效 + 提醒 ----------
// 结束 / 提醒：胶囊脉冲 + 警报音，紧凑态下再把岛切成通知态主动触达
function alert(kind, payload = {}) {
  sfx.alarm()
  pulsePill('end')
  if (island.mode !== 'compact' || document.hidden) return
  const table = {
    countdown: {
      icon: 'timer',
      accent: '#FF9F0A',
      title: '倒计时结束',
      detail: payload.detail || '时间到了',
    },
    focusEnd: {
      icon: 'focus',
      accent: '#BF5AF2',
      title: '专注结束',
      detail: `休息 ${Math.round(state.focus.breakMs / 60000)} 分钟`,
    },
    breakEnd: {
      icon: 'focus',
      accent: '#30D158',
      title: '休息结束',
      detail: '开始下一轮专注',
    },
    reminder: {
      icon: 'bell',
      accent: '#30D158',
      title: payload.label || '提醒',
      detail: payload.again ? `${payload.time} · 还没确认，再提醒一次` : payload.time || '',
      ack: true, // 通知条右侧给一个「知道了」按钮
      source: 'reminder',
      id: payload.id,
    },
  }
  // 已经播过警报音了，通知条不再叠一层提示音
  showNotice({ silent: true, ...(table[kind] || table.countdown) }, 7000)
}

// 开始：轻量的脉冲反馈 + 上行音，不打断内容
function announceStart() {
  sfx.start()
  pulsePill('start')
}

// 专注阶段结束 → 结算并自动进入下一阶段（番茄钟循环）
function finishFocusPhase() {
  const f = state.focus
  if (f.phase === 'focus') {
    f.rounds += 1
    f.phase = 'break'
    f.remaining = f.breakMs
    f.endAt = Date.now() + f.breakMs
    f.running = true
    alert('focusEnd')
  } else {
    f.phase = 'focus'
    f.remaining = f.focusMs
    f.endAt = Date.now() + f.focusMs
    f.running = true
    alert('breakEnd')
  }
  save()
}

function checkReminders() {
  const d = new Date()
  const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const today = dayKey(d)
  let changed = false
  for (const r of state.reminders) {
    if (!r.enabled || r.time !== hhmm || r.lastFired === today) continue
    r.lastFired = today
    changed = true
    alert('reminder', { label: r.label, time: r.time, id: r.id })
    // 开了「多次提醒」：没人确认就每隔 REPEAT_MS 再催一次
    if (r.repeat) {
      firingReminder.value = { id: r.id, nextAt: Date.now() + REPEAT_MS, count: 1 }
    }
  }
  if (changed) save()
}

// 确认提醒：停止继续催（提醒本身保持启用，明天照常）
function ackReminder(id) {
  const fr = firingReminder.value
  if (!fr) return
  if (id && fr.id !== id) return
  firingReminder.value = null
}

// 点掉通知条 = 确认提醒；自动收起（reason = 'auto'）不算确认，所以会继续催
onNoticeDismiss((payload, reason) => {
  if (reason !== 'user') return
  if (!payload || payload.source !== 'reminder') return
  ackReminder(payload.id)
})

// 模块级心跳：即使组件卸载，计时与提醒也持续推进
setInterval(() => {
  const t = Date.now()
  now.value = t

  const cd = state.cd
  if (cd.running && cd.endAt) {
    const left = cd.endAt - t
    if (left <= 0) {
      cd.remaining = 0
      cd.running = false
      cd.endAt = null
      cd.finished = true
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

  // 未被确认的提醒：每 REPEAT_MS 再催一次（停用 / 删除 / 关掉多次提醒都会停下）
  const fr = firingReminder.value
  if (fr) {
    const r = state.reminders.find((x) => x.id === fr.id)
    if (!r || !r.enabled || !r.repeat) {
      firingReminder.value = null
    } else if (t >= fr.nextAt) {
      firingReminder.value = { id: fr.id, nextAt: t + REPEAT_MS, count: fr.count + 1 }
      alert('reminder', { label: r.label, time: r.time, id: r.id, again: true })
    }
  }

  checkReminders()
}, 250)

// 下一次将要触发的提醒（用于紧凑态显示）；默认读取共享时钟，保证跨分钟会重算
export function nextReminder(when = new Date(now.value)) {
  const list = state.reminders.filter((r) => r.enabled)
  if (!list.length) return null
  const nowMin = when.getHours() * 60 + when.getMinutes()
  const sorted = list
    .map((r) => ({ r, min: toMinutes(r.time) }))
    .sort((a, b) => a.min - b.min)
  const next = sorted.find((x) => x.min >= nowMin)
  return (next || sorted[0]).r
}

export function useTimeApp() {
  function setMode(id) {
    if (!MODE_IDS.includes(id) || state.mode === id) return
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

  // ----- 专注时间（番茄钟，阶段结束自动进入下一阶段） -----
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

  // 手动跳到下一阶段（当前阶段直接作废）
  function focusSkip() {
    const f = state.focus
    f.running = false
    f.endAt = null
    f.phase = f.phase === 'focus' ? 'break' : 'focus'
    f.remaining = f.phase === 'focus' ? f.focusMs : f.breakMs
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

  // ----- 提醒 -----
  function addReminder(time, label = '', repeat = true) {
    if (!/^\d{1,2}:\d{2}$/.test(String(time || ''))) return null
    const r = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time,
      label: String(label || '').trim(),
      enabled: true,
      repeat: repeat !== false,
      lastFired: '',
    }
    state.reminders.push(r)
    state.reminders.sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
    save()
    return r
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
    // 重新启用时清掉"今天已提醒"标记，否则当天不会再响
    if (r.enabled) r.lastFired = ''
    // 停用即停止继续催
    else ackReminder(id)
    save()
  }

  // 「多次提醒」开关：关掉即停止继续催
  function toggleReminderRepeat(id) {
    const r = state.reminders.find((x) => x.id === id)
    if (!r) return
    r.repeat = !r.repeat
    if (!r.repeat) ackReminder(id)
    save()
  }

  return {
    state,
    setMode,
    cdStart,
    cdPause,
    cdToggle,
    cdReset,
    cdSetDuration,
    cdSetPreset,
    focusStart,
    focusPause,
    focusToggle,
    focusReset,
    focusSkip,
    focusSetDuration,
    addReminder,
    removeReminder,
    toggleReminder,
    toggleReminderRepeat,
    ackReminder,
    firingReminder,
    nextReminder,
  }
}
