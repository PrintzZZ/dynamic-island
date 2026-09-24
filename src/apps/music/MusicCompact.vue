<template>
  <!-- 紧凑态：只有一行，显示"歌名 · 歌手"（歌词由 LyricPill 在胶囊里负责，
       这里是"胶囊显示歌词"关掉时、或从标签栏切过来时的样子）。 -->
  <div class="music-compact">
    <span class="dot" :class="{ on: playing }" />
    <span class="txt">{{ hasTrack ? fallbackText : '未在播放' }}</span>
  </div>
</template>

<script setup>
import { useMusic } from './useMusic'

const { hasTrack, playing, fallbackText } = useMusic()
</script>

<style scoped>
.music-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
  color: #f5f5f7;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.25);
  transition: background 0.2s ease;
}
.dot.on {
  background: #30d158;
}
.txt {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
