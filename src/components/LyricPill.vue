<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'
import { useMusic } from '../apps/music/useMusic'
import { motionScale } from '../composables/useSettings'
import Icon from '../components/Icon.vue'

const {
  playing,
  displayText,
  currentLine,
  nextLine,
  fallbackText,
  showTrackIntro,
  hasLyrics,
  cover,

  lineMotionStyle,
  lineMotionKey,
  lineStaticStyle,

  lineIndex
} = useMusic()

/* =========================================================
 * 基础状态
 * ========================================================= */

const still = computed(() =>
  motionScale() <= 0
)

const nowText = computed(() =>
  displayText.value || fallbackText.value || '—'
)

const nextText = computed(() =>
  hasLyrics.value
    ? nextLine.value
    : ''
)

const lyricKey = computed(() =>
  `${showTrackIntro.value ? 'intro' : 'lyric'}:${lineIndex.value}:${nowText.value}`
)


/* =========================================================
 * 超长歌词
 * ========================================================= */

const textViewport = ref(null)
const textLine = ref(null)
const lyricScroll = ref(null)

const isLongLyric = ref(false)
const lyricOffset = ref(0)

const LONG_LYRIC_THRESHOLD = 4
const SCROLL_START_DELAY = 500

let scrollTimer = null
let measureFrame = null
let resizeObserver = null


/* =========================================================
 * 清理横移
 * ========================================================= */

function clearScrollTimer() {
  if (scrollTimer) {
    clearTimeout(scrollTimer)
    scrollTimer = null
  }
}

function clearScrollTransform() {
  if (!lyricScroll.value) return

  lyricScroll.value.style.setProperty(
    '--lyric-scroll-x',
    '0px'
  )
}


/* =========================================================
 * 重置歌词位置
 * ========================================================= */

function resetLyricScroll() {
  clearScrollTimer()

  isLongLyric.value = false
  lyricOffset.value = 0

  clearScrollTransform()
}


/* =========================================================
 * 计算歌词长度
 * ========================================================= */

function measureLyric() {
  clearScrollTimer()

  /*
   * Intro 状态显示歌曲信息，
   * 不参与歌词横移。
   */
  if (
    showTrackIntro.value ||
    !hasLyrics.value ||
    !currentLine.value ||
    !textViewport.value ||
    !textLine.value ||
    !lyricScroll.value
  ) {
    resetLyricScroll()
    return
  }

  const viewportWidth =
    textViewport.value.clientWidth

  const textWidth =
    textLine.value.scrollWidth

  if (!viewportWidth || !textWidth) {
    resetLyricScroll()
    return
  }

  const overflow =
    textWidth - viewportWidth

  /*
   * 没有超过容器宽度。
   */
  if (overflow <= LONG_LYRIC_THRESHOLD) {
    resetLyricScroll()
    return
  }

  isLongLyric.value = true
  lyricOffset.value = 0

  /*
   * 先确保歌词在初始居中位置。
   */
  clearScrollTransform()

  /*
   * 没有播放时不自动移动。
   */
  if (!playing.value || still.value) {
    return
  }

  /*
   * 歌词出现后稍微停留一下，
   * 再开始向左移动。
   */
  scrollTimer = setTimeout(() => {
    if (
      !playing.value ||
      still.value ||
      !isLongLyric.value ||
      !lyricScroll.value
    ) {
      return
    }

    lyricOffset.value = -overflow

    lyricScroll.value.style.setProperty(
      '--lyric-scroll-x',
      `${lyricOffset.value}px`
    )
  }, SCROLL_START_DELAY)
}


/* =========================================================
 * 重新计算
 * ========================================================= */

async function updateLyricScroll() {
  await nextTick()

  if (measureFrame) {
    cancelAnimationFrame(measureFrame)
  }

  measureFrame = requestAnimationFrame(() => {
    measureFrame = null
    measureLyric()
  })
}


/* =========================================================
 * 歌词变化
 * ========================================================= */

watch(
  () => [
    currentLine.value,
    lineIndex.value,
    nowText.value,
    showTrackIntro.value,
    playing.value,
    still.value
  ],
  () => {
    resetLyricScroll()

    if (!showTrackIntro.value) {
      updateLyricScroll()
    }
  },
  {
    flush: 'post'
  }
)


/* =========================================================
 * 生命周期
 * ========================================================= */

onMounted(() => {
  updateLyricScroll()

  if (textViewport.value) {
    resizeObserver = new ResizeObserver(() => {
      updateLyricScroll()
    })

    resizeObserver.observe(textViewport.value)
  }
})

onBeforeUnmount(() => {
  clearScrollTimer()

  if (measureFrame) {
    cancelAnimationFrame(measureFrame)
    measureFrame = null
  }

  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>


<template>
  <div class="lyric-pill">

    <!-- =================================================
         封面
         ================================================= -->

    <div class="lp-cover" :class="{
      'is-playing': playing
    }">
      <img v-if="cover" :src="cover" alt="" />

      <Icon v-else name="volume" class="cover-ico" />
    </div>


    <!-- =================================================
         歌词显示区域
         ================================================= -->

    <div ref="textViewport" class="lp-text" :class="{
      'is-long': isLongLyric
    }">

      <div class="lp-now">

        <Transition name="lyric">

          <!--
            lyric-scroll：
            负责整体横向移动

            lyric-line：
            负责保存灰色歌词和高亮歌词的共同坐标系
          -->

          <span :key="lyricKey" ref="lyricScroll" class="lyric-scroll" :class="{
            'is-long': isLongLyric
          }">

            <span ref="textLine" class="lyric-line" :class="{
              'is-intro': showTrackIntro,
              'is-lyric': !showTrackIntro
            }">

              <!--
                底层歌词
              -->

              <span class="lyric-base">
                {{ nowText }}
              </span>


              <!--
                播放高亮层

                和底层歌词完全使用同一文本、
                同一位置、同一字体。
              -->

              <span v-if="hasLyrics && !showTrackIntro" :key="lineMotionKey" class="lyric-fill" :class="{
                'is-still': still,
                'is-playing': playing
              }" :style="{
                  ...lineMotionStyle,
                  ...(still ? lineStaticStyle : {})
                }" aria-hidden="true">
                {{ nowText }}
              </span>

            </span>

          </span>

        </Transition>

      </div>
    </div>


    <!-- =================================================
         EQ
         ================================================= -->

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
</template>


