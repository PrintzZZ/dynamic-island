<template>
  <div class="net-app">
    <div class="toolbar">
      <div class="title">
        网速
        <span class="live"><span class="live-dot" />实时</span>
      </div>
      <span class="sub">每秒刷新</span>
    </div>

    <!-- 上下行速率卡片 -->
    <div class="cards">
      <div class="card">
        <div class="card-head">
          <Icon name="arrow-down" class="head-ico down" />
          <span class="head-label">下行</span>
        </div>
        <div class="big">
          <span class="num">{{ down.v }}</span>
          <span class="unit">{{ down.u }}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <Icon name="arrow-up" class="head-ico up" />
          <span class="head-label">上行</span>
        </div>
        <div class="big">
          <span class="num">{{ up.v }}</span>
          <span class="unit">{{ up.u }}</span>
        </div>
      </div>
    </div>

    <!-- 最近 40 秒波形 -->
    <div class="chart">
      <div class="chart-head">
        <span class="chart-title">最近 {{ MAX }} 秒</span>
        <div class="legend">
          <span class="lg"><i class="sw down" />下行</span>
          <span class="lg"><i class="sw up" />上行</span>
        </div>
      </div>
      <svg ref="svgEl" class="wave" :viewBox="`0 0 ${size.w} ${size.h}`">
        <defs>
          <linearGradient id="netFillDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#64d2ff" stop-opacity="0.32" />
            <stop offset="100%" stop-color="#64d2ff" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="netFillUp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ff9f0a" stop-opacity="0.28" />
            <stop offset="100%" stop-color="#ff9f0a" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line class="grid-line" :x1="0" :y1="baseLineY" :x2="size.w" :y2="baseLineY" />
        <g ref="waveGroup">
          <path class="wfill down" :d="downPaths.area" />
          <path class="wfill up" :d="upPaths.area" />
          <path class="wline down" :d="downPaths.line" />
          <path class="wline up" :d="upPaths.line" />
        </g>
      </svg>
      <div v-if="!stats.active" class="wave-hint">等待采样…</div>
    </div>

    <!-- 收起态显示方向设置 -->
    <div class="foot">
      <span class="label">收起时显示</span>
      <div class="seg">
        <button
          class="seg-btn"
          :class="{ on: settings.compactMode === 'down' }"
          @click="setCompactMode('down')"
        >
          <Icon name="arrow-down" class="seg-ico down" />下行
        </button>
        <button
          class="seg-btn"
          :class="{ on: settings.compactMode === 'up' }"
          @click="setCompactMode('up')"
        >
          <Icon name="arrow-up" class="seg-ico up" />上行
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import Icon from '../../components/Icon.vue'
import { useNet, fmtSpeed } from './useNet'

const { settings, stats, history, setCompactMode } = useNet()

const MAX = 40

const down = computed(() => (stats.active ? fmtSpeed(stats.down) : { v: '--', u: '' }))
const up = computed(() => (stats.active ? fmtSpeed(stats.up) : { v: '--', u: '' }))

// ---------- 画布：按真实像素绘制 ----------
// 关键：viewBox 恒等于元素实际尺寸（1 单位 = 1px），
// 不再用 preserveAspectRatio="none" 拉伸，避免线宽被非等比缩放成"粗细不均"
const svgEl = ref(null)
const size = ref({ w: 320, h: 64 })
let ro = null

