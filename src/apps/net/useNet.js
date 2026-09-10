import { reactive, watch } from 'vue'

const STORAGE_KEY = 'island.net.v1'

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
    return { compactMode: s.compactMode === 'up' ? 'up' : 'down' }
  } catch {
    return { compactMode: 'down' }
  }
}

// 设置：收起时显示下行还是上行（模块级单例，多个组件共享）
const settings = reactive(loadSettings())

watch(
  settings,
  (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)),
  { deep: true }
)

// 主进程每秒推送一次速率（B/s），保存在此供紧凑/展开视图共用
const stats = reactive({
  down: 0,
  up: 0,
  active: false, // 收到过真实采样
  t: 0,
})

// 历史波形（展开视图迷你图表用）
// 比图表可见槽位多存 1 个：多出的这个停在可视区左侧外面，
// 滑动动画期间由它补住左边缘，滑出后再丢弃，两端都不会出现缺口。
const HISTORY_MAX = 41
const history = reactive({ down: [], up: [] })

let subscribed = false

function onStats(payload) {
  if (!payload) return
  stats.down = payload.down || 0
  stats.up = payload.up || 0
  stats.active = true
  stats.t = payload.t || Date.now()
  history.down.push(stats.down)
  history.up.push(stats.up)
  if (history.down.length > HISTORY_MAX) {
    history.down.shift()
    history.up.shift()
  }
}

function initNet() {
  if (subscribed) return
  subscribed = true
  if (window.api && window.api.onNetStats) {
    window.api.onNetStats(onStats)
  }
}

initNet()

// 速率格式化：B/s → KB/s → MB/s → GB/s（1024 进制）
export function fmtSpeed(bps) {
  const v = Number(bps) || 0
  if (v < 1024) return { v: Math.round(v), u: 'B/s' }
  const kb = v / 1024
  if (kb < 1024) return { v: kb >= 100 ? Math.round(kb) : Math.round(kb * 10) / 10, u: 'KB/s' }
  const mb = kb / 1024
  if (mb < 1024) return { v: mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10, u: 'MB/s' }
  return { v: Math.round((mb / 1024) * 10) / 10, u: 'GB/s' }
}

export function useNet() {
  function setCompactMode(mode) {
    if (mode === 'up' || mode === 'down') settings.compactMode = mode
  }

  return { settings, stats, history, setCompactMode, fmtSpeed }
}
