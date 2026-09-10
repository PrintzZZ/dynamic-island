<template>
  <div class="time-app">
    <div class="switcher">
      <div class="sw-head">
        <span class="sw-title">岛内显示</span>
        <span class="sw-hint">{{ activeMode.name }}</span>
      </div>
      <div class="seg">
        <button
          v-for="m in MODES"
          :key="m.id"
          class="seg-btn"
          :class="{ on: state.mode === m.id }"
          :title="m.name"
          @click="setMode(m.id)"
        >
          <Icon :name="m.icon" class="seg-ico" :style="{ color: m.accent }" />
          <span class="seg-name">{{ m.name }}</span>
        </button>
      </div>
    </div>

    <Transition name="panel" mode="out-in">
      <component :is="panels[state.mode]" :key="state.mode" />
    </Transition>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import ClockPanel from './panels/ClockPanel.vue'
import CountdownPanel from './panels/CountdownPanel.vue'
import ReminderPanel from './panels/ReminderPanel.vue'
import FocusPanel from './panels/FocusPanel.vue'
import { MODES, useTimeApp } from './useTimeApp'

const { state, setMode } = useTimeApp()

const panels = {
  clock: ClockPanel,
  countdown: CountdownPanel,
  reminder: ReminderPanel,
  focus: FocusPanel,
}

const activeMode = computed(() => MODES.find((m) => m.id === state.mode) || MODES[0])
</script>

<style scoped>
.time-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 14px 12px;
}

.switcher {
  flex-shrink: 0;
  padding: 4px 0 10px;
}
.sw-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px 6px;
}
.sw-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}
.sw-hint {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.55);
}
.seg {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
}
.seg-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 5px 2px 6px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.seg-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.8);
}
.seg-btn.on {
  background: rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
}
.seg-ico {
  width: 14px;
  height: 14px;
  opacity: 0.85;
}
.seg-btn.on .seg-ico {
  opacity: 1;
}
.seg-name {
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}

/* 面板切换 */
.panel-enter-active {
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.panel-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.panel-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}
.panel-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.99);
}
</style>
