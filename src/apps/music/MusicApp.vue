<template>
  <div class="music-app">
    <!-- 没在放任何东西。
         armed=false 表示常驻的媒体会话监听还没被按需拉起（用户第一次打开音乐面板时启动），
         这时显示"正在连接播放器…"而不是"未在播放" —— 后者会让人以为坏了。 -->
    <div v-if="!hasTrack" class="empty">
      <Icon name="volume" class="empty-ico" />
      <div class="empty-text">{{ armed ? '未在播放' : '正在连接播放器…' }}</div>
      <div class="empty-hint">
        {{ armed ? '在任意播放器里开始播放，这里会自动出现' : '首次打开需要启动媒体会话监听，稍等一下' }}
      </div>
    </div>

    <template v-else>
      <!-- ---------- 背景：封面磨砂。整块面板的色调都来自封面，
           这是"沉浸式播放器"最省事也最有效的做法（参考图里那层暖绿就是专辑封面。 ---------- -->
      <div class="bd" aria-hidden="true">
        <Transition name="bd">
          <img v-if="cover" :key="cover" class="bd-img" :src="cover" alt="" />
        </Transition>
        <div class="bd-dim" />
      </div>

      <!-- ---------- 顶栏：封面 + 歌名 / 歌手 + 播放状态 ---------- -->
      <div class="head">
        <div class="cover">
          <img v-if="cover" :src="cover" alt="" />
          <Icon v-else name="volume" class="cover-ico" />
        </div>
        <div class="meta">
          <div class="title" :title="track.title">{{ track.title }}</div>
          <div class="artist" :title="track.artist">{{ track.artist || '未知歌手' }}</div>
        </div>
        <span class="badge" :class="{ on: playing }">
          <span class="badge-note" aria-hidden="true">♪</span>
          {{ playing ? '正在播放' : '已暂停' }}
        </span>
      </div>

      <!-- ---------- 歌词窗口 ----------
           当前句：正常亮度、加粗放大、白色微光，保留 ktv 擦除（已唱部分逐字点亮）；
           其它句：模糊 + 半透明，随着当前句切换平滑地"对焦 / 失焦"；
           整块用 translate3d 上移，让当前句停在窗口顶部；
           最底部有渐隐遮罩。 -->
      <div class="lyric">
        <div v-if="!hasLyrics" class="lyric-empty">
          {{ loading ? '正在找歌词…' : '没有找到歌词' }}
        </div>
        <div
          v-else
          ref="lnTrackEl"
          class="ln-track"
          :class="{ anim: animate }"
          :style="{ transform: `translate3d(0, ${-offset}px, 0)` }"
        >
          <div
            v-for="(l, k) in lyrics"
            :key="k"
            class="ln"
            :class="{
              now: k === activeIndex,
              future: k > activeIndex,
              past: k < activeIndex,
              clickable: estimated,
            }"
            :title="estimated ? '点击把进度对齐到这一句' : ''"
            @click="alignTo(k)"
          >
            <span v-if="k === activeIndex" class="ln-now">
              <span class="ln-base">{{ l.text }}</span>
              <span
                v-if="l.text"
                :key="lineMotionKey"
                class="ln-fill"
                :class="{ 'is-still': still, 'is-playing': playing }"
                :style="{ ...lineMotionStyle, ...(still ? lineStaticStyle : {}) }"
                aria-hidden="true"
              >{{ l.text }}</span>
            </span>
            <span v-else class="ln-txt">{{ l.text }}</span>
          </div>
        </div>
      </div>

      <!-- ---------- 进度（总长借自歌词匹配记录，位置仍是本地秒表 → 标注"估算"） ---------- -->
      <div class="progress">
        <span class="t">{{ fmt(position) }}</span>
        <div class="bar">
          <div class="bar-fill" :style="{ width: percent + '%' }">
            <span class="bar-head" />
          </div>
        </div>
        <span class="t">{{ fmt(duration) }}</span>
        <em v-if="estimated" class="est">估算</em>
        <span class="lp-wave" :class="{ on: playing && !still }" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </span>
      </div>

      <!-- 拿不到进度时必须说清"为什么"，并提示"能点歌词对轴" ——
           估算时钟是从检测到这首歌开始走的，播到一半才打开时初始就是偏的，
           不提示就等于没法纠偏。 -->
      <div class="hint" v-if="hint">{{ hint }}</div>

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
import { computed, onMounted, ref, watch } from 'vue'
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
  armed,
  canControl,
  canNext,
  canPrev,
  position,
  duration,
  lineIndex,
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

const hint = computed(() => {
  if (!estimated.value) return ''
  if (fallback.value) return '未接入媒体会话 · 点歌词行对齐进度'
  return '播放器不上报进度 · 按本地计时估算 · 点歌词行对齐'
})

