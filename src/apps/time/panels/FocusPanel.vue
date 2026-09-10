<template>
  <div class="focus-panel">
    <RingProgress
      :progress="progress"
      :color="phaseColor"
      :size="146"
    >
      <div class="big">{{ fmtMs(focus.remaining) }}</div>
      <div class="phase" :style="{ color: phaseColor }">{{ phaseText }}</div>
    </RingProgress>

    <div class="controls">
      <button class="ghost" title="重置" @click="focusReset">
        <Icon name="reset" class="ghost-ico" />
      </button>
      <button class="play" :class="{ running: focus.running }" title="开始 / 暂停" @click="focusToggle">
        <Transition name="swap" mode="out-in">
          <Icon
            :key="focus.running ? 'pause' : 'play'"
            :name="focus.running ? 'pause' : 'play'"
            class="play-ico"
          />
        </Transition>
      </button>
      <button class="ghost" title="跳到下一阶段" @click="focusSkip">
        <Icon name="skip" class="ghost-ico" />
      </button>
    </div>

    <div class="rounds">
      已完成 <b>{{ focus.rounds }}</b> 轮专注
    </div>

    <div class="setting">
      <span class="label">专注</span>
      <div class="chips">
        <button
          v-for="m in FOCUS_PRESETS"
          :key="`f${m}`"
          class="chip focus"
          :class="{ active: focus.focusMs === m * 60000 }"
          @click="focusSetDuration('focus', m * 60000)"
        >
          {{ m }}m
        </button>
      </div>
    </div>

    <div class="setting">
      <span class="label">休息</span>
      <div class="chips">
        <button
          v-for="m in BREAK_PRESETS"
          :key="`b${m}`"
          class="chip break"
          :class="{ active: focus.breakMs === m * 60000 }"
          @click="focusSetDuration('break', m * 60000)"
        >
          {{ m }}m
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../../components/Icon.vue'
import RingProgress from '../RingProgress.vue'
import { BREAK_PRESETS, FOCUS_PRESETS, fmtMs, useTimeApp } from '../useTimeApp'

const { state, focusToggle, focusReset, focusSkip, focusSetDuration } = useTimeApp()

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
</script>

<style scoped>
.focus-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 2px 0;
}
.big {
  font-size: 36px;
  font-weight: 300;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.phase {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 18px;
}
.ghost {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #f5f5f7;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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
  background: #bf5af2;
  color: #0a0a0a;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease;
}
.play.running {
  background: #cb78f7;
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

.rounds {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.45);
}
.rounds b {
  color: #cb78f7;
  font-size: 13px;
}

.setting {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  width: 28px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}
.chips {
  display: flex;
  gap: 6px;
}
.chip {
  padding: 4px 10px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}
.chip:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f5f5f7;
}
.chip.focus.active {
  background: rgba(191, 90, 242, 0.22);
  color: #cb78f7;
}
.chip.break.active {
  background: rgba(48, 209, 88, 0.2);
  color: #30d158;
}
</style>
