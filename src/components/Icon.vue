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
    <template v-else-if="name === 'clipboard'">
      <rect x="6.4" y="4.6" width="11.2" height="15" rx="2.3" />
      <path d="M9.6 4.6a1.6 1.6 0 0 1 1.6-1.5h1.6a1.6 1.6 0 0 1 1.6 1.5" />
      <path d="M10 10.4h4" />
      <path d="M10 14h4" />
    </template>
    <template v-else-if="name === 'link'">
      <path d="M10.3 13.7a4.2 4.2 0 0 0 5.9 0l3-3a4.2 4.2 0 0 0-5.9-5.9l-1.5 1.5" />
      <path d="M13.7 10.3a4.2 4.2 0 0 0-5.9 0l-3 3a4.2 4.2 0 0 0 5.9 5.9l1.5-1.5" />
    </template>
    <template v-else-if="name === 'external'">
      <path d="M14.2 4.6h5.2v5.2" />
      <path d="M19.4 4.6 11.6 12.4" />
      <path d="M18 14.6v3.5a2 2 0 0 1-2 2H6.6a2 2 0 0 1-2-2V8.7a2 2 0 0 1 2-2h3.5" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect x="8.7" y="8.7" width="10.4" height="10.4" rx="2.3" />
      <path d="M15.3 8.7V6.9a2.3 2.3 0 0 0-2.3-2.3H6.9A2.3 2.3 0 0 0 4.6 6.9v6.1a2.3 2.3 0 0 0 2.3 2.3h1.8" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4.8 6.7h14.4" />
      <path d="M9.5 6.7V5.3a1.7 1.7 0 0 1 1.7-1.7h1.6a1.7 1.7 0 0 1 1.7 1.7v1.4" />
      <path d="M6.6 6.7l.85 12.1a1.7 1.7 0 0 0 1.7 1.6h5.7a1.7 1.7 0 0 0 1.7-1.6l.85-12.1" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="10.8" cy="10.8" r="5.9" />
      <path d="M15.2 15.2 19.6 19.6" />
    </template>
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.4V12l3.1 1.9" />
    </template>
    <template v-else-if="name === 'timer'">
      <circle cx="12" cy="13.6" r="7.2" />
      <path d="M12 13.6V9.7" />
      <path d="M9.8 3.2h4.4" />
      <path d="M12 3.2v3.2" />
    </template>
    <template v-else-if="name === 'bell'">
      <path d="M6.4 16.6V11a5.6 5.6 0 0 1 11.2 0v5.6" />
      <path d="M4.6 16.6h14.8" />
      <path d="M10.2 19.4a1.9 1.9 0 0 0 3.6 0" />
    </template>
    <template v-else-if="name === 'focus'">
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3.4" />
    </template>
    <template v-else-if="name === 'skip'">
      <path d="M6.4 6.3 13.9 12l-7.5 5.7z" fill="currentColor" stroke="none" />
      <rect x="15.5" y="6.3" width="2.4" height="11.4" rx="1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'repeat'">
      <path d="M5.2 10.4a7 7 0 0 1 11.7-4.4l1.8 1.7" />
      <path d="M18.7 3.5v4.3h-4.3" />
      <path d="M18.8 13.6a7 7 0 0 1-11.7 4.4l-1.8-1.7" />
      <path d="M5.3 20.5v-4.3h4.3" />
    </template>
    <!-- 材料箱 -->
    <template v-else-if="name === 'box'">
      <path d="M2.8 4.6h18.4v3.6H2.8z" />
      <path d="M4.2 8.2h15.6v10.4a1.8 1.8 0 0 1-1.8 1.8H6a1.8 1.8 0 0 1-1.8-1.8z" />
      <path d="M9.8 12.2h4.4" />
    </template>
    <template v-else-if="name === 'package'">
      <path d="M12 3.2 20.4 7.6v8.8L12 20.8 3.6 16.4V7.6z" />
      <path d="M3.6 7.6 12 12l8.4-4.4" />
      <path d="M12 12v8.8" />
    </template>
    <template v-else-if="name === 'folder'">
      <path d="M3.4 7.2a2 2 0 0 1 2-2h3.3l2 2.4h7.9a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z" />
    </template>
    <template v-else-if="name === 'folder-open'">
      <path d="M3.4 7.2a2 2 0 0 1 2-2h3.3l2 2.4h7.9a2 2 0 0 1 2 2v1" />
      <path d="M3.4 8.8v8.8a2 2 0 0 0 2 2h11.2a2 2 0 0 0 1.93-1.47l1.55-5.4a1.4 1.4 0 0 0-1.35-1.8H6.2a2 2 0 0 0-1.93 1.45z" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="M6.6 9.6 12 15l5.4-5.4" />
    </template>
    <template v-else-if="name === 'more'">
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'warning'">
      <path d="M12 4.4 21 19.6H3z" />
      <path d="M12 10.2v4" />
      <path d="M12 16.9v.1" />
    </template>
    <template v-else-if="name === 'drop-in'">
      <path d="M12 3.6v10.2" />
      <path d="M7.8 9.8 12 14l4.2-4.2" />
      <path d="M4.6 17.2v1.6a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6v-1.6" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="3.6" y="5" width="16.8" height="14" rx="2.4" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4.4 16.6 9.6 12l4 3.4 2.6-2.2 3.4 3" />
    </template>
    <template v-else-if="name === 'archive'">
      <rect x="3.6" y="5" width="16.8" height="14" rx="2.4" />
      <path d="M9.4 5v6.2l1.5-1.3 1.5 1.3V5" />
      <path d="M3.6 15.4h16.8" />
    </template>
    <!-- 时间中心 -->
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3.3" />
      <path d="M12 2.9v2.3M12 18.8v2.3M2.9 12h2.3M18.8 12h2.3" />
      <path d="M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </template>
    <template v-else-if="name === 'stop'">
      <rect x="6.6" y="6.6" width="10.8" height="10.8" rx="2.4" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'chevron-right'">
      <path d="M9.6 6.6 15 12l-5.4 5.4" />
    </template>
    <template v-else-if="name === 'chart'">
      <path d="M4.6 19.4h14.8" />
      <path d="M7.8 19.4v-6" />
      <path d="M12 19.4V7.4" />
      <path d="M16.2 19.4v-8.6" />
    </template>
    <template v-else-if="name === 'calendar'">
      <rect x="3.6" y="5.2" width="16.8" height="15" rx="2.4" />
      <path d="M3.6 10h16.8" />
      <path d="M8.2 3.3v3.4" />
      <path d="M15.8 3.3v3.4" />
    </template>
    <template v-else-if="name === 'target'">
      <rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3.2" />
      <path d="M9.2 12.2l2.1 2.1 3.9-4.6" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2" />
      <path d="M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6" />
    </template>
    <template v-else-if="name === 'arrow-down'">
      <path d="M12 4.5v12" />
      <path d="M6.9 12.9 12 18l5.1-5.1" />
    </template>
    <template v-else-if="name === 'arrow-up'">
      <path d="M12 19.5v-12" />
      <path d="M6.9 11.1 12 6l5.1 5.1" />
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
