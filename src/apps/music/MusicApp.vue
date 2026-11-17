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
      <!-- ---------- 背景：海报磨砂。整块面板的色调都来自封面 ---------- -->
      <div class="bd" aria-hidden="true">
        <Transition name="bd">
          <!-- 按曲目换，不按封面字符串换：封面值偶尔会在两套来源之间抖动，
               用 cover 当 key 会每抖一次就重新挂载、重新淡入（看起来像背景在闪）。 -->
          <img v-if="cover" :key="trackKey" class="bd-img" :src="cover" alt="" />
        </Transition>
        <div class="bd-dim" />
      </div>

      <div class="cols">
        <!-- ================= 左栏：海报 → 歌名 → 作者 → 进度 → 控制 ================= -->
        <aside class="rail">
          <div class="poster">
            <img v-if="cover" :src="cover" alt="" />
            <Icon v-else name="volume" class="poster-ico" />
          </div>

          <div class="title" :title="track.title">{{ track.title }}</div>
          <div class="artist" :title="track.artist">{{ track.artist || '未知歌手' }}</div>

          <div class="prog">
            <div class="times">
              <!-- 
              <em v-if="estimated" class="est">估算</em> -->
              <span>{{ fmt(position) }}</span>
              <span>{{ fmt(duration) }}</span>
            </div>
            <!-- 进度条：seekable 时才可拖（播放器不支持写进度且非估算模式时不可拖）。
                 3px 的条不好抓，.bar-hit 把命中区上下各放宽 9px，视觉上保持细条。 -->
            <div
              class="bar"
              :class="{ live: seekable, drag: dragging, seeking }"
              :title="seekable ? '拖动调整进度' : ''"
            >
              <div class="bar-fill" :style="{ width: percent + '%' }">
                <span class="bar-head" />
              </div>
              <span
                class="bar-hit"
                @pointerdown="onSeekDown"
                @pointermove="onSeekMove"
                @pointerup="onSeekUp"
                @pointercancel="onSeekCancel"
              />
            </div>
          </div>

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
        </aside>

        <!-- ================= 右栏：歌词 + wave ================= -->
        <section class="main">
          <!-- 歌词窗口
               当前句：正常亮度、加粗放大、白色微光，保留 ktv 擦除（已唱部分逐字点亮）；
               其它句：模糊 + 半透明，随当前句切换平滑地"对焦 / 失焦"；
               整块 translate3d 上移，让当前句停在窗口顶部；最底部渐隐。 -->
          <div class="lyric" :class="{ browsing }" @wheel="onLyricWheel">
            <div v-if="!hasLyrics" class="lyric-empty">
              {{ loading ? '正在找歌词…' : '没有找到歌词' }}
            </div>
            <div
              v-else
              ref="lnTrackEl"
              class="ln-track"
              :class="{ anim: animate && !browsing, 'no-anim': !animate }"
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
                  clickable: lineClickable,
                }"
                :style="k === activeIndex ? { fontSize: nowFontSize } : null"
                :title="lineClickable ? '点击跳转到这一句' : ''"
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

          <!-- wave + 播放状态 -->
          <!-- <div class="wavebar">
            <div class="wave" :class="{ on: playing && !still }" aria-hidden="true">
              <i v-for="(h, i) in WAVE" :key="i" :style="{ '--h': h, '--i': i }" />
            </div>
            <span class="badge" :class="{ on: playing }">
              <span class="badge-note" aria-hidden="true">♪</span>
              {{ playing ? '正在播放' : '已暂停' }}
            </span>
          </div> -->

          <!-- 拿不到进度时必须说清"为什么"，并提示"能点歌词对轴" ——
               估算时钟是从检测到这首歌开始走的，播到一半才打开时初始就是偏的。
               说了很多次了不需要提示
               -->
          <!-- <div class="hint" v-if="hint">{{ hint }}</div> -->
        </section>
      </div>

      <div class="source" v-if="lyricSource">{{ lyricSource }}</div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '../../components/Icon.vue'
import { motionScale } from '../../composables/useSettings'
import { useMusic } from './useMusic'
import { channel } from './useNeteaseChannel'

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
  canSeek,
  seeking,
  beginSeek,
  moveSeek,
  cancelSeek,
  commitSeek,
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
  if (fallback.value) return '未接入媒体会话 · 点歌词行对齐'
  return '进度为本地估算 · 点歌词行对齐'
})

// 右侧 wave 的柱高（固定的一组，看起来像频谱而不是随机噪声）
const WAVE = [0.32, 0.58, 0.42, 0.78, 0.5, 0.96, 0.66, 0.38, 0.62, 0.88, 0.46, 0.72, 0.34, 0.56, 0.82, 0.44, 0.68, 0.52, 0.9, 0.4]

