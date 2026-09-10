<template>
  <div class="time-compact">
    <!-- 左：状态小圆点（运行中脉动） -->
    <span class="side">
      <span class="dot" :class="{ pulse: running }" :style="{ background: accent }" />
    </span>

    <!-- 中：时间（左右占位等宽，所以是真正的居中） -->
    <span class="text">{{ text }}</span>

    <!-- 右：环形进度 -->
    <span class="side">
      <svg class="ring" viewBox="0 0 36 36">
        <circle class="ring-track" cx="18" cy="18" r="14" />
        <circle
          class="ring-bar"
          cx="18"
          cy="18"
          r="14"
          :stroke-dasharray="C"
          :stroke-dashoffset="offset"
          :style="{ stroke: accent }"
        />
      </svg>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { MODES, fmtMs, nextReminder, now, toMinutes, useTimeApp } from './useTimeApp'

const { state } = useTimeApp()

const mode = computed(() => MODES.find((m) => m.id === state.mode) || MODES[0])

const pad2 = (x) => String(x).padStart(2, '0')

// 日常时间 / 倒计时 / 专注 / 下一条提醒全部由共享时钟驱动，组件不另起定时器
const text = computed(() => {
  switch (state.mode) {
    case 'clock': {
      const d = new Date(now.value)
      return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    }
    case 'countdown':
      return fmtMs(state.cd.remaining)
    case 'reminder': {
      const r = nextReminder()
      return r ? r.time : '无提醒'
    }
    case 'focus':
      return fmtMs(state.focus.remaining)
    default:
      return ''
  }
})

// 环进度（0..1）：每种模式都给它一个"正在流逝"的含义
const progress = computed(() => {
  const clamp = (v) => Math.max(0, Math.min(1, v))
  switch (state.mode) {
    case 'clock': {
      // 当前这一分钟走完多少（带毫秒，跟着 250ms 心跳平滑推进）
      const d = new Date(now.value)
      return clamp((d.getSeconds() + d.getMilliseconds() / 1000) / 60)
    }
    case 'countdown': {
      const t = state.cd.total
      return t > 0 ? clamp(state.cd.remaining / t) : 0
    }
    case 'focus': {
      const t = state.focus.phase === 'focus' ? state.focus.focusMs : state.focus.breakMs
      return t > 0 ? clamp(state.focus.remaining / t) : 0
    }
    case 'reminder': {
      // 距下一次提醒还有多久，按"最近一小时"归一化
      const r = nextReminder()
      if (!r) return 0
      const d = new Date(now.value)
      const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
      let diff = toMinutes(r.time) - nowMin
      if (diff < 0) diff += 24 * 60
      return clamp(diff / 60)
    }
    default:
      return 0
  }
})

// 专注态跟随阶段换色，其余跟随模式配色
const accent = computed(() => {
  if (state.mode === 'focus') {
    return state.focus.phase === 'focus' ? '#BF5AF2' : '#30D158'
  }
  if (state.mode === 'countdown' && state.cd.finished) return '#FF453A'
  return mode.value.accent
})

const running = computed(() => {
  if (state.mode === 'countdown') return state.cd.running
  if (state.mode === 'focus') return state.focus.running
  return false
})

// 环半径 14（viewBox 36），周长用于 dash 进度
const C = 2 * Math.PI * 14
const offset = computed(() => C * (1 - progress.value))
</script>

<style scoped>
.time-compact {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 14px;
  color: #f5f5f7;
}

/* 左右等宽占位：中间的时间因此正好落在胶囊中心 */
.side {
  width: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.3s ease;
}
/* 计时进行中：圆点呼吸，表示还在跑 */
.dot.pulse {
  animation: dotPulse 1.6s ease-in-out infinite;
}
@keyframes dotPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.7);
  }
}

.text {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  transform: translateY(-1px); /* 光学校正：抵消字体基线偏下的视差 */
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* 环形进度：不设 transition，靠 250ms 心跳平滑推进，
   避免整分钟归零时出现"倒着绕一圈"的动画 */
.ring {
  width: 16px;
  height: 16px;
  transform: rotate(-90deg);
  flex-shrink: 0;
}
.ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.16);
  stroke-width: 4;
}
.ring-bar {
  fill: none;
  stroke-width: 4;
  stroke-linecap: round;
}
</style>
