// 音乐模块的渲染侧状态
//
// 核心原则：
// 1. 主进程只提供锚点 positionMs + positionAt + playing
// 2. Vue 只负责歌词索引、歌曲切换、跳转同步
// 3. 歌词擦除交给 CSS Animation，避免每 80ms 重绘 background-image
// 4. 正常播放时 CSS 自己连续运行，视觉上接近 60FPS
// 5. 只有歌词切换 / 外部跳转 / 换歌时才重新建立动画时间轴
// 6. 新歌曲开始时，先显示歌曲信息，再进入歌词

import { computed, ref, watch } from 'vue'
import { island } from '../../composables/useIsland'
import { settings } from '../../composables/useSettings'

const snap = ref(null)

// --------------------------------------------------
// 时钟
// --------------------------------------------------

const clock = ref(Date.now())

// CSS 歌词动画需要重新对轴时递增
const syncEpoch = ref(0)

// 当前 CSS 动画应该从哪个进度开始
const motionProgress = ref(0)

let timer = null
let bound = false

const LYRIC_TICK = 80
const SEEK_THRESHOLD = 450


// --------------------------------------------------
// 歌曲开场信息
// --------------------------------------------------

// 新歌曲开始后，先显示歌曲信息多久
const INTRO_DURATION = 1800

// 是否正在显示歌曲信息
const showTrackIntro = ref(false)

let introTimer = null


function startTrackIntro() {
  showTrackIntro.value = true

  if (introTimer) {
    clearTimeout(introTimer)
  }

  introTimer = setTimeout(() => {
    showTrackIntro.value = false
    introTimer = null
  }, INTRO_DURATION)
}


function stopTrackIntro() {
  if (introTimer) {
    clearTimeout(introTimer)
    introTimer = null
  }

  showTrackIntro.value = false
}


// --------------------------------------------------
// 时钟
// --------------------------------------------------

function tick() {
  clock.value = Date.now()
}

function startClock() {
  if (timer) return

  timer = setInterval(
    tick,
    LYRIC_TICK
  )
}

function stopClock() {
  if (!timer) return

  clearInterval(timer)
  timer = null
}


// --------------------------------------------------
// 工具
// --------------------------------------------------

function getTrackKey(s) {
  if (!s) return ''

  return (
    s.mediaId ||
    s.mediaSessionId ||
    s.id ||
    `${s.title || ''}|${s.artist || ''}|${s.durationMs || 0}`
  )
}


function getPosition(
  s,
  now = Date.now()
) {
  if (!s) return 0

  let p =
    Number(s.positionMs) || 0

  if (
    s.playing &&
    Number(s.positionAt) > 0
  ) {
    p +=
      now -
      Number(s.positionAt)
  }

  return Math.max(0, p)
}


// --------------------------------------------------
// 主进程 → 渲染
// --------------------------------------------------

function onChanged(s) {
  const next = s || null
  const prev = snap.value

  if (prev && next) {
    const prevTrack =
      getTrackKey(prev)

    const nextTrack =
      getTrackKey(next)

    // ------------------------------------------------
    // 换歌
    // ------------------------------------------------

    if (
      prevTrack !== nextTrack
    ) {
      // 重新建立 CSS 歌词动画
      syncEpoch.value++

      // 新歌曲先显示歌曲信息
      startTrackIntro()
    }

    // ------------------------------------------------
    // 同一首歌：检测是否发生外部跳转
    // ------------------------------------------------

    else {
      const now =
        Date.now()

      const oldPosition =
        getPosition(
          prev,
          now
        )

      const newPosition =
        Number(
          next.positionMs
        ) || 0

      /*
       * 正常 IPC 更新：
       *
       * 新位置 ≈ 老位置 + 已经过的时间
       *
       * 如果差距很大：
       *
       * - 拖动进度
       * - 上一首 / 下一首
       * - 播放器主动跳转
       *
       * 需要重新对齐 CSS Animation。
       */

      if (
        Math.abs(
          newPosition -
          oldPosition
        ) > SEEK_THRESHOLD
      ) {
        syncEpoch.value++
      }
    }
  }

  snap.value = next

  tick()
}


// --------------------------------------------------
// 初始化
// --------------------------------------------------

