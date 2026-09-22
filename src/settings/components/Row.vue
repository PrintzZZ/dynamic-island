<template>
  <div class="st-row" :class="{ stack }">
    <div class="st-row-text">
      <div class="st-row-label">{{ label }}</div>
      <div v-if="desc" class="st-row-desc">{{ desc }}</div>
    </div>
    <div class="st-row-ctl">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  desc: { type: String, default: '' },
  // 选项多时把控件换行放到标题下面
  stack: { type: Boolean, default: false },
})
</script>
