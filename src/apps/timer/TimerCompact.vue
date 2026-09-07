<template>
  <div class="timer-compact">
    <span class="dot" :class="{ running: state.running, done: state.finished }" />
    <span class="time">{{ state.finished ? '时间到' : timeText }}</span>
  </div>
</template>

<script setup>
import { useTimer } from './useTimer'

const { state, timeText } = useTimer()
</script>

<style scoped>
.timer-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
  color: #f5f5f7;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}
.dot.running {
  background: #ff9f0a;
  animation: pulse 1.2s ease-in-out infinite;
}
.dot.done {
  background: #ff453a;
  animation: pulse 0.6s ease-in-out infinite;
}
.time {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  transform: translateY(-1px); /* 光学校正：抵消字体基线偏下的视差 */
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.7);
  }
}
</style>
