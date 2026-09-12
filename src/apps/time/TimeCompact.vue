<template>
  <div class="time-compact" :class="{ simple: isClock }">
    <!-- 左：模式图标（计时运行中呼吸）；日常时间不显示 -->
    <span
      v-if="!isClock"
      class="ico-tile"
      :class="{ beat: running }"
      :style="{ background: tileBg }"
    >
      <Icon :name="mode.icon" class="ico-svg" :style="{ color: accent }" />
    </span>

    <!-- 中：主值 + 次行；日常时间只留居中时间 -->
    <span class="text">
      <span class="line1">{{ line1 }}</span>
      <span v-if="!isClock" class="line2">{{ line2 }}</span>
    </span>

    <!-- 右：环形进度 -->
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
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import { MODES, fmtMs, nextReminder, now, reminderWhenText, toMinutes, useTimeApp } from './useTimeApp'

const { state } = useTimeApp()

const mode = computed(() => MODES.find((m) => m.id === state.mode) || MODES[0])
const pad2 = (x) => String(x).padStart(2, '0')

// 日常时间：岛内只保留「居中的时间 + 右侧圆环」，不显示图标与日期
const isClock = computed(() => state.mode === 'clock')

const d = computed(() => new Date(now.value))

// 主值：每个模式「一眼要看的那一个数」
const line1 = computed(() => {
  switch (state.mode) {
    case 'clock':
      return `${pad2(d.value.getHours())}:${pad2(d.value.getMinutes())}`
    case 'countdown':
      return fmtMs(state.cd.remaining)
    case 'reminder': {
      const r = nextReminder()
      return r ? reminderWhenText(r) : '暂无'
    }
    case 'focus':
      return fmtMs(state.focus.remaining)
    default:
      return ''
  }
})

// 次行：上下文，不堆信息
const line2 = computed(() => {
  switch (state.mode) {
    case 'clock':
      return `${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.value.getDay()]} · ${d.value.getMonth() + 1}月${d.value.getDate()}日`
    case 'countdown':
      if (state.cd.finished) return '倒计时结束'
      return state.cd.running ? '计时中' : '倒计时'
    case 'reminder': {
      const r = nextReminder()
      return r ? r.label || '提醒' : '暂无提醒'
    }
    case 'focus': {
      const f = state.focus
      const phase = f.running ? (f.phase === 'focus' ? '专注中' : '休息中') : '已暂停'
      return f.taskTitle ? `${phase} · ${f.taskTitle}` : phase
    }
    default:
      return ''
  }
})

// 专注 / 提醒 / 倒计时完成时换色
const accent = computed(() => {
  if (state.mode === 'focus') return state.focus.phase === 'focus' ? '#BF5AF2' : '#30D158'
  if (state.mode === 'countdown' && state.cd.finished) return '#FF453A'
  return mode.value.accent
})

const tileBg = computed(() => {
  const map = {
    '#0A84FF': 'rgba(10, 132, 255, 0.16)',
    '#30D158': 'rgba(48, 209, 88, 0.16)',
    '#FF9F0A': 'rgba(255, 159, 10, 0.16)',
    '#BF5AF2': 'rgba(191, 90, 242, 0.16)',
    '#FF453A': 'rgba(255, 69, 58, 0.18)',
  }
  return map[accent.value] || 'rgba(255, 255, 255, 0.08)'
})

// 环进度：每种模式都给一个「正在流逝」的含义
const progress = computed(() => {
  const clamp = (v) => Math.max(0, Math.min(1, v))
  switch (state.mode) {
    case 'clock':
      return clamp((d.value.getSeconds() + d.value.getMilliseconds() / 1000) / 60)
    case 'countdown': {
      const t = state.cd.total
      return t > 0 ? clamp(state.cd.remaining / t) : 0
    }
    case 'focus': {
      const t = state.focus.phase === 'focus' ? state.focus.focusMs : state.focus.breakMs
      return t > 0 ? clamp(state.focus.remaining / t) : 0
    }
    case 'reminder': {
      const r = nextReminder()
      if (!r) return 0
      let diffMin
      if (r.type === 'once' && r.at) {
        diffMin = (r.at - now.value) / 60000
      } else {
        const nowMin = d.value.getHours() * 60 + d.value.getMinutes() + d.value.getSeconds() / 60
        diffMin = toMinutes(r.time) - nowMin
        if (diffMin < 0) diffMin += 24 * 60
      }
      return clamp(diffMin / 60)
    }
    default:
      return 0
  }
})

const running = computed(() => {
  if (state.mode === 'countdown') return state.cd.running
  if (state.mode === 'focus') return state.focus.running
  return false
})

const C = 2 * Math.PI * 14
const offset = computed(() => C * (1 - progress.value))
</script>

<style scoped>
.time-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 13px;
  color: #f5f5f7;
}

/* 日常时间：时间在整颗胶囊里真正居中，圆环绝对定位贴右侧 */
.time-compact.simple {
  position: relative;
  justify-content: center;
}
.time-compact.simple .text {
  flex: 0 1 auto;
  align-items: center;
}
.time-compact.simple .line1 {
  font-size: 15px;
  letter-spacing: 0.3px;
}
.time-compact.simple .ring {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%) rotate(-90deg);
}

.ico-tile {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.3s ease;
}
.ico-svg {
  width: 13px;
  height: 13px;
  transition: color 0.3s ease;
}
/* 计时运行中：图标轻轻呼吸 */
.ico-tile.beat {
  animation: beat 1.7s ease-in-out infinite;
}
@keyframes beat {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.line1 {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.line2 {
  font-size: 9.5px;
  line-height: 1.15;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 环形进度：不设 transition，靠 250ms 心跳平滑推进 */
.ring {
  width: 17px;
  height: 17px;
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
