<template>
  <div class="cd-panel">
    <RingProgress :progress="progress" :color="ringColor" :size="180">
      <div class="big">{{ fmtMs(cd.remaining) }}</div>
      <div class="status" :class="{ done: cd.finished }">{{ statusText }}</div>
    </RingProgress>

    <!-- 预设 + 自定义（运行中禁用，避免改到一半的计时） -->
    <div class="presets">
      <button v-for="p in COUNTDOWN_PRESETS" :key="p" class="chip" :class="{ active: cd.total === p * 60000 }"
        :disabled="cd.running" @click="cdSetPreset(p)">
        {{ p }}分
      </button>
    </div>

    <div class="custom" :class="{ disabled: cd.running }">
      <input v-model.number="customMin" class="num" type="number" min="0" placeholder="分" :disabled="cd.running" />
      <span class="colon">:</span>
      <input v-model.number="customSec" class="num" type="number" min="0" max="59" placeholder="秒"
        :disabled="cd.running" />
      <button class="set" :disabled="cd.running" @click="applyCustom">设定</button>
    </div>

    <!-- 结束态：再来一次 / 完成（需求 9.1） -->
    <div v-if="cd.finished" class="foot">
      <button class="btn primary again" @click="cdAgain">
        <Icon name="reset" class="btn-ico" />再来一次
      </button>
      <button class="btn ghost" @click="cdDismiss">完成</button>
    </div>
    <div v-else class="foot">
      <button class="btn primary" :class="{ running: cd.running }" @click="cdToggle">
        <Transition name="swap" mode="out-in">
          <Icon :key="cd.running ? 'pause' : 'play'" :name="cd.running ? 'pause' : 'play'" class="btn-ico" />
        </Transition>
        {{ cd.running ? '暂停' : '开始' }}
      </button>
      <button class="btn ghost" @click="cdReset">
        <Icon name="reset" class="btn-ico" />重置
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '../../../components/Icon.vue'
import RingProgress from '../RingProgress.vue'
import { COUNTDOWN_PRESETS, fmtMs, useTimeApp } from '../useTimeApp'

const { state, cdToggle, cdReset, cdSetPreset, cdSetDuration, cdAgain, cdDismiss } = useTimeApp()

const cd = computed(() => state.cd)

const progress = computed(() => (cd.value.total > 0 ? cd.value.remaining / cd.value.total : 0))

const ringColor = computed(() => (cd.value.finished ? '#FF453A' : '#30D158'))

const statusText = computed(() => {
  if (cd.value.finished) return '倒计时结束'
  if (cd.value.running) return '计时中'
  return '倒计时'
})

const customMin = ref(Math.floor(cd.value.total / 60000))
const customSec = ref(Math.floor((cd.value.total % 60000) / 1000))

// 预设切换后同步自定义输入框，避免显示与实际不一致
watch(
  () => cd.value.total,
  (v) => {
    customMin.value = Math.floor(v / 60000)
    customSec.value = Math.floor((v % 60000) / 1000)
  }
)

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
  justify-content: flex-start;
  gap: 11px;
  padding: 2px 0;
}

.big {
  font-size: 36px;
  font-weight: 300;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}

.status {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 1px;
}

.status.done {
  color: #ff453a;
  animation: blink 0.9s ease-in-out infinite;
}

@keyframes blink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.45;
  }
}

/* 预设 */
.presets {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
  margin-top: 5px;
}

.chip {
  padding: 5px 10px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.chip:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #f5f5f7;
}

.chip.active {
  background: rgba(48, 209, 88, 0.2);
  color: #6ee79a;
}

.chip:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 自定义 */
.custom {
  display: flex;
  align-items: center;
  gap: 5px;
}

.custom.disabled {
  opacity: 0.4;
}

.num {
  width: 44px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  color: #f5f5f7;
  outline: none;
  padding: 5px 7px;
  font-size: 12px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.num:focus {
  border-color: rgba(48, 209, 88, 0.6);
}

.num::-webkit-inner-spin-button {
  -webkit-appearance: none;
}

.colon {
  color: rgba(255, 255, 255, 0.35);
}

.set {
  padding: 5px 12px;
  border-radius: 9px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #f5f5f7;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.set:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
}

/* 底部按钮 */
.foot {
  display: flex;
  gap: 15px;
  width: 100%;
  margin-top: 10px;
  padding: 0 45px;
}

.btn {
  width: 30%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px;
  border: none;
  border-radius: 25px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.16s ease, transform 0.16s ease;
}

.btn-ico {
  width: 14px;
  height: 14px;
}

.btn.primary {
  flex: 1;
  background: #30d158;
  color: #06210f;
}

.btn.primary.running {
  background: #ffd60a;
}

.btn.primary.again {
  flex: 1.3;
}

.btn.primary:hover {
  filter: brightness(1.08);
}

.btn.ghost {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.btn.ghost:hover {
  background: rgba(255, 255, 255, 0.16);
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
</style>
