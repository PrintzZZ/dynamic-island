<template>
  <div class="focus-panel">
    
    <Transition name="pick">
      <div v-if="pickerOpen" class="picker">
        <div v-if="pendingTodos.length" class="pick-list">
          <button
            v-for="t in pendingTodos.slice(0, 20)"
            :key="t.id"
            class="pick-item"
            :class="{ on: t.id === state.focus.taskId }"
            @click="chooseTask(t)"
          >
            <span class="box" />
            <span class="pick-text">{{ t.text }}</span>
          </button>
        </div>
        <div v-else class="pick-empty">待办里还没有未完成的任务</div>
        <button class="pick-clear" @click="chooseTask(null)">不关联任务</button>
      </div>
    </Transition>
    <!-- ---------- 计时 ---------- -->
    <RingProgress :progress="progress" :color="phaseColor" :size="180">
      <div class="big">{{ fmtMs(focus.remaining) }}</div>
      <div class="phase" :style="{ color: phaseColor }">{{ phaseText }}</div>
    </RingProgress>

    <!-- ---------- 关联任务（读取现有待办） ---------- -->
    <button class="task-card" :class="{ empty: !taskTitle }" @click="pickerOpen = !pickerOpen">
      <Icon name="target" class="task-ico" />
      <span class="task-title">{{ taskTitle || '不关联任务' }}</span>
      <Icon :name="pickerOpen ? 'chevron-down' : 'chevron-right'" class="task-chev" />
    </button>

    

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
import { computed, ref } from 'vue'
import Icon from '../../../components/Icon.vue'
import RingProgress from '../RingProgress.vue'
import { BREAK_PRESETS, FOCUS_PRESETS, fmtMs, useTimeApp } from '../useTimeApp'
import { durText } from '../worktime'
import { useTodos } from '../../todo/useTodos'

const {
  state,
  focusToggle,
  focusSkip,
  focusStop,
  focusSetDuration,
  focusSetTask,
  todayStats,
} = useTimeApp()

// 专注任务直接读现有待办，不另建一套数据
const { todos } = useTodos()
const pendingTodos = computed(() => todos.value.filter((t) => !t.done))

const focus = computed(() => state.focus)
const taskTitle = computed(() => focus.value.taskTitle)

const pickerOpen = ref(false)

function chooseTask(t) {
  focusSetTask(t ? t.id : null, t ? t.text : '')
  pickerOpen.value = false
}

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

/* 关联任务 */
.task-card {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 60%;
  padding: 12px 14px;
  border: none;
  border-radius: 11px;
  background: rgba(191, 90, 242, 0.12);
  color: #f5f5f7;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.16s ease;
  margin-bottom: 10px;
}
.task-card:hover {
  background: rgba(191, 90, 242, 0.2);
}
.task-card.empty {
  background: rgba(255, 255, 255, 0.05);
}
.task-ico {
  width: 14px;
  height: 14px;
  color: #bf5af2;
  flex-shrink: 0;
}
.task-card.empty .task-ico {
  color: rgba(255, 255, 255, 0.4);
}
.task-title {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-card.empty .task-title {
  color: rgba(255, 255, 255, 0.45);
  font-weight: 500;
}
.task-chev {
  width: 12px;
  height: 12px;
  color: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

/* 待办选择 */
.picker {
  width: calc(100% - 26px);
  max-height: 132px;
  overflow-y: auto;
  border-radius: 11px;
  background: rgb(44, 41, 41);
  padding: 5px;
  flex-shrink: 0;
  position: absolute;
  top: 10%;
  left: 13px;
  z-index: 99999;
}
.pick-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.pick-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.14s ease;
}
.pick-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.pick-item.on {
  background: rgba(191, 90, 242, 0.18);
  color: #f5f5f7;
}
.box {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}
.pick-item.on .box {
  border-color: #bf5af2;
  background: rgba(191, 90, 242, 0.5);
}
.pick-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pick-empty {
  padding: 12px 8px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
}
.pick-clear {
  width: 100%;
  margin-top: 3px;
  padding: 6px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  cursor: pointer;
}
.pick-clear:hover {
  background: rgba(255, 255, 255, 0.1);
}
.pick-enter-active {
  transition: all 0.24s cubic-bezier(0.34, 1.5, 0.64, 1);
}
.pick-leave-active {
  transition: all 0.16s ease;
}
.pick-enter-from,
.pick-leave-to {
  opacity: 0;
  transform: translateY(-6px);
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