/* ------------------------------------------------------------------
 * 歌词滚动
 *
 * 每一行高度固定（--ln-h），所以"当前句停在第几行"是纯算术，不需要
 * 逐行测量、也不会有测量时序问题。唯一要读一次的就是行高本身
 * （字号由 CSS 决定，写死在 JS 里容易和样式表脱节）。
 * ------------------------------------------------------------------ */
// 当前句是主角，不能被省略号截断：右栏只有 237px，长句就按字数缩一号。
// 行高固定在 CSS 里（--ln-h），所以改字号不影响滚动算术。
// 当前句放大一号；行现在允许换行，所以长句不必压得太小（换行也不会被截断）。
const nowFontSize = computed(() => {
  const item = lyrics.value[activeIndex.value]
  const n = item ? [...String(item.text || '')].length : 0
  if (n <= 10) return '21px'
  if (n <= 14) return '19.5px'
  if (n <= 18) return '17.5px'
  return '16px'
})

const ROW_FALLBACK = 25

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


// 当前句不放在顶部：上面留两行给"已经唱过去的两句"，也就是当前句落在第 3 行。
// 还没唱到第 3 句时（i < 2）没有那么多过去，就不留空白，贴着顶部走。
const LEAD_ROWS = 2

// 手动浏览（滚轮）时的位移；null = 跟随播放
const manualOffset = ref(null)
let browseTimer = null
const browsing = computed(() => manualOffset.value != null)

const BROWSE_IDLE = 3000

// 行会换行，所以行高不再固定：位移必须按真实布局量。
// 目标 = 让"当前句往上第 LEAD_ROWS 行"贴在窗口顶部（也就是当前句停在第 3 行）。
function autoOffset() {
  const tr = lnTrackEl.value
  const rows = tr ? tr.children : null
  if (!rows || !rows.length) return 0
  const i = activeIndex.value
  const anchor = rows[Math.max(0, Math.min(rows.length - 1, i - LEAD_ROWS))]
  return anchor ? anchor.offsetTop : 0
}

function syncOffset() {
  // 浏览中不要被自动跟随拽走；高亮仍由 activeIndex 管，所以当前句照样在走。
  if (manualOffset.value != null) return
  offset.value = autoOffset()
}

function maxOffset() {
  const tr = lnTrackEl.value
  const win = tr ? tr.parentElement : null
  if (!tr || !win) return 0
  return Math.max(0, tr.scrollHeight - win.clientHeight)
}

function onLyricWheel(ev) {
  const tr = lnTrackEl.value
  if (!tr) return
  // 把滚轮从 CardCarousel 那里抢过来：这个区域滚轮=浏览歌词。
  ev.preventDefault()
  ev.stopPropagation()
  const base = manualOffset.value != null ? manualOffset.value : offset.value
  const next = Math.max(0, Math.min(maxOffset(), base + (Number(ev.deltaY) || 0)))
  manualOffset.value = next
  offset.value = next
  if (browseTimer) clearTimeout(browseTimer)
  browseTimer = setTimeout(backToCurrent, BROWSE_IDLE)
}

// 回到当前句：先解除"浏览"（让过渡恢复），下一帧再改位移，才能平滑滑回去
function backToCurrent() {
  if (browseTimer) {
    clearTimeout(browseTimer)
    browseTimer = null
  }
  if (manualOffset.value == null) return
  manualOffset.value = null
  requestAnimationFrame(() => syncOffset())
}

let trackRo = null

onMounted(() => {
  syncOffset()
  // 行会换行，定位依赖真实布局：首帧量到的 offsetTop 往往还是 0，
  // 所以下一帧再量一次，量准了才开启动画。
  requestAnimationFrame(() => {
    syncOffset()
    requestAnimationFrame(() => (animate.value = true))
  })
  // 宽度变化 / 字号变化都会改变换行与行高 → 重新定位（浏览中不打扰）
  if (typeof ResizeObserver !== 'undefined' && lnTrackEl.value) {
    trackRo = new ResizeObserver(() => {
      if (manualOffset.value == null) syncOffset()
    })
    trackRo.observe(lnTrackEl.value)
  }
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
  // 换歌了，浏览上下文没了，直接回到新的当前句
  if (browseTimer) {
    clearTimeout(browseTimer)
    browseTimer = null
  }
  manualOffset.value = null
  animate.value = false
  syncOffset()
  requestAnimationFrame(() => (animate.value = true))
})

/* ------------------------------------------------------------------
 * 进度条拖动
 *
 * 拖动期间只改"本地预览"（useMusic 的 seekPreview）：进度条、时间、
 * 歌词索引和逐字擦除全部跟着预览走，所以歌词在拖的时候就已经同步了。
 * 松手才真正下发 seek，然后等播放器对位或超时。
 * ------------------------------------------------------------------ */
