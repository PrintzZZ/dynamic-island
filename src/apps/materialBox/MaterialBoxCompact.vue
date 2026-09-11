<template>
  <div class="mb-compact">
    <span class="ico" :class="{ done: isComplete }">
      <Icon :name="iconName" class="ico-svg" />
    </span>
    <span class="text">
      <span class="t1">材料箱</span>
      <span class="t2">{{ line2 }}</span>
    </span>
    <span class="right">
      <span v-if="adding" class="spin" />
      <Icon v-else-if="isComplete && hasFiles" name="check" class="done-ico" />
      <span v-else-if="badge" class="badge">{{ badge }}</span>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import { useMaterialBox } from './useMaterialBox'

const { activeTask, adding, taskProgress, isComplete } = useMaterialBox()

const hasFiles = computed(() => (activeTask.value?.files.length || 0) > 0)

const iconName = computed(() => (isComplete.value && hasFiles.value ? 'check' : 'box'))

const line2 = computed(() => {
  if (adding.value) return '正在添加…'
  const t = activeTask.value
  if (!t) return '暂无任务'
  if (t.requiredCount > 0) {
    if (isComplete.value) return `材料已齐 · ${t.files.length} 项`
    return t.name
  }
  return t.files.length ? `${t.files.length} 项材料` : t.name
})

// 右侧角标：有清单时显示 3/4，否则显示数量
const badge = computed(() => {
  const t = activeTask.value
  if (!t) return ''
  if (t.requiredCount > 0) return `${t.collected}/${t.requiredCount}`
  return t.files.length ? String(t.files.length) : ''
})

void taskProgress
</script>

<style scoped>
.mb-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 14px;
  color: #f5f5f7;
}
.ico {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: #0a84ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.3s ease;
}
.ico.done {
  background: #30d158;
  animation: donePop 0.4s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes donePop {
  0% {
    transform: scale(0.7);
  }
  100% {
    transform: scale(1);
  }
}
.ico-svg {
  width: 12px;
  height: 12px;
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.t1 {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
}
.t2 {
  font-size: 10px;
  line-height: 1.1;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.badge {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  font-variant-numeric: tabular-nums;
}
.done-ico {
  width: 14px;
  height: 14px;
  color: #30d158;
  stroke-width: 3;
}
.spin {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-top-color: #0a84ff;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
