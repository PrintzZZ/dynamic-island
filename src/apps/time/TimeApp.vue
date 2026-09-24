<template>
  <div class="time-app">
    <!-- 工作时间详情是独立子页，不占二级导航。
         它自己没有水平内边距（原本靠 .time-app 的 padding 提供），
         而这里为了卡片贴边已经把 .time-app 的水平 padding 归零，所以由这层补回来。 -->
    <div v-if="view === 'work'" class="work-slot">
      <WorkPanel @close="view = null" />
    </div>

    <!-- 二级导航：横向卡片堆栈。导航逻辑全在 CardCarousel，这里只提供
         「有哪几个模式 / 当前是哪个 / 每个模式画什么 / 面板事件怎么接」。 -->
    <CardCarousel
      v-else
      :modes="MODES"
      :active-id="state.mode"
      :panels="panels"
      :panel-props="panelProps"
      :dot-of="dotOf"
      @select="setMode"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import CardCarousel from '../../components/CardCarousel.vue'
import ClockPanel from './modes/clock/ClockPanel.vue'
import CountdownPanel from './modes/countdown/CountdownPanel.vue'
import ReminderPanel from './modes/reminder/ReminderPanel.vue'
import FocusPanel from './modes/focus/FocusPanel.vue'
import WorkPanel from './WorkPanel.vue'
import { MODES, useTime } from './useTime'

const { state, setMode } = useTime()

// 工作时间子页
const view = ref(null)

// 四个内容面板：业务逻辑全在它们自己身上，Carousel 只决定「摆哪一张、怎么动」
const panels = {
  clock: ClockPanel,
  countdown: CountdownPanel,
  reminder: ReminderPanel,
  focus: FocusPanel,
}

// 面板自己发起的跳转：ClockPanel 的「工作时间」/「下一提醒」。
// CardCarousel 不认识这些语义，由这里把事件接上。
const panelProps = {
  onOpenWork: () => (view.value = 'work'),
  onOpenReminder: () => setMode('reminder'),
}

// 身份行状态圆点：反映运行态而不只是模式身份（showBar 打开时才用得上）
function dotOf(id) {
  if (id === 'countdown') {
    if (state.cd.running) return 'run'
    return state.cd.remaining < state.cd.total ? 'idle' : 'dim'
  }
  if (id === 'focus') return state.focus.running ? 'run' : 'dim'
  if (id === 'reminder') {
    // 与 useTime 里「待催办」的判定保持一致
    const pending = state.reminders.some((r) => r.enabled && !(r.type === 'once' && r.done))
    return pending ? 'idle' : 'dim'
  }
  return 'idle'
}
</script>

<style scoped>
.time-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 水平 padding 归零：卡片要贴到胶囊内缘，两侧才露得出邻卡边缘 */
  padding: 0 0 11px;
}

/* 工作子页沿用原来的水平内边距，保证它和改造前逐像素一致 */
.work-slot {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 13px;
}
</style>
