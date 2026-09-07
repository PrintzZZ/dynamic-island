<template>
  <div class="clock-app">
    <div class="clock-face">
      <div class="hand hour" :style="hourStyle" />
      <div class="hand minute" :style="minuteStyle" />
      <div class="hand second" :style="secondStyle" />
      <div class="center-dot" />
    </div>
    <div class="time-text">{{ timeText }}</div>
    <div class="date-text">{{ dateText }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const now = ref(new Date())
let timer

onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => clearInterval(timer))

const timeText = computed(() => {
  const d = now.value
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const dateText = computed(() => {
  const d = now.value
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${week}`
})

const hourStyle = computed(() => {
  const d = now.value
  const deg = (d.getHours() % 12) * 30 + d.getMinutes() * 0.5
  return { transform: `rotate(${deg}deg)` }
})
const minuteStyle = computed(() => {
  const d = now.value
  const deg = d.getMinutes() * 6 + d.getSeconds() * 0.1
  return { transform: `rotate(${deg}deg)` }
})
const secondStyle = computed(() => {
  const d = now.value
  return { transform: `rotate(${d.getSeconds() * 6}deg)` }
})
</script>

<style scoped>
.clock-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.clock-face {
  position: relative;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  height: 38px;
  width: 4px;
  margin-left: -2px;
}
.minute {
  height: 55px;
  margin-left: -1.5px;
}
.second {
  height: 62px;
  width: 1.5px;
  margin-left: -0.75px;
  background: var(--orange);
}
.center-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 10px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--orange);
}
.time-text {
  font-size: 34px;
  font-weight: 300;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
}
.date-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}
</style>
