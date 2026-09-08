<template>
  <div class="clock-compact">
    <span class="dot" />
    <span class="time">{{ time }}</span>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const time = ref('')
let timer

function tick() {
  const d = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  time.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.clock-compact {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #0a84ff;
  flex-shrink: 0;
}
.time {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  transform: translateY(-1px); /* 光学校正：抵消字体基线偏下的视差 */
  color: #f5f5f7;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
}
</style>
