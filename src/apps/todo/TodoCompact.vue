<template>
  <div class="todo-compact">
    <span class="check">✓</span>
    <span class="text">{{ summary }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTodos } from './useTodos'

const { pending } = useTodos()

const summary = computed(() => {
  if (pending.value === 0) return '全部完成'
  return `${pending.value} 项待办`
})
</script>

<style scoped>
.todo-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
  color: #f5f5f7;
}
.check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #30d158;
  color: #0a0a0a;
  font-size: 10px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.text {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  transform: translateY(-1px); /* 光学校正：抵消字体基线偏下的视差 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