<style scoped>
/* =========================================================
   主体
   ========================================================= */

.lyric-pill {
  width: 100%;
  height: 100%;

  display: flex;
  align-items: center;

  gap: 8px;

  padding:
    0 12px 0 8px;

  overflow: hidden;

  box-sizing: border-box;
}


/* =========================================================
   封面
   ========================================================= */

.lp-cover {
  position: relative;

  width: 28px;
  height: 28px;

  flex: 0 0 28px;

  border-radius: 50%;

  overflow: hidden;

  border:
    2px solid rgba(255, 255, 255, 0.92);

  background:
    rgba(255, 255, 255, 0.08);

  box-sizing: border-box;

  animation:
    cover-rotate 12s linear infinite;

  animation-play-state: paused;
}

.lp-cover.is-playing {
  animation-play-state: running;
}

.lp-cover img {
  width: 100%;
  height: 100%;

  display: block;

  object-fit: cover;
}

.cover-ico {
  position: absolute;

  width: 14px;
  height: 14px;

  inset: 0;

  margin: auto;

  opacity: 0.65;
}

@keyframes cover-rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}


/* =========================================================
   歌词视口
   ========================================================= */

.lp-text {
  position: relative;

  flex: 1;

  min-width: 0;

  height: 100%;

  display: flex;
  align-items: center;
  justify-content: center;

  overflow: hidden;
}


/* =========================================================
   当前歌词容器
   ========================================================= */

.lp-now {
  width: 100%;

  min-width: 0;

  display: flex;
  align-items: center;
  justify-content: left;

  overflow: hidden;
}


/* =========================================================
   歌词横移层
   ========================================================= */

.lyric-scroll {
  position: relative;

  display: inline-block;

  flex: 0 0 auto;

  width: max-content;
  max-width: max-content;

  white-space: nowrap;

  transform:
    translate3d(var(--lyric-scroll-x, 0px),
      0,
      0);

  transition:
    transform 700ms cubic-bezier(.22, 1, .36, 1);

  will-change: transform;
}


/* =========================================================
   歌词本体
   ========================================================= */

.lyric-line {
  position: relative;

  display: inline-block;

  width: max-content;

  max-width: none;

  white-space: nowrap;

  overflow: visible;
}


/* =========================================================
   底层歌词
   ========================================================= */

.lyric-base {
  display: block;

  color:
    rgba(255, 255, 255, 0.58);

  font-size: 13px;

  font-weight: 600;

  line-height: 1.2;

  white-space: nowrap;

  user-select: none;
}


/* =========================================================
   Intro 歌曲信息
   ========================================================= */

.lyric-line.is-intro .lyric-base {
  color:
    rgba(255, 255, 255, 0.88);
}


/* =========================================================
   高亮歌词
   ========================================================= */

.lyric-fill {
  position: absolute;

  inset: 0;

  display: block;

  color:
    rgba(255, 255, 255, 0.98);

  font-size: 13px;

  font-weight: 600;

  line-height: 1.2;

  white-space: nowrap;

  pointer-events: none;

  overflow: hidden;

  clip-path:
    inset(0 100% 0 0);

  animation:
    lyric-wipe var(--lyric-duration) linear var(--lyric-delay) both;

  animation-play-state: paused;
}

.lyric-fill.is-playing {
  animation-play-state: running;
}


/* =========================================================
   静态模式
   ========================================================= */

.lyric-fill.is-still {
  animation: none;

  clip-path:
    inset(0 calc(100% - var(--lyric-progress, 0%)) 0 0);
}


/* =========================================================
   歌词高亮动画
   ========================================================= */

@keyframes lyric-wipe {
  from {
    clip-path:
      inset(0 100% 0 0);
  }

  to {
    clip-path:
      inset(0 0 0 0);
  }
}


/* =========================================================
   歌词切换动画
   ========================================================= */

.lyric-enter-active {
  transition:
    opacity 150ms cubic-bezier(.22, 1, .36, 1),

    transform 150ms cubic-bezier(.22, 1, .36, 1);
}

.lyric-enter-from {
  opacity: 0;

  transform:
    translateY(4px) scale(0.99);
}

.lyric-enter-to {
  opacity: 1;

  transform:
    translateY(0) scale(1);
}


.lyric-leave-active {
  position: absolute;

  left: 0;

  transition:
    opacity 180ms cubic-bezier(.4, 0, .8, 1),

    transform 180ms cubic-bezier(.4, 0, .8, 1);

  mask-image:
    linear-gradient(to right,
      #000 0%,
      #000 62%,
      rgba(0, 0, 0, 0.5) 82%,
      transparent 100%);
}

.lyric-leave-to {
  opacity: 0;

  transform:
    translateY(-3px) scale(0.99);
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
  height: 8px;

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