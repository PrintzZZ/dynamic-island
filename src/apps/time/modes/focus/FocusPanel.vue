<template>
  <div class="focus-panel">
    <!-- ---------- 计时 ---------- -->
    <RingProgress :progress="progress" :color="phaseColor" :size="180">
      <div class="big">{{ fmtMs(focus.remaining) }}</div>
      <div class="phase" :style="{ color: phaseColor }">{{ phaseText }}</div>
    </RingProgress>

    <!-- ---------- 参数 ---------- -->
    <div class="meta-row">
      <Icon name="clock" class="meta-ico" />
      <span>专注 {{ Math.round(focus.focusMs / 60000) }} 分钟</span>
      <i />
      <span>休息 {{ Math.round(focus.breakMs / 60000) }} 分钟</span>
    </div>
    <div class="meta-row sub">
      <span>{{ roundText }}</span>
      <i />
      <span>今日 {{ durText(todayStats.minutes) }}</span>
      <button class="skip" title="跳到下一阶段" @click="focusSkip">
        <Icon name="skip" />
      </button>
    </div>

    <!-- ---------- 控制 ---------- -->
    <div class="foot">
      <button class="btn ghost" @click="focusToggle">
        <Transition name="swap" mode="out-in">
          <Icon
            :key="focus.running ? 'pause' : 'play'"
            :name="focus.running ? 'pause' : 'play'"
            class="btn-ico"
          />
        </Transition>
        {{ focus.running ? '暂停' : '开始' }}
      </button>
      <button class="btn primary" @click="focusStop">
        <Icon name="close" class="btn-ico" />结束
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../../../components/Icon.vue'
import RingProgress from '../../RingProgress.vue'
import { BREAK_PRESETS, FOCUS_PRESETS, fmtMs, useTime } from '../../useTime'
import { durText } from '../../worktime'

const { state, focusToggle, focusSkip, focusStop, focusSetDuration, todayStats } = useTime()

const focus = computed(() => state.focus)

const phaseColor = computed(() => (focus.value.phase === 'focus' ? '#BF5AF2' : '#30D158'))

const phaseText = computed(() => {
  if (focus.value.running) return focus.value.phase === 'focus' ? '专注中' : '休息中'
  return focus.value.phase === 'focus' ? '准备专注' : '准备休息'
})

const progress = computed(() => {
  const total = focus.value.phase === 'focus' ? focus.value.focusMs : focus.value.breakMs
  return total > 0 ? focus.value.remaining / total : 0
})

const roundText = computed(() =>
  focus.value.phase === 'focus' ? `第 ${focus.value.rounds + 1} 轮` : `已完成 ${focus.value.rounds} 轮`
)

void FOCUS_PRESETS
void BREAK_PRESETS
void focusSetDuration
</script>

<style scoped>
.focus-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 2px 0 0;
  overflow-y: auto;
}

/* 计时 */
.big {
  font-size: 30px;
  font-weight: 500;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
}
.phase {
  font-size: 14px;
  font-weight: 300;
  letter-spacing: 1px;
}

/* 参数 */
.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  padding: 5px 0;
}
.meta-row.sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: -3px;
}
.meta-row i {
  width: 1px;
  height: 9px;
  background: rgba(255, 255, 255, 0.18);
}
.meta-ico {
  width: 14px;
  height: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-right: -2px;
}
/* 「跳到下一阶段」收进副行右侧，不占主按钮位 */
.skip {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-top: -4px;
  margin-bottom: -4px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}
.skip:hover {
  background: rgba(191, 90, 242, 0.3);
  color: #fff;
}
.skip svg {
  width: 11px;
  height: 11px;
}

/* 控制 */
.foot {
  display: flex;
  gap: 15px;
  width: 100%;
  margin-top: 5px;
  padding: 0 30px;
}
.btn {
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
  background: #2B3289;
  color: #fff;
}
.btn.primary:hover {
  background: #3c43a1;
  /* filter: brightness(1.1); */
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
