<template>
  <div class="music-app">
    <!-- 没在放任何东西 -->
    <div v-if="!hasTrack" class="empty">
      <Icon name="volume" class="empty-ico" />
      <div class="empty-text">未在播放</div>
      <div class="empty-hint">在任意播放器里开始播放，这里会自动出现</div>
    </div>

    <template v-else>
      <!-- ---------- 曲目：封面 + 歌名 / 歌手 ---------- -->
      <div class="track">
        <div class="cover">
          <img v-if="cover" :src="cover" alt="" />
          <Icon v-else name="volume" class="cover-ico" />
        </div>
        <div class="meta">
          <div class="title" :title="track.title">{{ track.title }}</div>
          <div class="artist" :title="track.artist">{{ track.artist || '未知歌手' }}</div>
        </div>

        <div class="eq">
          <span class="lp-wave" :class="{ on: playing && !still }" aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </span>
        </div>
      </div>

      <!-- ---------- 歌词：两行，可点击对轴 ----------
           第一行显示 displayText：换歌/前奏阶段是"歌名 · 歌手"，进入歌词后才是当前句
           （和胶囊同一套逻辑，见 useMusic 的 showTrackIntro）。
           高亮用和胶囊一致的 clip-path 动画层，而不是另做一套渐变。 -->
      <div class="lyric">
        <template v-if="hasLyrics">
          <button class="line now" :class="{ clickable: estimated }" :title="estimated ? '点击把进度对齐到这一句' : ''"
            @click="alignTo(lineIndex)">
            <span class="lyric-line" :class="{ 'is-intro': showTrackIntro }">
              <span class="lyric-base">{{ displayText }}</span>
              <span v-if="hasLyrics && !showTrackIntro" :key="lineMotionKey" class="lyric-fill"
                :class="{ 'is-still': still, 'is-playing': playing }"
                :style="{ ...lineMotionStyle, ...(still ? lineStaticStyle : {}) }" aria-hidden="true">
                {{ displayText }}
              </span>
            </span>
          </button>
          <button v-if="nextLine" class="line next" :class="{ clickable: estimated }"
            :title="estimated ? '点击把进度对齐到这一句' : ''" @click="alignTo(lineIndex + 1)">
            {{ nextLine }}
          </button>
        </template>
        <div v-else class="line placeholder">
          {{ loading ? '正在找歌词…' : '没有找到歌词' }}
        </div>
      </div>

      <!-- ---------- 进度（总长借自歌词匹配记录，位置仍是本地秒表 → 标注"估算"） ---------- -->
      <div class="progress" v-if="duration > 0">
        <div class="bar">
          <div class="bar-fill" :style="{ width: percent + '%' }" />
        </div>
        <span class="time">
          {{ fmt(position) }} / {{ fmt(duration) }}<em v-if="estimated" class="est">估算</em>
        </span>
      </div>
      <div v-else class="progress hint">
        <span>{{ hint }}</span>
      </div>

      <!-- ---------- 控制（播放器没暴露控制能力时整行不显示） ---------- -->
      <div class="foot" v-if="canControl">
        <button class="ctl" title="上一首" :disabled="!canPrev" @click="prev">
          <Icon name="skip" class="ctl-ico flip" />
        </button>
        <button class="ctl main" :title="playing ? '暂停' : '播放'" @click="togglePlay">
          <Icon :name="playing ? 'pause' : 'play'" class="ctl-ico" />
        </button>
        <button class="ctl" title="下一首" :disabled="!canNext" @click="next">
          <Icon name="skip" class="ctl-ico" />
        </button>
      </div>

      <div class="source" v-if="lyricSource">{{ lyricSource }}</div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import { motionScale } from '../../composables/useSettings'
import { useMusic } from './useMusic'

const {
  track,
  hasTrack,
  playing,
  cover,
  hasLyrics,
  lyricSource,
  loading,
  estimated,
  fallback,
  canControl,
  canNext,
  canPrev,
  position,
  duration,
  lineIndex,
  currentLine,
  nextLine,
  displayText,
  showTrackIntro,
  lineMotionStyle,
  lineMotionKey,
  lineStaticStyle,
  lyrics,
  togglePlay,
  next,
  prev,
  realignTo,
} = useMusic()