onMounted(() => {
  lastSampleT = stats.t || 0
  if (waveGroup.value) gsap.set(waveGroup.value, { x: 0 })
  const el = svgEl.value
  if (!el || typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver((entries) => {
    const r = entries[0].contentRect
    if (r.width > 0 && r.height > 0) size.value = { w: r.width, h: r.height }
  })
  ro.observe(el)
})

onBeforeUnmount(() => {
  if (scrollTween) scrollTween.kill()
  scrollTween = null
  if (ro) ro.disconnect()
  ro = null
})

const PAD_X = 5
const PAD_TOP = 6
const PAD_BOTTOM = 4

// 上下行共用同一峰值，两条曲线高度可比较
const peak = computed(() => Math.max(1, ...history.down, ...history.up))
const baseLineY = computed(() => (size.value.h - PAD_BOTTOM).toFixed(1))

// 每个采样槽的像素间距（同时也是每次滑动动画的位移量）
const stepX = computed(() => Math.max(1, size.value.w - PAD_X * 2) / (MAX - 1))

// 采样点 → 像素坐标（0 速落在底边）
// 右对齐：最新样本贴着右边界，越旧越靠左；多存的那 1 个会排到左边界之外
function toPoints(arr, max, w, h, step) {
  const usableH = Math.max(1, h - PAD_TOP - PAD_BOTTOM)
  const baseY = h - PAD_BOTTOM
  const last = arr.length - 1
  const pts = []
  for (let i = 0; i < arr.length; i++) {
    const x = PAD_X + (MAX - 1 - last + i) * step
    const y = baseY - (Math.min(arr[i], max) / max) * usableH
    pts.push([x, y])
  }
  return pts
}

// 单调三次插值（Fritsch–Carlson）→ 三次贝塞尔路径
// 等价于 ECharts 的 smooth + smoothMonotone：曲线顺滑，且不会过冲或跌破基线
function smoothLine(pts) {
  const n = pts.length
  if (n < 2) return n === 1 ? `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` : ''

  const dx = new Array(n - 1)
  const slope = new Array(n - 1)
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0]
    slope[i] = dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i]
  }

  // 每个采样点处的切线斜率
  const m = new Array(n)
  m[0] = slope[0]
  m[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) {
    // 极值点切线归零，避免在峰/谷两侧多冒一个小包
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  }

  // 限制切线幅度（Fritsch–Carlson 条件），保证单调段不过冲
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / slope[i]
    const b = m[i + 1] / slope[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * slope[i]
      m[i + 1] = t * b * slope[i]
    }
  }

  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    const c1x = pts[i][0] + h
    const c1y = pts[i][1] + m[i] * h
    const c2x = pts[i + 1][0] - h
    const c2y = pts[i + 1][1] - m[i + 1] * h
    d +=
      ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)},` +
      ` ${c2x.toFixed(1)} ${c2y.toFixed(1)},` +
      ` ${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`
  }
  return d
}

// 同时产出「曲线」与「曲线下方到基线的闭合面积」两条路径（面积用渐变填充）
function buildPaths(arr, max, w, h, step) {
  const pts = toPoints(arr, max, w, h, step)
  if (pts.length < 2) return { line: smoothLine(pts), area: '' }
  const line = smoothLine(pts)
  const baseY = (h - PAD_BOTTOM).toFixed(1)
  const lastX = pts[pts.length - 1][0].toFixed(1)
  const firstX = pts[0][0].toFixed(1)
  return { line, area: `${line} L ${lastX} ${baseY} L ${firstX} ${baseY} Z` }
}

const downPaths = computed(() =>
  buildPaths(history.down, peak.value, size.value.w, size.value.h, stepX.value)
)
const upPaths = computed(() =>
  buildPaths(history.up, peak.value, size.value.w, size.value.h, stepX.value)
)

// ---------- 向左流动动画（ECharts 实时折线的滚动效果） ----------
// 每个样本到来时，把整组波形先右移一格（x = stepX），此时画面与"上一样本"逐点重合，
// 新样本刚好落在右边界外一格；再用一个采样周期线性滑回 x = 0，新样本滑入右边界。
// 由于 history 多存了 1 个样本，最旧的那个早已在左边界外，丢弃它不会造成缺口。
const waveGroup = ref(null)
let scrollTween = null
let lastSampleT = 0

watch(
  () => stats.t,
  async (t) => {
    if (!t) return
    // 用相邻两个样本的真实间隔做滑动时长，跟随主进程 ~1Hz 的推送节奏
    const dt = lastSampleT ? Math.min(Math.max(t - lastSampleT, 220), 2000) : 1000
    lastSampleT = t
    await nextTick() // 先把新路径写进 DOM，再改位移，避免错开一帧
    const el = waveGroup.value
    if (!el) return
    if (scrollTween) scrollTween.kill()
    scrollTween = gsap.fromTo(
      el,
      { x: stepX.value },
      { x: 0, duration: dt / 1000, ease: 'none' }
    )
  }
)
</script>

<style scoped>
.net-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 6px 16px 14px;
  gap: 10px;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 700;
  color: #f5f5f7;
}
.live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  color: #64d2ff;
  background: rgba(100, 210, 255, 0.12);
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.4px;
}
.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #64d2ff;
  animation: livePulse 1.4s ease-in-out infinite;
}
@keyframes livePulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
.sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

/* 速率卡片 */
.cards {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.card {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 10px 14px 12px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.head-ico {
  width: 13px;
  height: 13px;
}
.head-ico.down {
  color: #64d2ff;
}
.head-ico.up {
  color: #ff9f0a;
}
.head-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.5px;
}
.big {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.num {
  font-size: 30px;
  font-weight: 200;
  line-height: 1.15;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
}
.unit {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
}

/* 波形图 */
.chart {
  position: relative;
  flex: 1;
  min-height: 0;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  padding: 8px 12px 6px;
  display: flex;
  flex-direction: column;
}
.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.chart-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}
.legend {
  display: flex;
  gap: 10px;
}
.lg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}
.sw {
  width: 14px;
  height: 2px;
  border-radius: 2px;
}
.sw.down {
  background: #64d2ff;
}
.sw.up {
  background: #ff9f0a;
}
.wave {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 48px;
  flex-shrink: 1;
}
.grid-line {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
}
/* 面积渐变：自上而下淡出（ECharts 的 areaStyle 效果） */
.wfill {
  stroke: none;
}
.wfill.down {
  fill: url(#netFillDown);
}
.wfill.up {
  fill: url(#netFillUp);
}
/* 曲线：固定 2px、圆头圆角，粗细处处均匀 */
.wline {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.wline.down {
  stroke: #64d2ff;
}
.wline.up {
  stroke: #ff9f0a;
}
.wave-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
}

/* 收起显示设置 */
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.seg {
  display: flex;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 2px;
  gap: 2px;
}
.seg-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}
.seg-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}
.seg-btn.on {
  background: rgba(255, 255, 255, 0.16);
  color: #f5f5f7;
}
.seg-ico {
  width: 11px;
  height: 11px;
}
.seg-ico.down {
  color: #64d2ff;
}
.seg-ico.up {
  color: #ff9f0a;
}
</style>
