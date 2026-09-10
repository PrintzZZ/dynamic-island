<template>
  <div class="ring-wrap" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg class="ring" viewBox="0 0 200 200">
      <circle class="track" cx="100" cy="100" :r="R" />
      <circle
        class="bar"
        cx="100"
        cy="100"
        :r="R"
        :stroke-dasharray="C"
        :stroke-dashoffset="offset"
        :style="{ stroke: color }"
      />
    </svg>
    <div class="center"><slot /></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 剩余比例 0..1（1 = 满圈）
  progress: { type: Number, default: 0 },
  color: { type: String, default: '#ff9f0a' },
  size: { type: Number, default: 176 },
})

const R = 88
const C = 2 * Math.PI * R

const offset = computed(() => {
  const p = Math.min(1, Math.max(0, Number(props.progress) || 0))
  return C * (1 - p)
})
</script>

<style scoped>
.ring-wrap {
  position: relative;
  flex-shrink: 0;
}
.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 10;
}
.bar {
  fill: none;
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.25s linear, stroke 0.3s ease;
}
.center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
</style>
