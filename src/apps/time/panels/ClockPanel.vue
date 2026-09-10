<template>
  <div class="clock-panel">
    <div class="face">
      <div class="hand hour" :style="{ transform: `rotate(${hourDeg}deg)` }" />
      <div class="hand minute" :style="{ transform: `rotate(${minuteDeg}deg)` }" />
      <div class="hand second" :style="{ transform: `rotate(${secondDeg}deg)` }" />
      <div class="pivot" />
    </div>
    <div class="time">{{ timeText }}</div>
    <div class="date">{{ dateText }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { now } from '../useTimeApp'

const pad = (x) => String(x).padStart(2, '0')

// 复用应用级共享时钟（250ms 心跳），面板自己不另起定时器
const d = computed(() => new Date(now.value))

const timeText = computed(() => {
  const t = d.value
  return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
})

const dateText = computed(() => {
  const t = d.value
  const week = ['日', '一', '二', '三', '四', '五', '六'][t.getDay()]
  return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日 星期${week}`
})

const hourDeg = computed(() => {
  const t = d.value
  return (t.getHours() % 12) * 30 + t.getMinutes() * 0.5
})
const minuteDeg = computed(() => {
  const t = d.value
  return t.getMinutes() * 6 + t.getSeconds() * 0.1
})
const secondDeg = computed(() => d.value.getSeconds() * 6)
</script>

<style scoped>
.clock-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.face {
  position: relative;
  width: 142px;
  height: 142px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.hand {
  position: absolute;
  left: 50%;
  bottom: 50%;
  width: 3px;
  border-radius: 3px;
  transform-origin: 50% 100%;
  background: #f5f5f7;
}
.hour {
  height: 36px;
  width: 4px;
  margin-left: -2px;
}
.minute {
  height: 52px;
  margin-left: -1.5px;
}
.second {
  height: 59px;
  width: 1.5px;
  margin-left: -0.75px;
  background: #0a84ff;
}
.pivot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 9px;
  height: 9px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #0a84ff;
}
.time {
  font-size: 32px;
  font-weight: 300;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
}
.date {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.55);
}
</style>
