<template>
  <span class="tile" :style="{ background: meta.bg, color: meta.fg }">
    <span v-if="meta.label" class="tile-label">{{ meta.label }}</span>
    <Icon v-else :name="meta.icon" class="tile-glyph" />
  </span>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../../components/Icon.vue'

const props = defineProps({
  ext: { type: String, default: '' },
})

// 文件类型 → 图标块配色。用 SVG / 字母而不是 emoji，保证各平台渲染一致
const TYPES = {
  image: {
    exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'ico', 'tif', 'tiff'],
    bg: 'rgba(48, 209, 88, 0.18)',
    fg: '#30D158',
    icon: 'image',
  },
  pdf: { exts: ['pdf'], bg: 'rgba(255, 69, 58, 0.18)', fg: '#FF453A', label: 'PDF' },
  word: { exts: ['doc', 'docx', 'rtf', 'odt', 'wps'], bg: 'rgba(10, 132, 255, 0.18)', fg: '#0A84FF', label: 'W' },
  excel: { exts: ['xls', 'xlsx', 'csv', 'ods', 'et'], bg: 'rgba(191, 90, 242, 0.18)', fg: '#BF5AF2', label: 'X' },
  ppt: { exts: ['ppt', 'pptx', 'odp', 'dps'], bg: 'rgba(255, 159, 10, 0.18)', fg: '#FF9F0A', label: 'P' },
  zip: { exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'], bg: 'rgba(255, 214, 10, 0.18)', fg: '#FFD60A', icon: 'archive' },
  text: {
    exts: ['txt', 'md', 'json', 'log', 'xml', 'yml', 'yaml', 'ini'],
    bg: 'rgba(255, 255, 255, 0.1)',
    fg: 'rgba(255, 255, 255, 0.72)',
    icon: 'clipboard',
  },
}

const FALLBACK = { bg: 'rgba(255, 255, 255, 0.1)', fg: 'rgba(255, 255, 255, 0.55)', icon: 'clipboard' }

const meta = computed(() => {
  const e = String(props.ext || '').toLowerCase()
  for (const key of Object.keys(TYPES)) {
    if (TYPES[key].exts.includes(e)) return TYPES[key]
  }
  return FALLBACK
})
</script>

<style scoped>
.tile {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tile-glyph {
  width: 15px;
  height: 15px;
}
.tile-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: -0.2px;
  line-height: 1;
}
</style>
