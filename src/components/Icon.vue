<template>
  <svg
    class="ic"
    :class="`ic--${name}`"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- 填充型图标 -->
    <template v-if="name === 'play'">
      <path
        d="M8.6 6.1a.9.9 0 0 1 1.38-.76l7.7 5.9a.9.9 0 0 1 0 1.52l-7.7 5.9a.9.9 0 0 1-1.38-.76z"
        fill="currentColor"
        stroke="none"
      />
    </template>
    <template v-else-if="name === 'pause'">
      <rect x="6.9" y="5.2" width="3.4" height="13.6" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.7" y="5.2" width="3.4" height="13.6" rx="1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'dot-on'">
      <circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'quote'">
      <path
        d="M9.9 5.1C6.4 6.5 4.6 9.2 4.6 12.6V19h6.7v-7h-3.2c0-2.3 1.3-3.9 3.5-4.8zm9.4 0c-3.5 1.4-5.3 4.1-5.3 7.5V19h6.7v-7h-3.2c0-2.3 1.3-3.9 3.5-4.8z"
        fill="currentColor"
        stroke="none"
      />
    </template>

    <!-- 线条型图标 -->
    <template v-else-if="name === 'reset'">
      <path d="M20.2 12a8.2 8.2 0 1 1-2.45-5.85" />
      <polyline points="20.6 3.4 20.6 8.1 15.9 8.1" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </template>
    <template v-else-if="name === 'back'">
      <path d="M14.8 6.2L8.6 12l6.2 5.8" />
    </template>
    <template v-else-if="name === 'drag'">
      <path d="M8.3 9.4h7.4" />
      <path d="M8.3 12h7.4" />
      <path d="M8.3 14.6h7.4" />
    </template>
    <template v-else-if="name === 'dot-off'">
      <circle cx="12" cy="12" r="4.1" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="M5.7 12.6l4.1 4.1 8.5-9.3" />
    </template>
    <template v-else-if="name === 'pencil'">
      <path d="M4.2 19.8l1.15-4.4L17.6 3.6a2.06 2.06 0 0 1 2.92 0l-.05.05a2.06 2.06 0 0 1 0 2.92L8.6 18.65z" />
      <path d="M14.3 6.9l2.6 2.6" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  name: { type: String, required: true },
})
</script>

<style scoped>
.ic {
  display: block;
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}
</style>
