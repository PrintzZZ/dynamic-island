<template>
  <input
    class="st-slider"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :value="modelValue"
    :disabled="disabled"
    :style="fillStyle"
    @input="emit('update:modelValue', Number($event.target.value))"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

// 已填充的部分用蓝色，和参考稿一致（纯 CSS 无法给 range 做双色，用渐变实现）
const fillStyle = computed(() => {
  const pct = ((props.modelValue - props.min) / Math.max(1, props.max - props.min)) * 100
  return {
    background: `linear-gradient(to right, var(--st-blue) 0%, var(--st-blue) ${pct}%, rgba(255,255,255,0.14) ${pct}%, rgba(255,255,255,0.14) 100%)`,
  }
})
</script>