/* ------------------------------------------------------------------
 * 歌词滚动
 *
 * 每一行高度固定（--ln-h），所以"当前句停在第几行"是纯算术，不需要
 * 逐行测量、也不会有测量时序问题。唯一要读一次的就是行高本身
 * （字号由 CSS 决定，写死在 JS 里容易和样式表脱节）。
 * ------------------------------------------------------------------ */
const ROW_FALLBACK = 26

const lnTrackEl = ref(null)
const offset = ref(0)
const animate = ref(false)

// 还没进第一句时高亮第一句：一窗模糊的歌词里总得有个"当前"，否则像坏了。
const activeIndex = computed(() => {
  if (lineIndex.value >= 0) return lineIndex.value
  return lyrics.value.length ? 0 : -1
})

function rowHeight() {
  const el = lnTrackEl.value && lnTrackEl.value.firstElementChild
  return (el && el.offsetHeight) || ROW_FALLBACK
}

function syncOffset() {
  const i = activeIndex.value
  offset.value = i <= 0 ? 0 : i * rowHeight()
}

onMounted(() => {
  syncOffset()
  // 首帧不要动画：从 0 滑到当前位置会像"面板自己滚了一下"
  requestAnimationFrame(() => requestAnimationFrame(() => (animate.value = true)))
})

watch([activeIndex, () => lyrics.value.length], syncOffset, { flush: 'post' })

// 换歌时直接跳到位（不让它横跨几十行滑过去）。
// 注意必须监听"曲目标识"而不是 track 对象本身 —— 主进程每次广播都会给一个新的
// snapshot 对象，watch(track) 会每帧触发，于是 animate 永远被重置、过渡动画永远不会跑。
const trackKey = computed(() => {
  const t = track.value
  if (!t) return ''
  return t.mediaId || t.mediaSessionId || t.id || `${t.title || ''}|${t.artist || ''}|${t.durationMs || 0}`
})

watch(trackKey, () => {
  animate.value = false
  syncOffset()
  requestAnimationFrame(() => (animate.value = true))
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
  position: relative;
  flex: 1;
  /* 面板宿主是 display:block，光靠 flex:1 撑不满，height:100% 才真正吃满 */
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
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

/* ---------- 磨砂背景 ---------- */
.bd {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  /* 顶栏是纯黑的，背景直接贴上来会出现一条硬边 —— 让它自上而下渐入 */
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 16%, #000 100%);
  mask-image: linear-gradient(180deg, transparent 0, #000 16%, #000 100%);
}

.bd-img {
  position: absolute;
  /* 放大再模糊：否则边缘会透出没糊到的原图 */
  inset: -28%;
  width: 156%;
  height: 156%;
  object-fit: cover;
  filter: blur(26px) saturate(1.35) brightness(0.72);
  opacity: 0.62;
}

/* 压暗 + 上下收边：保证任何封面上文字都可读 */
.bd-dim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 120% at 20% 0%, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.62) 70%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.34), rgba(0, 0, 0, 0.1) 42%, rgba(0, 0, 0, 0.5));
}

.bd-enter-active,
.bd-leave-active {
  transition: opacity 0.55s ease;
}

.bd-enter-from,
.bd-leave-to {
  opacity: 0;
}

/* ---------- 顶栏 ---------- */
.head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  flex-shrink: 0;
}

.cover {
  width: 40px;
  height: 40px;
  border-radius: 9px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-ico {
  width: 20px;
  height: 20px;
  color: rgba(255, 255, 255, 0.35);
}

.meta {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: #f5f5f7;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist {
  margin-top: 1px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.62);
  font-size: 10.5px;
  font-weight: 500;
  backdrop-filter: blur(6px);
  transition: color 0.3s ease, background 0.3s ease;
}

.badge.on {
  color: rgba(255, 255, 255, 0.82);
}

.badge-note {
  font-size: 11px;
  line-height: 1;
  color: #30d158;
}

.badge.on .badge-note {
  animation: notePulse 2.4s ease-in-out infinite;
}

@keyframes notePulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.18);
  }
}

/* ---------- 歌词窗口 ----------
   行高固定，当前句停在第 0 行；其它行模糊半透明；底部渐隐。
   行高写进 --ln-h，JS 只读一次实际行高来算位移。 */
.lyric {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  margin: 8px 0 6px;
  overflow: hidden;
  /* 最底部渐隐：往下还有歌词，但让它在边缘化开（当前句永远在最上面，不会被吃掉） */
  -webkit-mask-image: linear-gradient(180deg, #000 0, #000 62%, rgba(0, 0, 0, 0.4) 86%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 0, #000 62%, rgba(0, 0, 0, 0.4) 86%, transparent 100%);
}

.ln-track {
  --ln-h: 26px;
  position: relative;
  will-change: transform;
}

/* 切换当前句时整块上移；首帧 / 换歌时不要动画 */
.ln-track.anim {
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

.ln {
  height: var(--ln-h);
  line-height: var(--ln-h);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    font-size 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    color 0.42s ease,
    opacity 0.42s ease,
    filter 0.42s ease,
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: left center;
}

/* 其他句：模糊 + 半透明。越远越淡一点，形成层次 */
.ln.future {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.72);
  opacity: 0.42;
  filter: blur(1.35px);
  transform: translateY(1px);
}

.ln.past {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  opacity: 0.28;
  filter: blur(1.7px);
}

/* 当前句：清晰、加粗、放大、白色微光 */
.ln.now {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  opacity: 1;
  filter: none;
  transform: none;
  letter-spacing: 0.3px;
  text-shadow: 0 0 22px rgba(255, 255, 255, 0.3), 0 2px 10px rgba(0, 0, 0, 0.45);
}

/* 呼吸感：光晕极缓地明暗一次，不抢戏 */
.ln.now .ln-now {
  animation: nowGlow 3.6s ease-in-out infinite;
}

@keyframes nowGlow {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.94;
  }
}