export function initMusicState() {
  if (
    bound ||
    typeof window === 'undefined' ||
    !window.api ||
    !window.api.musicGet
  ) {
    return
  }

  bound = true

  window.api.onMusicChanged(
    onChanged
  )

  Promise.resolve(
    window.api.musicGet()
  )
    .then((s) => {
      snap.value =
        s || null

      // 软件启动时已经有歌曲
      if (s) {
        startTrackIntro()
      }

      tick()
    })
    .catch(() => { })
}


// --------------------------------------------------
// 基础状态
// --------------------------------------------------

export const track = computed(() => {
  const s = snap.value

  return (
    s &&
      s.title
      ? s
      : null
  )
})


export const hasTrack =
  computed(() =>
    !!track.value
  )


export const playing =
  computed(() =>
    !!(
      snap.value &&
      snap.value.playing
    )
  )


export const cover =
  computed(() =>
    (
      snap.value &&
      snap.value.cover
    ) || ''
  )


export const lyrics =
  computed(() =>
    (
      snap.value &&
      snap.value.lyrics
    ) || []
  )


export const hasLyrics =
  computed(() =>
    lyrics.value.length > 0
  )


export const lyricSource =
  computed(() =>
    (
      snap.value &&
      snap.value.lyricSource
    ) || ''
  )


export const loading =
  computed(() =>
    !!(
      snap.value &&
      snap.value.loading
    )
  )


export const estimated =
  computed(() =>
    !!(
      snap.value &&
      snap.value.estimated
    )
  )


export const fallback =
  computed(() =>
    !!(
      snap.value &&
      snap.value.fallback
    )
  )


export const canPlay =
  computed(() =>
    !!(
      snap.value &&
      snap.value.canPlay
    )
  )


export const canPause =
  computed(() =>
    !!(
      snap.value &&
      snap.value.canPause
    )
  )


export const canNext =
  computed(() =>
    !!(
      snap.value &&
      snap.value.canNext
    )
  )


export const canPrev =
  computed(() =>
    !!(
      snap.value &&
      snap.value.canPrev
    )
  )


export const canControl =
  computed(
    () =>
      canPlay.value ||
      canPause.value ||
      canNext.value ||
      canPrev.value
  )


// --------------------------------------------------
// 播放位置
// --------------------------------------------------

export function positionNow() {
  const s = snap.value

  if (!s) return 0

  let p =
    Number(
      s.positionMs
    ) || 0

  if (
    s.playing &&
    Number(s.positionAt) > 0
  ) {
    p +=
      clock.value -
      Number(s.positionAt)
  }

  return Math.max(0, p)
}


export const position =
  computed(() =>
    positionNow()
  )


export const duration =
  computed(() =>
    Number(
      (
        snap.value &&
        snap.value.durationMs
      ) || 0
    )
  )


// --------------------------------------------------
// 歌词索引
// --------------------------------------------------

export const lineIndex =
  computed(() => {
    const list =
      lyrics.value

    if (!list.length) {
      return -1
    }

    const p =
      positionNow()

    let i = -1

    for (
      let k = 0;
      k < list.length;
      k++
    ) {
      if (
        Number(list[k].t) <= p
      ) {
        i = k
      } else {
        break
      }
    }

    return i
  })


// --------------------------------------------------
// 当前歌词 / 下一句
// --------------------------------------------------

export const currentLine =
  computed(() => {
    const list =
      lyrics.value

    const i =
      lineIndex.value

    /*
     * 前奏阶段：
     *
     * 不再提前显示第一句歌词。
     * 由 displayText 显示歌曲信息。
     */

    if (
      i >= 0 &&
      i < list.length
    ) {
      return list[i].text
    }

    return ''
  })


export const nextLine =
  computed(() => {
    const list =
      lyrics.value

    const i =
      lineIndex.value

    if (i < 0) {
      /*
       * 前奏/引子阶段第一行显示的是"歌名 · 歌手"（displayText），
       * 所以下面这一行应该是**第一句歌词**，而不是第二句 ——
       * 否则第二行会跳过第一句，读起来像少了一句。
       */
      return list.length
        ? list[0].text
        : ''
    }

    const n =
      i + 1

    return (
      n >= 0 &&
      n < list.length
    )
      ? list[n].text
      : ''
  })


