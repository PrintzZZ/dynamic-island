<template>
  <button class="st-toggle" :class="{ on: modelValue }" :disabled="disabled" @click="emit('update:modelValue', !modelValue)">
    <span class="sr" />
  </button>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