// 「动画」设为关闭时不做擦除动画，直接用静态进度（和胶囊一致）
const still = computed(() => motionScale() <= 0)

const percent = computed(() => {
  const d = duration.value
  if (!d) return 0
  return Math.min(100, Math.max(0, (position.value / d) * 100))
})

// 拿不到进度时说清楚"为什么"，并且必须告诉用户"能点歌词对轴" ——
// 估算时钟是从"检测到这首歌"开始走的，如果 App 是播到一半才打开，初始就是偏的，
// 手动对轴是唯一的纠偏手段，不提示就等于用不了。
const hint = computed(() => {
  if (!estimated.value) return ''
  if (fallback.value) return '未接入媒体会话 · 歌名读自窗口标题 · 点歌词行对齐进度'
  return '该播放器不上报进度 · 按本地计时估算 · 点歌词行对齐进度'
})

function fmt(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// 点某一句 = 把本地计时对齐到它的起始时间。这是"估算同步"唯一的纠偏手段。
function alignTo(idx) {
  if (!estimated.value) return
  const list = lyrics.value
  if (idx < 0 || idx >= list.length) return
  realignTo(list[idx].t)
}
</script>

<style scoped>
.music-app {
  flex: 1;
  /* 面板宿主（.app-stage/.island-body）是 display:block，光靠 flex:1 撑不满，
     面板一直是内容高度、底下漏一条空白带。height:100% 让它真正吃满，
     多出来的空间由 .lyric 吸收（隐藏控制行后正好补上）。 */
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 底部留出 20px：.source（歌词来源）是 bottom:6px 的绝对定位元素，
     留白不够时最后一行流内容（隐藏控制行后就是提示文案）会和它叠在一起。 */
  padding: 20px;
  gap: 6px;
  overflow: hidden;
}

/* ---------- 空态 ---------- */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.45);
}

.empty-ico {
  width: 26px;
  height: 26px;
  opacity: 0.5;
}

.empty-text {
  font-size: 13px;
  font-weight: 500;
}

.empty-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

/* ---------- 曲目 ---------- */
.track {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  flex-shrink: 0;
  flex-direction: row;
  align-content: flex-start;
  justify-content: center;
  margin-bottom: 5px;
}

.cover {
  width: 45px;
  height: 45px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #FFF;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-ico {
  width: 22px;
  height: 22px;
  color: rgba(255, 255, 255, 0.35);
}