// --------------------------------------------------
// 歌曲信息
// --------------------------------------------------

export const fallbackText =
  computed(() => {
    const s =
      snap.value

    if (!s) return ''

    return s.artist
      ? `${s.title} · ${s.artist}`
      : s.title
  })


// --------------------------------------------------
// 最终显示文本
// --------------------------------------------------

/*
 * 紧凑态真正应该显示的内容：
 *
 * 1. 新歌曲：
 *      歌曲名 · 歌手
 *
 * 2. 前奏：
 *      歌曲名 · 歌手
 *
 * 3. 正式进入歌词：
 *      当前歌词
 *
 * 4. 没有歌词：
 *      歌曲名 · 歌手
 */

export const displayText =
  computed(() => {
    if (
      showTrackIntro.value
    ) {
      return fallbackText.value
    }

    if (
      currentLine.value
    ) {
      return currentLine.value
    }

    return fallbackText.value
  })


// --------------------------------------------------
// 当前歌词持续时间
// --------------------------------------------------

export const lineDuration =
  computed(() => {
    const list =
      lyrics.value

    const i =
      lineIndex.value

    /*
     * 前奏阶段：
     *
     * 使用第一句和第二句
     * 的时间跨度作为动画时长。
     */

    if (
      !list.length ||
      i < 0 ||
      i >= list.length
    ) {
      if (
        list.length >= 2
      ) {
        const a =
          Number(
            list[0].t
          ) || 0

        const b =
          Number(
            list[1].t
          ) || 0

        if (b > a) {
          return b - a
        }
      }

      return 4000
    }

    const start =
      Number(
        list[i].t
      ) || 0

    let end =
      i + 1 < list.length
        ? Number(
          list[i + 1].t
        ) || 0
        : 0

    if (
      !end ||
      end <= start
    ) {
      end =
        duration.value > start
          ? duration.value
          : start + 4000
    }

    return Math.max(
      300,
      end - start
    )
  })


// --------------------------------------------------
// 当前歌词进度
// --------------------------------------------------

export const lineProgress =
  computed(() => {
    const list =
      lyrics.value

    const i =
      lineIndex.value

    if (
      i < 0 ||
      i >= list.length
    ) {
      return 0
    }

    const start =
      Number(
        list[i].t
      ) || 0

    let end =
      i + 1 < list.length
        ? Number(
          list[i + 1].t
        ) || 0
        : 0

    if (
      !end ||
      end <= start
    ) {
      end =
        duration.value > start
          ? duration.value
          : start + 4000
    }

    const span =
      end - start

    if (span <= 0) {
      return 1
    }

    return Math.min(
      1,
      Math.max(
        0,
        (
          positionNow() -
          start
        ) / span
      )
    )
  })


// --------------------------------------------------
// CSS 歌词动画对轴
// --------------------------------------------------

const trackKey =
  computed(() =>
    getTrackKey(
      track.value
    )
  )


/*
 * 只在：
 *
 * 1. 歌词切换
 * 2. 换歌
 * 3. 外部跳转
 *
 * 时记录一次当前进度。
 *
 * 正常播放过程中不会
 * 每 80ms 修改。
 */

watch(
  [
    lineIndex,
    syncEpoch,
    trackKey
  ],
  () => {
    motionProgress.value =
      lineProgress.value
  },
  {
    immediate: true
  }
)


// --------------------------------------------------
// CSS 动画持续时间
// --------------------------------------------------

export const lineDurationMs =
  computed(() =>
    lineDuration.value
  )


// --------------------------------------------------
// CSS 动画初始位置
// --------------------------------------------------

