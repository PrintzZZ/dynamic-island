<template>
  <!-- 紧凑态：只渲染「当前模式」自己的紧凑视图。
       四个 *Compact 的根节点契约完全一致（height:100% + 横向内边距），
       所以直接从胶囊的紧凑槽里渲染，不需要额外包一层。 -->
  <component :is="activeCompact" />
</template>

<script setup>
import { computed } from 'vue'
import NotesCompact from './modes/notes/NotesCompact.vue'
import TodoCompact from './modes/todo/TodoCompact.vue'
import PhrasesCompact from './modes/phrases/PhrasesCompact.vue'
import ClipboardCompact from './modes/clipboard/ClipboardCompact.vue'
import { MODES, useEfficiency } from './useEfficiency'

const { state } = useEfficiency()

const COMPACTS = {
  notes: NotesCompact,
  todo: TodoCompact,
  phrases: PhrasesCompact,
  clipboard: ClipboardCompact,
}

// state.mode 一定是四个 id 之一，兜底只为防御保存过的脏数据
const activeCompact = computed(() => COMPACTS[state.mode] || COMPACTS[MODES[0].id])
</script>
