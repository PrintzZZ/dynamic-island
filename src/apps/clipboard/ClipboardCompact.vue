<template>
  <div class="clip-compact">
    <Icon
      :name="isLink ? 'link' : 'clipboard'"
      class="ico"
      :class="{ link: isLink }"
    />
    <span class="text">{{ text }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import { useClipboard } from './useClipboard'

const { items, latest } = useClipboard()

const isLink = computed(() => !!(latest.value && latest.value.url))

const text = computed(() => {
  const it = latest.value
  if (!it) return items.value.length ? `${items.value.length} 条记录` : '暂无记录'
  const t = String(it.text).replace(/\s+/g, ' ').trim()
  return t.length > 9 ? `${t.slice(0, 9)}…` : t
})
</script>

<style scoped>
.clip-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
  color: #f5f5f7;
}
.ico {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.6);
}
.ico.link {
  color: #5ac8fa;
}
.text {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  transform: translateY(-1px); /* 光学校正：抵消字体基线偏下的视差 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
