import { reactive, computed, watch } from 'vue'
import { sfx } from '../../utils/sound'

const STORAGE_KEY = 'island.timer.v1'
const PRESETS = [1, 3, 5, 10, 25, 45] // 分钟

function now() {
  return Date.now()
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (raw && typeof raw.total === 'number' && typeof raw.remaining === 'number') {
      let remaining = raw.remaining
      let running = false
      let endAt = null
      let finished = false
      // 恢复跨重启的进行中倒计时：用 endAt 重新校准
      if (raw.running && typeof raw.endAt === 'number') {
        const left = raw.endAt - now()
        if (left > 0) {
          remaining = left
          running = true
          endAt = raw.endAt
        } else {
          remaining = 0
          finished = true
        }
      }
      return { total: raw.total, remaining, running, endAt, finished }
    }
  } catch {
    /* ignore */
  }
  return {
    total: 5 * 60000,
    remaining: 5 * 60000,
    running: false,
    endAt: null,
    finished: false,
  }
}

// 模块级单例状态
const state = reactive(load())

watch(
  state,
  () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state })),
  { deep: true }
)

// 模块级计时循环：即使组件卸载，倒计时也持续推进
setInterval(() => {
  if (state.running && state.endAt) {
    const left = state.endAt - now()
    if (left <= 0) {
      state.remaining = 0
      state.running = false
      state.finished = true
      state.endAt = null
      sfx.alarm()
    } else {
      state.remaining = left
    }
  }
}, 250)

function pad(x) {
  return String(x).padStart(2, '0')
}

export function useTimer() {
  const progress = computed(() =>
    state.total > 0 ? state.remaining / state.total : 0
  )

  // 时间文本：不足 1 小时显示 MM:SS，超过则显示 H:MM:SS
  const timeText = computed(() => {
    const ms = Math.ceil(state.remaining / 1000) * 1000
    const totalSec = Math.max(0, Math.round(ms / 1000))
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  })

  function start() {
    if (state.remaining <= 0) state.remaining = state.total
    state.endAt = now() + state.remaining
    state.running = true
    state.finished = false
  }

  function pause() {
    if (!state.running) return
    state.remaining = Math.max(0, state.endAt - now())
    state.running = false
    state.endAt = null
  }

  function toggle() {
    state.running ? pause() : start()
  }

  function reset() {
    state.remaining = state.total
    state.running = false
    state.endAt = null
    state.finished = false
  }

  function setPreset(min) {
    setDuration(min * 60000)
  }

  function setDuration(ms) {
    if (!ms || ms <= 0) return
    state.total = ms
    state.remaining = ms
    state.running = false
    state.endAt = null
    state.finished = false
  }

  return {
    state,
    presets: PRESETS,
    progress,
    timeText,
    start,
    pause,
    toggle,
    reset,
    setPreset,
    setDuration,
  }
}
