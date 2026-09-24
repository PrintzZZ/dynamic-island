<template>
  <div class="phrases-compact">
    <span class="dot" />
    <span class="text">{{ summary }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePhrases } from './usePhrases'

const { phrases } = usePhrases()

const summary = computed(() =>
  phrases.value.length ? `${phrases.value.length} 条常用语` : '添加常用语'
)
</script>

<style scoped>
.phrases-compact {
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
  background: #bf5af2;
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
