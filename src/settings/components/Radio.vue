<template>
  <div class="st-radios">
    <button
      v-for="o in options"
      :key="String(o.value)"
      class="st-radio"
      :class="{ on: o.value === modelValue }"
      @click="emit('update:modelValue', o.value)"
    >
      <span class="dot" />
      <span>{{ o.label }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  // [{ value, label }]
  options: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])
</script>
