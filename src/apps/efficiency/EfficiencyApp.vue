<template>
  <div class="eff-app">
    <!-- 二级导航：横向卡片堆栈。导航逻辑全在 CardCarousel，这里只提供
         「有哪几个模式 / 当前是哪个 / 每个模式画什么」。
         四个模式的内容组件就是原来那四个应用本身，业务代码一行没动。 -->
    <CardCarousel
      :modes="MODES"
      :active-id="state.mode"
      :panels="panels"
      @select="setMode"
    />
  </div>
</template>

<script setup>
import CardCarousel from '../../components/CardCarousel.vue'
import NotesPanel from './modes/notes/NotesPanel.vue'
import TodoPanel from './modes/todo/TodoPanel.vue'
import PhrasesPanel from './modes/phrases/PhrasesPanel.vue'
import ClipboardPanel from './modes/clipboard/ClipboardPanel.vue'
import { MODES, useEfficiency } from './useEfficiency'

const { state, setMode } = useEfficiency()

// 四个模式的内容组件。它们的根节点都是 height:100% 的应用级容器，
// 正好和 CardCarousel 卡片（flex 纵向 + 定高）的契约对上。
const panels = {
  notes: NotesPanel,
  todo: TodoPanel,
  phrases: PhrasesPanel,
  clipboard: ClipboardPanel,
}
</script>

<style scoped>
/* 和 .time-app 保持同一套外壳：撑满、纵向、水平 padding 归零让卡片贴边，
   底部留 11px 给卡片和胶囊下边缘之间留呼吸。 */
.eff-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 0 11px;
}
</style>