.ln.clickable {
  cursor: pointer;
}

/* 当前句的擦除结构：外层贴紧文字宽度，亮色层用 clip-path 从左揭开 */
.ln-now {
  position: relative;
  display: inline-block;
  width: max-content;
  max-width: 100%;
  vertical-align: bottom;
}

.ln-base {
  display: block;
  /* 未唱部分也给到 0.72：整句要看得清（"当前句正常显示"），
     唱过的部分再提亮到纯白 */
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ln-fill {
  position: absolute;
  inset: 0;
  display: block;
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
  /* 两层文字必须用同样的截断方式，否则长句被省略号截断时高亮层会露出半个字 */
  overflow: hidden;
  text-overflow: ellipsis;
  clip-path: inset(0 100% 0 0);
  animation: lyric-wipe var(--lyric-duration) linear var(--lyric-delay) both;
  animation-play-state: paused;
}

.ln-fill.is-playing {
  animation-play-state: running;
}

/* 「动画」关闭：不走动画，直接用静态进度百分比 */
.ln-fill.is-still {
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

.lyric-empty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  padding-top: 6px;
}

/* ---------- 进度 ---------- */
.progress {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 14px;
}

.t {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.45);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.bar {
  flex: 1;
  min-width: 0;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  overflow: visible;
}

.bar-fill {
  position: relative;
  height: 100%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  transition: width 0.25s linear;
}

/* 进度头：一个小白点，和参考图一致（只做指示，不能拖 —— 真正的播放器
   进度不可写，估时模式下拖动只会骗人） */
.bar-head {
  position: absolute;
  right: -3px;
  top: 50%;
  width: 6px;
  height: 6px;
  margin-top: -3px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.55);
}

/* "估算"角标：总长借自歌词记录、位置是本地秒表时，进度条只能算近似 */
.est {
  flex-shrink: 0;
  font-style: normal;
  font-size: 9.5px;
  padding: 0 3px;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.09);
}

/* 从小往上排的"波形"：仅示意在播放，不占太多宽度 */
.lp-wave {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 1.5px;
  height: 12px;
  opacity: 0.4;
  transition: opacity 0.3s ease;
}

.lp-wave i {
  display: block;
  width: 1.6px;
  height: 10px;
  border-radius: 999px;
  background: #fff;
  transform-origin: center;
  transform: scaleY(0.3);
}

.lp-wave.on {
  opacity: 0.85;
}

.lp-wave.on i {
  animation: music-wave 0.9s ease-in-out infinite;
}

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
  animation-duration: 0.7s;
  animation-delay: -0.42s;
}

@keyframes music-wave {
  0%,
  100% {
    transform: scaleY(0.3);
  }

  25% {
    transform: scaleY(0.75);
  }

  50% {
    transform: scaleY(1);
  }

  75% {
    transform: scaleY(0.5);
  }
}

/* ---------- 提示 ---------- */
.hint {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  margin-top: 3px;
  height: 12px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 控制 ---------- */
.foot {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 26px;
  height: 36px;
  margin-top: 4px;
}

.ctl {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.ctl:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.ctl:active:not(:disabled) {
  transform: scale(0.94);
}

.ctl:disabled {
  opacity: 0.26;
  cursor: default;
}

/* 主按钮：环形描边 + 玻璃质感 —— 参考图里那颗"按下去会发光"的播放键 */
.ctl.main {
  width: 38px;
  height: 38px;
  color: #fff;
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  background: radial-gradient(circle at 50% 34%, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.06) 72%);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.05), 0 8px 20px rgba(0, 0, 0, 0.38);
}

.ctl.main:hover {
  background: radial-gradient(circle at 50% 34%, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.1) 72%);
  box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.08), 0 8px 22px rgba(0, 0, 0, 0.42);
}

.ctl-ico {
  width: 20px;
  height: 20px;
}

.ctl.main .ctl-ico {
  width: 18px;
  height: 18px;
}

.ctl-ico.flip {
  transform: rotate(180deg);
}

.source {
  position: absolute;
  right: 14px;
  bottom: 5px;
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.16);
  pointer-events: none;
}
</style>