export const lineMotionStyle =
  computed(() => {
    const list =
      lyrics.value

    const i =
      lineIndex.value

    // 没有歌词
    if (!list.length) {
      return {
        '--lyric-duration':
          '4000ms',

        '--lyric-delay':
          '0ms',

        '--lyric-progress':
          '0%'
      }
    }

    /*
     * 歌曲信息阶段：
     *
     * 暂时不要启动歌词擦除。
     */

    if (
      showTrackIntro.value
    ) {
      return {
        '--lyric-duration':
          '4000ms',

        '--lyric-delay':
          '0ms',

        '--lyric-progress':
          '0%'
      }
    }

    const p =
      motionProgress.value

    /*
     * 还没进入第一句：
     *
     * CSS Animation 延迟到
     * 第一条歌词真正开始。
     */

    if (i < 0) {
      const start =
        Number(
          list[0]?.t
        ) || 0

      const now =
        positionNow()

      const wait =
        Math.max(
          0,
          start - now
        )

      return {
        '--lyric-duration':
          `${lineDuration.value}ms`,

        '--lyric-delay':
          `${wait}ms`,

        '--lyric-progress':
          '0%'
      }
    }

    /*
     * 已经进入当前句：
     *
     * 使用负 delay，
     * 让 CSS Animation
     * 从当前实际位置开始。
     */

    return {
      '--lyric-duration':
        `${lineDuration.value}ms`,

      '--lyric-delay':
        `${-p * lineDuration.value}ms`,

      '--lyric-progress':
        `${p * 100}%`
    }
  })


// --------------------------------------------------
// CSS Animation Key
// --------------------------------------------------

export const lineMotionKey =
  computed(() =>
    `${trackKey.value}:${lineIndex.value}:${syncEpoch.value}`
  )


// --------------------------------------------------
// 关闭动画模式
// --------------------------------------------------

export const lineStaticStyle =
  computed(() => ({
    '--lyric-progress':
      `${lineProgress.value * 100}%`
  }))


// --------------------------------------------------
// 操作
// --------------------------------------------------

export function mediaCommand(
  cmd
) {
  if (
    window.api &&
    window.api.musicCommand
  ) {
    window.api.musicCommand(
      cmd
    )
  }
}


export function togglePlay() {
  mediaCommand(
    'playpause'
  )
}


export function next() {
  mediaCommand(
    'next'
  )
}


export function prev() {
  mediaCommand(
    'prev'
  )
}


// --------------------------------------------------
// 手动对轴
// --------------------------------------------------

export function realignTo(ms) {
  if (
    window.api &&
    window.api.musicRealign
  ) {
    window.api.musicRealign(
      Math.max(
        0,
        Number(ms) || 0
      )
    )
  }

  // 强制重新建立 CSS 歌词动画
  syncEpoch.value++

  tick()
}


// --------------------------------------------------
// 同步给岛壳
// --------------------------------------------------

watch(
  [
    track,
    () =>
      settings.musicLyricPill
  ],
  () => {
    const on =
      !!track.value &&
      settings.musicLyricPill !== false

    island.media =
      on
        ? {
          lyricPill: true
        }
        : null
  },
  {
    immediate: true
  }
)


// --------------------------------------------------
// 歌词索引时钟
// --------------------------------------------------

watch(
  track,
  (t) => {
    if (t) {
      startClock()
    } else {
      stopClock()

      clock.value =
        Date.now()

      stopTrackIntro()
    }
  }
)


// --------------------------------------------------
// 播放状态变化
// --------------------------------------------------

watch(
  playing,
  (isPlaying) => {
    /*
     * 如果歌曲已经暂停，
     * 不需要继续显示开场信息。
     *
     * 这里不强制结束 intro，
     * 保证暂停时歌曲信息仍然可以保持。
     */
  }
)


// --------------------------------------------------
// Composable
// --------------------------------------------------

export function useMusic() {
  return {
    // 歌曲
    track,
    hasTrack,

    // 播放状态
    playing,

    // 封面
    cover,

    // 歌词
    lyrics,
    hasLyrics,
    lyricSource,

    // 状态
    loading,
    estimated,
    fallback,

    // 播放能力
    canPlay,
    canPause,
    canNext,
    canPrev,
    canControl,

    // 播放位置
    position,
    duration,

    // 歌词索引
    lineIndex,
    currentLine,
    nextLine,

    // 歌词显示
    displayText,
    showTrackIntro,
    fallbackText,

    // 歌词进度
    lineProgress,
    lineDuration,
    lineDurationMs,

    // CSS 歌词动画
    lineMotionStyle,
    lineMotionKey,
    lineStaticStyle,

    // 播放控制
    mediaCommand,
    togglePlay,
    next,
    prev,
    realignTo,

    // 初始化
    initMusicState
  }
}