.meta {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #f5f5f7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist {
  margin-top: 2px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 歌词 ---------- */
.lyric {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 靠上排：先看到"歌名/歌手"，歌词紧接着出现在它下面。
     居中会让歌词浮在面板中间、和上面的曲目信息脱节。 */
  justify-content: flex-start;
  gap: 3px;
  overflow: hidden;
}

.line {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 1px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line.now {
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;
}

/* KTV 擦除：和胶囊同一套做法 —— 一层灰色底 + 一层绝对定位的亮色填充，
   亮色层用 clip-path 从左往右揭开。百分比是相对"紧贴文字"的 .lyric-line
   （width: max-content），所以短句不会被提前整句点亮。 */
.lyric-line {
  position: relative;
  display: inline-block;
  width: max-content;
  max-width: 100%;
  vertical-align: bottom;
}

.lyric-base {
  display: block;
  color: rgba(255, 255, 255, 0.42);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 引子阶段（显示歌名 · 歌手）用常规亮度，不做擦除 */
.lyric-line.is-intro .lyric-base {
  color: rgba(255, 255, 255, 0.88);
}

.lyric-fill {
  position: absolute;
  inset: 0;
  display: block;
  color: #f5f5f7;
  white-space: nowrap;
  pointer-events: none;
  /* 和 .lyric-base 用同样的截断方式：两层文字必须逐字对齐，
     否则长句被省略号截断时高亮层会露出半个字。 */
  overflow: hidden;
  text-overflow: ellipsis;
  clip-path: inset(0 100% 0 0);
  animation: lyric-wipe var(--lyric-duration) linear var(--lyric-delay) both;
  animation-play-state: paused;
}

.lyric-fill.is-playing {
  animation-play-state: running;
}

/* 「动画」关闭：不走动画，直接用静态进度百分比 */
.lyric-fill.is-still {
  animation: none;
  clip-path: inset(0 calc(100% - var(--lyric-progress, 0%)) 0 0);
}

@keyframes lyric-wipe {
  from {
    clip-path: inset(0 100% 0 0);
  }

  to {
    clip-path: inset(0 0 0 0);
  }
}

.line.next {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.42);
}

.line.placeholder {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

.line.clickable {
  cursor: pointer;
}

.line.clickable:hover {
  color: #bf5af2;
}

/* ---------- 进度 ---------- */
.progress {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 14px;
}

.progress.hint {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.28);
}

.bar {
  flex: 1;
  height: 5px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 2px;
  background: #30d158;
  transition: width 0.25s linear;
}

.time {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* "估算"角标：总长借自歌词记录、位置是本地秒表时，进度条只能算近似，别假装精确 */
.est {
  margin-left: 4px;
  font-style: normal;
  font-size: 9.5px;
  padding: 0 4px;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.09);
}

/* ---------- 控制 ---------- */
.foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 36px;
}

.ctl {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.ctl:hover:not(:disabled) {
  /* background: rgba(255, 255, 255, 0.1); */
  color: #fff;
}

.ctl:disabled {
  opacity: 0.28;
  cursor: default;
}

.ctl.main {
  width: 40px;
  height: 40px;
  /* background: rgba(255, 255, 255, 0.12); */
}

.ctl.main:hover {
  /* background: rgba(255, 255, 255, 0.2); */
}

.ctl-ico {
  width: 26px;
  height: 26px;
}

.ctl.main .ctl-ico {
  width: 26px;
  height: 26px;
}

.ctl-ico.flip {
  transform: rotate(180deg);
}

.source {
  position: absolute;
  right: 16px;
  bottom: 16px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.12);
  pointer-events: none;
}

/* =========================================================
   EQ
   ========================================================= */

/* =========================================================
   灵动岛音乐波形
   ========================================================= */

.lp-wave {
  width: 15px;
  height: 14px;

  flex: 0 0 15px;

  display: flex;
  align-items: center;
  justify-content: center;

  gap: 1.5px;

  opacity: 0.42;

  overflow: hidden;
}


/* 波形柱 */

.lp-wave i {
  width: 1.8px;
  height: 10px;

  flex: 0 0 1.8px;

  display: block;

  border-radius: 999px;

  background: currentColor;

  transform-origin: center;

  transform: scaleY(0.35);
}


/* 播放状态 */

.lp-wave.on {
  opacity: 0.9;
}

.lp-wave.on i {
  animation:
    music-wave 0.9s ease-in-out infinite;
}


/* 每根不同节奏 */

.lp-wave.on i:nth-child(1) {
  animation-duration: 0.72s;
  animation-delay: -0.15s;
}

.lp-wave.on i:nth-child(2) {
  animation-duration: 0.86s;
  animation-delay: -0.38s;
}

.lp-wave.on i:nth-child(3) {
  animation-duration: 0.68s;
  animation-delay: -0.08s;
}

.lp-wave.on i:nth-child(4) {
  animation-duration: 0.94s;
  animation-delay: -0.52s;
}

.lp-wave.on i:nth-child(5) {
  animation-duration: 0.76s;
  animation-delay: -0.27s;
}

.lp-wave.on i:nth-child(6) {
  animation-duration: 0.88s;
  animation-delay: -0.64s;
}

.lp-wave.on i:nth-child(7) {
  animation-duration: 0.70s;
  animation-delay: -0.42s;
}


/* =========================================================
   波形动画
   ========================================================= */

@keyframes music-wave {

  0%,
  100% {
    transform: scaleY(0.35);
  }

  25% {
    transform: scaleY(0.8);
  }

  50% {
    transform: scaleY(1);
  }

  75% {
    transform: scaleY(0.55);
  }
}
</style>
