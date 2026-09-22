<template>
  <select
    class="st-select"
    :value="modelValue"
    :disabled="disabled"
    @change="emit('update:modelValue', cast($event.target.value))"
  >
    <option v-for="o in options" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
  </select>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
// 保留原值的类型（数字选项不要变成字符串）
const cast = (v) => {
  const hit = props.options.find((o) => String(o.value) === String(v))
  return hit ? hit.value : v
}
</script>

<style scoped>
.st-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