const dragging = ref(false)

// 歌词行是否可点：估算模式（本地对轴）或静默通道已连上（真跳转）
const lineClickable = computed(() => estimated.value || channel.state === 'connected')

// 没有真实进度可写、又不是估算模式时，拖了也没用 —— 直接不给拖。
// 静默通道连上时也算"可写"（哪怕播放器不声明 IsPlaybackPositionEnabled）。
const seekable = computed(
  () => (canSeek.value || estimated.value || channel.state === 'connected') && duration.value > 0
)

function ratioAt(barEl, ev) {
  const r = barEl.getBoundingClientRect()
  if (!r.width) return 0
  return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
}

function seekMsAt(barEl, ev) {
  return ratioAt(barEl, ev) * duration.value
}

function onSeekDown(ev) {
  if (!seekable.value) return
  ev.preventDefault()
  ev.stopPropagation()
  dragging.value = true
  const bar = ev.currentTarget.parentElement
  try {
    ev.currentTarget.setPointerCapture(ev.pointerId)
  } catch {
    /* 捕获失败也不影响：move/up 仍会在命中区里触发 */
  }
  beginSeek(seekMsAt(bar, ev))
}

function onSeekMove(ev) {
  if (!dragging.value) return
  moveSeek(seekMsAt(ev.currentTarget.parentElement, ev))
}

function onSeekUp(ev) {
  if (!dragging.value) return
  dragging.value = false
  try {
    ev.currentTarget.releasePointerCapture(ev.pointerId)
  } catch {
    /* ignore */
  }
  moveSeek(seekMsAt(ev.currentTarget.parentElement, ev))
  commitSeek()
}

function onSeekCancel() {
  if (!dragging.value) return
  dragging.value = false
  cancelSeek()
}

// 面板可能在拖动中被收起（岛塌缩会卸载面板）→ 别把预览值留在模块里
onUnmounted(() => {
  if (dragging.value) cancelSeek()
  if (browseTimer) {
    clearTimeout(browseTimer)
    browseTimer = null
  }
  if (trackRo) {
    trackRo.disconnect()
    trackRo = null
  }
})

function fmt(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// 点某一句 = 把本地计时对齐到它的起始时间。这是"估算同步"唯一的纠偏手段。
function alignTo(idx) {
  const list = lyrics.value
  if (idx < 0 || idx >= list.length) return
  const start = Number(list[idx].t) || 0
  const nextStart = idx + 1 < list.length ? Number(list[idx + 1].t) || 0 : 0

  // 通道连上时"点歌词"等于真的跳转：走和拖动同一套预览 + 对位逻辑。
  // 只调 realignTo 是不够的 —— 真实位置现在以通道为准，本地时钟改了也会被盖掉。
  if (channel.state === 'connected') {
    // 不能正好打在句首：播放器落地会略早一点，而通道读回来的进度还是按滑块百分比
    // 量化过的（±几十到上百毫秒），于是 position 有时会 < 该句起点，高亮就掉进上一句。
    // 往句内偏 250ms（并留出到下一句的余量），保证落在这一句里面。
    const room = nextStart > start ? nextStart - start : 0
    const bias = room > 0 ? Math.min(250, Math.max(0, room - 60)) : 250
    beginSeek(start + bias)
    commitSeek()
    return
  }
  if (!estimated.value) return
  realignTo(start)
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
  padding: 12px 14px;
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

/* ---------- 海报磨砂背景 ---------- */
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

/* ---------- 两栏 ---------- */
.cols {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 20px;
}

/* ================= 左栏 ================= */
.rail {
  width: 138px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.poster {
  width: 100px;
  height: 100px;
  flex-shrink: 0;
  border-radius: 11px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.09);
}

.poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.poster-ico {
  width: 28px;
  height: 28px;
  color: rgba(255, 255, 255, 0.35);
}

.title {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 进度：时间在上、细条在下 */
.prog {
  margin-top: 3px;
  padding-right: 10px;
}

.times {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.45);
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}

.est {
  font-style: normal;
  font-size: 8.5px;
  padding: 0 3px;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.1);
}

.bar {
  position: relative;
  margin-top: 3px;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
}

/* 命中区：细条两侧各放宽 9px（视觉不变，手感好很多） */
.bar-hit {
  position: absolute;
  left: 0;
  right: 0;
  top: -9px;
  bottom: -9px;
  touch-action: none;
}

.bar.live .bar-hit {
  cursor: pointer;
}

.bar.live.drag .bar-hit {
  cursor: grabbing;
}

.bar.live .bar-head {
  transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
}

.bar.live.drag .bar-head {
  transform: scale(1.9);
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.85);
}

/* 已松手、正在等播放器对位 */
.bar.seeking .bar-head {
  opacity: 0.5;
}

