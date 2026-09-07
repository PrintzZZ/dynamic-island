<template>
  <div class="timer-app" :class="{ finished: state.finished }">
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 200 200">
        <circle class="track" cx="100" cy="100" :r="R" />
        <circle
          class="bar"
          cx="100"
          cy="100"
          :r="R"
          :stroke-dasharray="C"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
      <div class="ring-center">
        <div class="time">{{ timeText }}</div>
        <div class="status">{{ statusText }}</div>
      </div>
    </div>

    <div class="controls">
      <button class="reset-btn" title="重置" @click="reset">
        <span class="reset-icon">↺</span>
      </button>
      <button class="play-btn" :class="{ running: state.running }" @click="toggle">
        <Transition name="play" mode="out-in">
          <span :key="state.running ? 'pause' : 'play'" class="play-icon">
            {{ state.running ? '❚❚' : '▶' }}
          </span>
        </Transition>
      </button>
      <button class="reset-btn" title="重置" @click="reset" style="visibility: hidden">
        <span class="reset-icon">↺</span>
      </button>
    </div>

    <div class="presets">
      <button
        v-for="p in presets"
        :key="p"
        class="chip"
        :class="{ active: isPresetActive(p) }"
        @click="setPreset(p)"
      >
        {{ p }} 分
      </button>
    </div>

    <div class="custom">
      <input v-model.number="customMin" class="num" type="number" min="0" placeholder="分" />
      <span class="colon">:</span>
      <input v-model.number="customSec" class="num" type="number" min="0" max="59" placeholder="秒" />
      <button class="set-btn" @click="applyCustom">设定</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTimer } from './useTimer'

const { state, presets, progress, timeText, toggle, reset, setPreset, setDuration } =
  useTimer()

const R = 88
const C = 2 * Math.PI * R

const dashOffset = computed(() => C * (1 - progress.value))

const statusText = computed(() => {
  if (state.finished) return '时间到'
  if (state.running) return '进行中'
  return '已就绪'
})

function isPresetActive(min) {
  return state.total === min * 60000
}

const customMin = ref(5)
const customSec = ref(0)
function applyCustom() {
  const m = Number(customMin.value) || 0
  const s = Number(customSec.value) || 0
  const ms = (m * 60 + s) * 1000
  if (ms > 0) setDuration(ms)
}
</script>

<style scoped>
.timer-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 20px 20px;
  gap: 16px;
  overflow: hidden;
}
.ring-wrap {
  position: relative;
  width: 190px;
  height: 190px;
  flex-shrink: 0;
}
.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 10;
}
.bar {
  fill: none;
  stroke: #ff9f0a;
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.25s linear, stroke 0.3s ease;
}
.timer-app.finished .bar {
  stroke: #ff453a;
}
.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.time {
  font-size: 40px;
  font-weight: 300;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 1px;
}
.timer-app.finished .time {
  animation: blink 0.8s ease-in-out infinite;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.controls {
  display: flex;
  align-items: center;
  gap: 20px;
}
.reset-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #f5f5f7;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s ease, transform 0.18s ease;
}
.reset-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  transform: scale(1.06);
}
.reset-icon {
  font-size: 18px;
  line-height: 1;
}
.play-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background: #ff9f0a;
  color: #0a0a0a;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease;
}
.play-btn:hover {
  transform: scale(1.08);
}
.play-icon {
  font-size: 20px;
  line-height: 1;
  font-weight: 700;
  display: inline-block;
}
.play-enter-active {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
}
.play-leave-active {
  transition: opacity 0.12s ease;
}
.play-enter-from {
  transform: scale(0.4);
  opacity: 0;
}
.play-leave-to {
  opacity: 0;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}
.chip:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f5f5f7;
}
.chip.active {
  background: rgba(255, 159, 10, 0.2);
  color: #ffb340;
}

.custom {
  display: flex;
  align-items: center;
  gap: 6px;
}
.num {
  width: 52px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #f5f5f7;
  outline: none;
  padding: 7px 8px;
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.num:focus {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
}
.num::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.colon {
  color: rgba(255, 255, 255, 0.4);
}
.set-btn {
  padding: 7px 14px;
  border-radius: 10px;
  border: none;
  background: #ff9f0a;
  color: #0a0a0a;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease;
}
.set-btn:hover {
  transform: scale(1.05);
}
</style>
