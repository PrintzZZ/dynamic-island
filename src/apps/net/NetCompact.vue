<template>
  <div class="net-compact">
    <Icon :name="arrowName" class="arr" :class="settings.compactMode" />
    <span class="text">{{ text }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import { useNet, fmtSpeed } from './useNet'

const { settings, stats } = useNet()

const arrowName = computed(() => (settings.compactMode === 'up' ? 'arrow-up' : 'arrow-down'))

const text = computed(() => {
  if (!stats.active) return '--'
  const bps = settings.compactMode === 'up' ? stats.up : stats.down
  const f = fmtSpeed(bps)
  return `${f.v} ${f.u}`
})
</script>

<style scoped>
.net-compact {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 100%;
  padding: 0 16px;
  color: #f5f5f7;
}
.arr {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: #64d2ff;
  transition: color 0.2s ease;
}
/* 设置切换后箭头颜色跟随方向 */
.arr.down {
  color: #64d2ff;
}
.arr.up {
  color: #ff9f0a;
}
.text {
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  transform: translateY(-1px); /* 光学校正：抵消字体基线偏下的视差 */
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
  white-space: nowrap;
}
</style>