.bar-fill {
  position: relative;
  height: 100%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  transition: width 0.25s linear;
}

/* 进度头：小白点（只做指示，不能拖 —— 真实播放器进度不可写，估时模式拖动只会骗人） */
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

/* 控制：贴到左栏底部 */
.foot {
  margin-top: auto;
  padding-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.ctl {
  width: 28px;
  height: 28px;
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
  background: rgba(255, 255, 255, 0.09);
}

.ctl:active:not(:disabled) {
  transform: scale(0.93);
}

.ctl:disabled {
  opacity: 0.26;
  cursor: default;
}

/* 主按钮：环形描边 + 玻璃质感 */
.ctl.main {
  width: 38px;
  height: 38px;
  color: #fff;
}




.ctl-ico {
  width: 20px;
  height: 20px;
}

.ctl.main .ctl-ico {
  width: 24px;
  height: 24px;
}

.ctl-ico.flip {
  transform: rotate(180deg);
}

/* ================= 右栏 ================= */
.main {
  
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* 歌词窗口：行高固定，当前句停在第 0 行；其它行模糊半透明；底部渐隐。
   行高写进 --ln-h，JS 只读一次实际行高来算位移。 */
.lyric {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  cursor: default;
  -webkit-mask-image: linear-gradient(180deg, #000 0, #000 62%, rgba(0, 0, 0, 0.4) 86%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 0, #000 62%, rgba(0, 0, 0, 0.4) 86%, transparent 100%);
}

.ln-track {
  position: relative;
  will-change: transform;
  /* 滚轮浏览的默认手感：短促平滑。滚轮是连续小步，过渡太长会拖泥带水，
     但完全没有过渡又会一格一格地"跳"。 */
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 首帧 / 换歌 / 定位：直接到位，不要动画 */
.ln-track.no-anim {
  transition: none;
}

/* 跟随当前句、以及 3 秒后回到当前句：慢一点、更有"滑"的感觉 */
.ln-track.anim {
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 一行放不下就换行（不再用省略号截断）。行高定得大一点，让常规情况正好是
   「2 行过去 + 当前句 + 3 行未来」= 6 行，不会一口气铺满整个窗口。 */
.ln {
  min-height: 36px;
  padding: 3px 0;
  line-height: 1.45;
  white-space: normal;
  word-break: break-word;
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
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.72);
  opacity: 0.42;
  filter: blur(0.8px);
  transform: translateY(1px);
}

.ln.past {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  opacity: 0.28;
  filter: blur(1.6px);
}

/* 当前句：清晰、加粗、放大、白色微光 */
.ln.now {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  opacity: 1;
  filter: none;
  transform: none;
  letter-spacing: 0.2px;
  /* text-shadow: 0 0 20px rgba(255, 255, 255, 0.3), 0 2px 10px rgba(0, 0, 0, 0.45); */
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
  /* 未唱部分也给到 0.72：整句要看得清，唱过的部分再提亮到纯白 */
  color: rgba(255, 255, 255, 0.72);
  white-space: normal;
  word-break: break-word;
}

.ln-fill {
  position: absolute;
  inset: 0;
  display: block;
  color: #fff;
  pointer-events: none;
  /* 两层必须用完全一致的换行规则，否则高亮层会和底层的字错位 */
  white-space: normal;
  word-break: break-word;
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

/* ---------- wave + 状态 ---------- */
.wavebar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
}

.wave {
  flex: 1;
  min-width: 0;
  height: 24px;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0.42;
  transition: opacity 0.3s ease;
}

.wave i {
  flex: 1;
  min-width: 1px;
  height: 100%;
  border-radius: 1.5px;
  background: #fff;
  transform-origin: center;
  /* 静态时也要看得出"频谱"，太矮会像一串虚线 */
  transform: scaleY(calc(var(--h) * 0.82));
}

.wave.on {
  opacity: 0.72;
}

.wave.on i {
  animation: waveBar 1.05s ease-in-out infinite;
  animation-delay: calc(var(--i) * -0.083s);
}

@keyframes waveBar {
  0%,
  100% {
    transform: scaleY(calc(var(--h) * 0.42));
  }

  50% {
    transform: scaleY(var(--h));
  }
}

.badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px 0 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  font-size: 10px;
  font-weight: 500;
  backdrop-filter: blur(6px);
  transition: color 0.3s ease;
}

.badge.on {
  color: rgba(255, 255, 255, 0.82);
}

.badge-note {
  font-size: 10px;
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

/* ---------- 提示 ---------- */
.hint {
  flex-shrink: 0;
  height: 11px;
  /* 右下角有歌词来源，别让提示压上去 */
  padding-right: 52px;
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source {
  position: absolute;
  right: 20px;
  bottom: 4px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.04);
  pointer-events: none;
}
</style>
