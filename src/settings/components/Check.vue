<template>
  <button class="st-check" :class="{ on: modelValue }" @click="emit('update:modelValue', !modelValue)">
    <span class="st-box"><Icon name="check" /></span>
    <span class="st-check-label">{{ label }}</span>
    <span v-if="hint" class="st-check-hint">{{ hint }}</span>
  </button>
</template>

<script setup>
import Icon from '../../components/Icon.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
</script>
