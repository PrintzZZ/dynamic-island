<template>
  <div class="notes-compact">
    <span class="dot" />
    <Icon name="pencil" class="note-ico" />
    <span class="text">{{ summary }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import { useNotes } from './useNotes'

const { notes } = useNotes()

const summary = computed(() => {
  const n = notes.value.length
  if (n === 0) return '新建便签'
  const latest = notes.value[0]
  return latest.title || latest.content || `${n} 条便签`
})
</script>

<style scoped>
.notes-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
  color: #f5f5f7;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffd60a;
  animation: pulse 2s ease-in-out infinite;
}
.note-ico {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: #ffd60a;
}
.text {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  transform: translateY(-1px); /* 光学校正：抵消字体基线偏下的视差 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.7);
  }
}
</style>
