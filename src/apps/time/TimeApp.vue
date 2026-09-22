<template>
  <div class="time-app">
    <!-- 工作时间详情是独立子页，不占模式切换器 -->
    <WorkPanel v-if="view === 'work'" />

    <template v-else>
      <!-- ---------- 应用头 ---------- -->
      <!-- ---------- 重复-暂不启用 ---------- -->
      <!-- <div class="app-head">
        <span class="app-ico" :style="{ background: activeMode.accent }">
          <Icon :name="activeMode.icon" class="app-ico-svg" />
        </span>
        <div class="app-text">
          <span class="app-title">时间</span>
          <span class="app-sub">{{ activeMode.name }}</span>
        </div>
      </div> -->

      <!-- ---------- 岛内显示（同时也是模式切换） ---------- -->
      <div class="seg">
        <button
          v-for="m in visibleModes"
          :key="m.id"
          class="seg-btn"
          :class="{ on: state.mode === m.id }"
          :title="m.name"
          @click="setMode(m.id)"
        >
          <Icon :name="m.icon" class="seg-ico" :style="{ color: state.mode === m.id ? m.accent : undefined }" />
          <span class="seg-name">{{ m.name }}</span>
        </button>
      </div>
      
      <!-- ---------- 面板 ---------- -->
      <Transition name="panel" mode="out-in">
        <component
          :is="panels[state.mode]"
          :key="state.mode"
          @open-work="view = 'work'"
          @open-reminder="setMode('reminder')"
        />
      </Transition>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '../../components/Icon.vue'
import ClockPanel from './panels/ClockPanel.vue'
import CountdownPanel from './panels/CountdownPanel.vue'
import ReminderPanel from './panels/ReminderPanel.vue'
import FocusPanel from './panels/FocusPanel.vue'
import WorkPanel from './panels/WorkPanel.vue'
import { MODES, useTimeApp, visibleModes } from './useTimeApp'

const { state, setMode } = useTimeApp()

const view = ref(null)

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
  padding: 0 13px 11px;
}

/* 应用头：给"当前是哪个模式"一个明确标题 */
.app-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 1px 1px 9px;
  flex-shrink: 0;
}
.app-ico {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  transition: background 0.3s ease;
}
.app-ico-svg {
  width: 14px;
  height: 14px;
}
.app-text {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}
.app-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #f5f5f7;
}
.app-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.42);
}

/* 模式切换器 */
.seg {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  margin-bottom: 9px;
}
.seg-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 2px;
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
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.75;
}
.seg-btn.on .seg-ico {
  opacity: 1;
}
.seg-name {
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 面板切换 */
.panel-enter-active {
  transition: opacity 0.26s ease, transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}
.panel-leave-active {
  transition: opacity 0.13s ease, transform 0.13s ease;
}
.panel-enter-from {
  opacity: 0;
  transform: translateY(9px) scale(0.985);
}
.panel-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.99);
}
</style>
