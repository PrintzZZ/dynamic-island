<template>
  <section class="st-card">
    <header v-if="title" class="st-card-head">
      <Icon v-if="icon" :name="icon" />
      <span class="st-card-title">{{ title }}</span>
      <span v-if="hint" class="st-card-hint">{{ hint }}</span>
      <slot name="head" />
    </header>
    <div class="st-card-body">
      <slot />
    </div>
    <div v-if="$slots.foot" class="st-card-foot"><slot name="foot" /></div>
  </section>
</template>

<script setup>
import Icon from '../../components/Icon.vue'

defineProps({
  title: { type: String, default: '' },
  icon: { type: String, default: '' },
  hint: { type: String, default: '' },
})
</script>
