<template>
  <div class="cd-panel">
    <RingProgress :progress="progress" color="#FF9F0A" :size="158">
      <div class="big">{{ fmtMs(cd.remaining) }}</div>
      <div class="status" :class="{ done: cd.finished }">{{ statusText }}</div>
    </RingProgress>

    <div class="controls">
      <button class="ghost" title="重置" @click="cdReset">
        <Icon name="reset" class="ghost-ico" />
      </button>
      <button class="play" :class="{ running: cd.running }" title="开始 / 暂停" @click="cdToggle">
        <Transition name="swap" mode="out-in">
          <Icon
            :key="cd.running ? 'pause' : 'play'"
            :name="cd.running ? 'pause' : 'play'"
            class="play-ico"
          />
        </Transition>
      </button>
      <span class="spacer" />
    </div>

    <div class="presets">
      <button
        v-for="p in COUNTDOWN_PRESETS"
        :key="p"
        class="chip"
        :class="{ active: cd.total === p * 60000 }"
        @click="cdSetPreset(p)"
      >
        {{ p }} 分
      </button>
    </div>

    <div class="custom">
      <input v-model.number="customMin" class="num" type="number" min="0" placeholder="分" />
      <span class="colon">:</span>
      <input v-model.number="customSec" class="num" type="number" min="0" max="59" placeholder="秒" />
      <button class="set" @click="applyCustom">设定</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '../../../components/Icon.vue'
import RingProgress from '../RingProgress.vue'
import { COUNTDOWN_PRESETS, fmtMs, useTimeApp } from '../useTimeApp'

const { state, cdToggle, cdReset, cdSetPreset, cdSetDuration } = useTimeApp()

const cd = computed(() => state.cd)

const progress = computed(() => (cd.value.total > 0 ? cd.value.remaining / cd.value.total : 0))

const statusText = computed(() => {
  if (cd.value.finished) return '时间到'
  if (cd.value.running) return '进行中'
  return '已就绪'
})

const customMin = ref(5)
const customSec = ref(0)

function applyCustom() {
  const ms = ((Number(customMin.value) || 0) * 60 + (Number(customSec.value) || 0)) * 1000
  if (ms > 0) cdSetDuration(ms)
}
</script>

<style scoped>
.cd-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 2px 0;
}
.big {
  font-size: 38px;
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
.status.done {
  color: #ff453a;
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
.ghost,
.spacer {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}
.ghost {
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
.ghost:hover {
  background: rgba(255, 255, 255, 0.16);
  transform: scale(1.06);
}
.ghost-ico {
  width: 16px;
  height: 16px;
}
.play {
  width: 58px;
  height: 58px;
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
.play.running {
  background: #ffb340;
}
.play:hover {
  transform: scale(1.08);
}
.play-ico {
  width: 25px;
  height: 25px;
  display: block;
}
.swap-enter-active {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
}
.swap-leave-active {
  transition: opacity 0.12s ease;
}
.swap-enter-from {
  transform: scale(0.4);
  opacity: 0;
}
.swap-leave-to {
  opacity: 0;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.chip {
  padding: 5px 11px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
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
  width: 50px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #f5f5f7;
  outline: none;
  padding: 6px 8px;
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
.set {
  padding: 6px 13px;
  border-radius: 10px;
  border: none;
  background: #ff9f0a;
  color: #0a0a0a;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease;
}
.set:hover {
  transform: scale(1.05);
}
</style>
