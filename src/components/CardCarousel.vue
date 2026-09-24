<template>
  <div
    class="carousel"
    :style="{ '--card-w': cardW + 'px', '--gap': GAP + 'px' }"
  >
    <!-- ---------- 二级导航：身份行 ----------
         由 showBar 控制。默认关（当前时间板块就是关的）：
         打开后是 [拖动手柄] [状态圆点] [当前模式名] [更多]。
         岛头部 48px 处已有可拖窗口的手柄，这里的手柄只是视觉配重，不重复绑定拖动。 -->
    <div v-if="showBar" ref="barEl" class="mode-bar">
      <span class="bar-handle" aria-hidden="true">
        <Icon name="drag" class="bar-handle-ico" />
      </span>
      <span
        class="bar-dot"
        :class="{ pulse: dotPulse }"
        :style="{ background: activeMode.accent, opacity: dotOpacity }"
      />
      <span class="bar-name">{{ activeMode.name }}</span>
      <span class="bar-fill" />
      <button class="bar-more" title="更多" @click.stop="toggleMore">
        <Icon name="more" class="bar-more-ico" />
      </button>

      <Transition name="pop">
        <div v-if="moreOpen" class="more-pop" @click.stop>
          <button class="more-item" @click="onOpenSettings">打开设置</button>
          <button
            class="more-item"
            :disabled="visibleModes.length <= 1"
            :title="visibleModes.length <= 1 ? '至少保留一个模式' : ''"
            @click="onHideMode"
          >
            隐藏「{{ activeMode.name }}」
          </button>
        </div>
      </Transition>
    </div>

    <!-- ---------- 卡片轨道 ---------- -->
    <div ref="deckEl" class="deck" @pointerdown="onPointerDown">
      <div ref="trackEl" class="track">
        <div
          v-for="(m, i) in visibleModes"
          :key="m.id"
          class="card"
          :class="{ current: i === activeIndex, 'is-side': i !== focusIndex }"
          @click="onCardClick(i, $event)"
        >
          <!-- 各模式自己的内容组件。事件监听由宿主通过 panelProps 传进来，
               这样这个组件不需要知道任何模式的语义。 -->
          <component :is="props.panels[m.id]" class="card-body" v-bind="panelProps" />
        </div>
      </div>

      <!-- 滑动提示：只在用户还没学会滑动时出现。
           用户自己滑动满 3 次后自动关掉，可在设置里恢复或设成不再提示。 -->
      <Transition name="hint">
        <div v-if="hintShown" class="swipe-hint" :class="{ still: motionOff }" aria-hidden="true">
          <Icon name="chevron-left" class="swipe-hint-ico" />
          <span>拖动或滚轮切换</span>
          <Icon name="chevron-right" class="swipe-hint-ico" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import Icon from './Icon.vue'
import { motionScale, settings as appSettings, subEnabled, update, CARD_HINT_LIMIT } from '../composables/useSettings'

const props = defineProps({
  // 模式清单：[{ id, name, icon, accent }]，顺序即卡片顺序
  modes: { type: Array, required: true },
  // 当前模式 id —— 业务真源在宿主的 store 里，这里只做投影
  activeId: { type: String, required: true },
  // id → 内容组件
  panels: { type: Object, required: true },
  // 挂到内容组件上的监听，如 { onOpenWork: fn }（宿主决定，组件本身不关心语义）
  panelProps: { type: Object, default: () => ({}) },
  // (modeId) => 'run' | 'idle' | 'dim'，决定身份行状态圆点；只在 showBar 时用得上
  dotOf: { type: Function, default: () => 'idle' },
  // 是否显示身份行
  showBar: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

/* ------------------------------------------------------------------ *
 * 几何
 * 视口 = 宿主容器宽（撑满胶囊）。卡片必须窄于视口，两侧才露得出邻卡边缘。
 * 露出量按「视觉可见」计：胶囊有 1px 边框，最外侧 1px 会被裁掉。
 * ------------------------------------------------------------------ */
const GAP = 10 // 卡片间距
const PEEK = 10 // 单侧期望的可见露出宽度
const EDGE_CLIP = 1 // 胶囊 1px 边框造成的视觉裁切
const DRAG_LOCK = 8 // 轴向锁定阈值
const COMMIT_RATIO = 0.28 // 位移超过 step 的多少比例就翻页
const COMMIT_VELOCITY = 0.45 // px/ms
const RUBBER = 0.35 // 端点/边界阻尼
const RUBBER_CAP = 60 // 阻尼最大附加位移
const HIDDEN_AT = 1.35 // 连续距离超过它就不再参与渲染

// 滑动提示：用户自己滑动满 CARD_HINT_LIMIT 次就不再提示；
// 单次展开里最多停留 HINT_KEEP_MS，避免一直挡着卡片内容。
const HINT_KEEP_MS = 8000

// 卡片自身的缩放与透明：都刻意很轻，侧卡的质感交给毛玻璃那套样式
const NEIGHBOR_SCALE = 0.95 // 相邻卡缩放（同时让它的上下边缘内缩，读起来才像"一张卡"）
const NEIGHBOR_OPACITY = 0.9 // 相邻卡整体透明度（只是补一点纵深，压多了玻璃就不透亮）

const deckEl = ref(null)
const trackEl = ref(null)
const deckW = ref(384)

const cardW = computed(() => Math.max(240, deckW.value - 2 * (GAP + PEEK + EDGE_CLIP)))
const step = computed(() => cardW.value + GAP)
const originX = computed(() => (deckW.value - cardW.value) / 2)

function baseX(i) {
  return originX.value - step.value * i
}

/* ------------------------------------------------------------------ *
 * 模式清单：设置里被单独关掉的模式不出现在卡片里。
 * 兜底：全关掉时退回完整列表（否则一张卡都没有）。
 * 和 useIsland 的 apps 一样用 ref + watch 显式重建，不依赖 computed 的失效传播。
 * ------------------------------------------------------------------ */
function filterVisible() {
  const on = props.modes.filter((m) => subEnabled(m.id))
  return on.length ? on : props.modes
}
const visibleModes = ref(filterVisible())

watch(
  () => JSON.stringify(appSettings.enabledSubs || {}),
  () => {
    visibleModes.value = filterVisible()
  }
)

/* ------------------------------------------------------------------ *
 * 索引
 * ------------------------------------------------------------------ */
const activeIndex = computed(() => {
  const i = visibleModes.value.findIndex((m) => m.id === props.activeId)
  return i < 0 ? 0 : i
})
const activeMode = computed(() => visibleModes.value[activeIndex.value] || props.modes[0])

// 对焦中的那张卡的索引（浮点索引四舍五入）。它决定谁清晰、谁是毛玻璃侧卡。
// 由 paintCards 在每一帧从轨道位置反算出来，只在真的翻转时才变。
const focusIndex = ref(0)

/* ------------------------------------------------------------------ *
 * 渲染：位移走 GSAP / 直接写 transform，读值一律不碰 getBoundingClientRect
 * （.body 上有展开动画留下的 scale，getBoundingClientRect 会算错）
 * ------------------------------------------------------------------ */
const xProxy = { x: 0 }
let tween = null

function applyX() {
  const el = trackEl.value
  if (!el) return
  el.style.transform = `translate3d(${xProxy.x}px, 0, 0)`
  paintCards()
}

// 直接就位（无动画）：挂载、几何重算、卡片增删都走这里。
// 会主动掐掉正在跑的补间，保证「就地定位」是最后的赢家，不和补间抢 transform。
function snapTo(i) {
  if (tween) {
    tween.kill()
    tween = null
  }
  if (hintTl) {
    hintTl.kill()
    hintTl = null
  }
  endPointer()
  phase.value = 'idle'
  xProxy.x = baseX(i)
  applyX()
}

// 由轨道实时位置反算每张卡的层级：连续插值，所以在 50% 处不会跳变
function paintCards() {
  const track = trackEl.value
  const s = step.value
  if (!track || !s) return
  const p = (originX.value - xProxy.x) / s // 浮点索引
  const half = cardW.value / 2
  const kids = track.children
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i]
    const d = Math.abs(i - p)
    const t = Math.min(1, d)
    const k = 1 - (1 - NEIGHBOR_SCALE) * t
    // scale 以卡片自身中心为原点收缩，会把「朝向当前卡的那条内侧边」也带进去，
    // 邻居的露出量会被吃掉 10px 左右。按缩放量把卡片向外推回，让内侧边固定在原位，
    // 露出量才恒定。d=0 时 1-k=0，所以这个补偿是连续的，不会跳。
    const comp = -Math.sign(i - p) * half * (1 - k)
    el.style.transform = `translate3d(${comp.toFixed(2)}px, 0, 0) scale(${k.toFixed(4)})`
    // 整卡透明度只降一点点：侧卡是毛玻璃，压多了就不透亮了
    el.style.opacity = (1 - (1 - NEIGHBOR_OPACITY) * t).toFixed(4)
    // "谁是对焦的那张"用浮点索引 p 反算，而不是 activeIndex：
    // 拖到一半时"来的那张"就该先对上焦。
    // 注意：这里只更新一个 ref，真正切类交给模板的 :class —— 直接用
    // classList.toggle 会被 Vue 的重渲染重置 className 冲掉，且变更缓存发现不了。
    const fi = Math.round(p)
    if (focusIndex.value !== fi) focusIndex.value = fi
    // 非当前卡的面板不参与交互：整条露出区都归"点它翻页"，
    // 也避免用户点到邻卡里的开关/输入框（那会同时改数据又翻页）。
    const panel = el.firstElementChild
    const dead = t > 0.01
    if (el.__dead !== dead) {
      el.__dead = dead
      if (panel) panel.style.pointerEvents = dead ? 'none' : ''
    }
    // hidden：不参与视觉渲染（visibility 不走布局，翻回来不会有一次性重排）。
    // 只在状态翻转时写，避免每帧触发布局。
    const hide = d > HIDDEN_AT
    if (el.__hidden !== hide) {
      el.__hidden = hide
      el.style.visibility = hide ? 'hidden' : ''
      el.style.pointerEvents = hide ? 'none' : ''
    }
  }
}

function runTween(to, dur, ease, onDone) {
  // 任何正经的换页都要先把滑动提示收掉，否则两边会争同一个 transform
  if (hintTl) {
    hintTl.kill()
    hintTl = null
  }
  if (tween) {
    tween.kill()
    tween = null
  }
  const ms = motionScale()
  if (ms <= 0) {
    xProxy.x = to
    applyX()
    if (onDone) onDone()
    return
  }
  tween = gsap.to(xProxy, {
    x: to,
    duration: dur * ms,
    ease,
    overwrite: 'auto',
    onUpdate: applyX,
    onComplete: () => {
      tween = null
      if (onDone) onDone()
    },
  })
}

/* ------------------------------------------------------------------ *
 * 滑动提示：告诉用户"旁边还有卡，可以滑"
 *   · 轨道朝有邻卡的那一侧探出去再回来 —— 直接让对方看见下一张卡；
 *   · 轨道底部浮一个小胶囊写「拖动或滚轮切换」，交互一下就走；
 *   · 用户自己滑动满 CARD_HINT_LIMIT 次后自动关闭，
 *     也可以在设置里「恢复提示」或设成「不再提示」。
 * ------------------------------------------------------------------ */
const hintSwipes = computed(() => Number(appSettings.cardHintSwipes) || 0)
const hintOn = computed(
  () =>
    appSettings.cardHintOff !== true &&
    hintSwipes.value < CARD_HINT_LIMIT &&
    visibleModes.value.length > 1
)
// 本次挂载里提示文字是否正显示
const hintShown = ref(false)
const motionOff = computed(() => motionScale() <= 0)
let hintTl = null
let hintStartTimer = 0
let hintKeepTimer = 0

function hideHint() {
  hintShown.value = false
  clearTimeout(hintStartTimer)
  clearTimeout(hintKeepTimer)
  hintStartTimer = 0
  hintKeepTimer = 0
  if (hintTl) {
    hintTl.kill()
    hintTl = null
  }
}

// 用户真的换了一张卡才算一次；满了就不再提示
function countSwipe() {
  if (!hintOn.value) return
  update({ cardHintSwipes: hintSwipes.value + 1 })
  // 已经会滑了，不必再把提示留在屏幕上
  hideHint()
}

function playHint() {
  hintStartTimer = 0
  if (!hintOn.value || phase.value !== 'idle' || tween) return
  hintShown.value = true
  clearTimeout(hintKeepTimer)
  hintKeepTimer = setTimeout(() => {
    hintShown.value = false
  }, HINT_KEEP_MS)

  // 「动画」设为关闭时只留文字提示，不做位移
  if (motionOff.value) return

  const base = xProxy.x
  // 还有右边的卡就往右探，否则往左探
  const dir = activeIndex.value < visibleModes.value.length - 1 ? -1 : 1
  const d = Math.min(30, step.value * 0.09) * dir
  const k = motionScale()
  if (hintTl) hintTl.kill()
  hintTl = gsap.timeline({
    onComplete: () => {
      hintTl = null
    },
  })
  // 探出去 → 收回来 → 再轻轻探一下 → 收回原位
  hintTl
    .to(xProxy, { x: base + d, duration: 0.5 * k, ease: 'power2.out', onUpdate: applyX })
    .to(xProxy, { x: base, duration: 0.55 * k, ease: 'power2.inOut', onUpdate: applyX }, '+=0.5')
    .to(xProxy, { x: base + d * 0.7, duration: 0.42 * k, ease: 'power2.out', onUpdate: applyX }, '+=0.9')
    .to(xProxy, { x: base, duration: 0.5 * k, ease: 'power2.inOut', onUpdate: applyX }, '+=0.45')
}

/* ------------------------------------------------------------------ *
 * 拖拽状态机 idle → pending → dragging → settling
 * ------------------------------------------------------------------ */
const phase = ref('idle')
let pointerId = null
let startX = 0
let startY = 0
let lastX = 0
let startT = 0
let dragBase = 0 // 按下瞬间的视觉位置：落位动画被打断时，从原地继续拖，不会跳
let movedMost = 0
let samples = []
let suppressClick = false
let suppressTimer = 0

const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable="true"], [data-no-drag]'
function isInteractive(el) {
  return !!(el && el.closest && el.closest(INTERACTIVE))
}

// 超出 limit 的部分按 RUBBER 阻尼，最多再加 RUBBER_CAP
function damp(v, limit) {
  const over = Math.abs(v) - limit
  if (over <= 0) return v
  return Math.sign(v) * (limit + Math.min(RUBBER_CAP, over * RUBBER))
}

function onPointerDown(e) {
  // 用户一上手就把提示收掉，别和拖拽抢
  hideHint()
  if (e.button !== 0) return
  if (visibleModes.value.length <= 1) return
  if (phase.value === 'dragging') return
  // 输入框 / 按钮：把事件完全让给它们，避免抢走文本选择与点击
  if (isInteractive(e.target)) return

  // 正在落位时按下 → 直接打断，改由这一次拖拽接管。
  // dragBase 记下被打断时的视觉位置，所以后续位移从原地续上，不会跳一下。
  if (tween) {
    tween.kill()
    tween = null
  }
  phase.value = 'idle'
  dragBase = xProxy.x

  pointerId = e.pointerId
  startX = lastX = e.clientX
  startY = e.clientY
  startT = performance.now()
  movedMost = 0
  samples = [{ x: e.clientX, t: startT }]
  phase.value = 'pending'

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(e) {
  if (e.pointerId !== pointerId) return
  if (phase.value !== 'pending' && phase.value !== 'dragging') return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  lastX = e.clientX

  if (phase.value === 'pending') {
    if (Math.abs(dx) < DRAG_LOCK && Math.abs(dy) < DRAG_LOCK) return
    // 纵向为主 → 放手，交还给面板自己的滚动
    if (Math.abs(dx) <= Math.abs(dy)) {
      endPointer()
      phase.value = 'idle'
      return
    }
    phase.value = 'dragging'
    deckEl.value?.classList.add('is-dragging')
    // 清掉按下瞬间可能已经产生的文本选区
    try {
      window.getSelection()?.removeAllRanges()
    } catch {
      /* ignore */
    }
  }

  movedMost = Math.max(movedMost, Math.abs(dx))
  samples.push({ x: e.clientX, t: performance.now() })
  if (samples.length > 6) samples.shift()

  // 一次最多拖过一张：超出部分阻尼。端点（第一张往右 / 最后一张往左）同样阻尼
  const n = visibleModes.value.length
  const i = activeIndex.value
  const s = step.value || 1
  const limit = dx > 0 ? (i > 0 ? s : 0) : i < n - 1 ? s : 0
  xProxy.x = dragBase + damp(dx, limit)
  applyX()
}

// 取最近样本的速度（px/ms）
function velocity() {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[0]
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 100) break
    first = samples[i]
  }
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return (last.x - first.x) / dt
}

function endPointer() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  deckEl.value?.classList.remove('is-dragging')
  pointerId = null
}

function onPointerUp(e) {
  if (e && pointerId !== null && e.pointerId !== pointerId) return
  if (phase.value === 'pending') {
    // 没到锁定阈值：当作一次普通点击，交回给卡片/面板
    endPointer()
    phase.value = 'idle'
    return
  }
  if (phase.value !== 'dragging') {
    endPointer()
    return
  }

  const n = visibleModes.value.length
  const i = activeIndex.value
  const s = step.value || 1
  const dx = lastX - startX
  const v = velocity()
  endPointer()

  let target = i
  if (dx <= -s * COMMIT_RATIO || v <= -COMMIT_VELOCITY) {
    if (i < n - 1) target = i + 1
  } else if (dx >= s * COMMIT_RATIO || v >= COMMIT_VELOCITY) {
    if (i > 0) target = i - 1
  }

  if (movedMost > 6) {
    suppressClick = true
    clearTimeout(suppressTimer)
    suppressTimer = setTimeout(() => {
      suppressClick = false
    }, 200)
  }
  settle(target)
}

function settle(target) {
  const i = activeIndex.value
  const changed = target !== i
  phase.value = 'settling'
  // 立刻落业务态（宿主的 activeId 是唯一真源），动画只负责把它画到位
  if (changed) {
    emit('select', visibleModes.value[target].id)
    countSwipe()
  }

  const to = baseX(target)
  const dist = Math.abs(to - xProxy.x) / (step.value || 1)
  const dur = changed ? Math.min(0.52, 0.34 + dist * 0.14) : 0.3
  runTween(to, dur, changed ? 'power3.out' : 'power2.out', () => {
    phase.value = 'idle'
  })
}

/* ------------------------------------------------------------------ *
 * 滚轮
 * 横向滚动直接切卡。
 * 纵向滚动以「先滚内容、滚到边界才切卡」为准 —— 这个组件被便签 / 待办 /
 * 常用语 / 剪贴板四个带长列表的应用共用，如果 deltaY 一律拿去切卡，
 * 那些列表就完全没法用滚轮滚了。
 *
 * 边界处理：wheel 事件的默认滚动发生在 handler 返回之后，所以在 handler
 * 里读到的 scrollTop 是"这次滚动之前"的状态。如果只看"还能不能滚"，
 * 内容刚触底的那一刻，同一手势里的下一个事件就会立刻切卡 —— 触控板一次
 * 滑动连发十几个事件，用户根本没机会停在底部。
 * 因此额外记录"上一次把滚轮让给内容"的时刻：只要还在同一串连发里
 * （间隔 < GESTURE_IDLE），就继续吃掉；只有间隔够大、用户重新起手，
 * 才允许切卡。
 * ------------------------------------------------------------------ */
let wheelLock = 0
let contentScrollAt = 0
const GESTURE_IDLE = 1000 // ms：两次滚轮事件间隔超过它，就算一次新手势

// 从事件目标向上找一个「此刻还能滚」的容器（到 deck 为止）
function scrollableAt(target) {
  let el = target
  while (el && el !== deckEl.value) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return null
}

function onWheel(e) {
  if (visibleModes.value.length <= 1) return
  hideHint()

  const dx = e.deltaX
  const dy = e.deltaY
  const horizontal = Math.abs(dx) > Math.abs(dy)
  const delta = horizontal ? dx : dy

  // 过滤触控板轻微抖动
  if (Math.abs(delta) < 10) return

  const now = performance.now()

  // 纵向：内容优先
  if (!horizontal) {
    const sc = scrollableAt(e.target)
    if (sc) {
      const canDown = sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1
      const canUp = sc.scrollTop > 0

      // 内容还能往这个方向滚 → 完全交还给内容
      if ((delta > 0 && canDown) || (delta < 0 && canUp)) {
        contentScrollAt = now
        return
      }

      // 已经在这个方向的边界（向下到底 / 向上到顶）。
      // 如果刚刚还在滚内容，说明这是同一手势的余波，把这次也吃掉；
      // 注意这里【不刷新 contentScrollAt】—— 刷新了它就永远保鲜，
      // 用户就再也切不了卡。等间隔自然超过 GESTURE_IDLE，新手势才切卡。
      if (now - contentScrollAt < GESTURE_IDLE) return
    }
  }

  // 一次滚轮动作只切换一张
  if (now - wheelLock < 260) return
  wheelLock = now

  e.preventDefault()
  goTo(activeIndex.value + (delta > 0 ? 1 : -1))
}

/* ------------------------------------------------------------------ *
 * 键盘：左右方向键；焦点在输入控件里时一律忽略
 * ------------------------------------------------------------------ */
function onKeydown(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  if (e.altKey || e.ctrlKey || e.metaKey) return
  if (visibleModes.value.length <= 1) return
  const a = document.activeElement
  if (a && a.closest && a.closest('input, textarea, select, [contenteditable="true"]')) return
  e.preventDefault()
  hideHint()
  goTo(activeIndex.value + (e.key === 'ArrowRight' ? 1 : -1))
}

// 唯一的换页入口：只上报 id，真正的状态由宿主改，动画由下面的 watch 统一负责。
// 走这里的都是用户主动操作（滚轮 / 方向键 / 点邻卡露出区），所以要记一次滑动。
function goTo(i) {
  const n = visibleModes.value.length
  if (n <= 1) return
  const t = Math.max(0, Math.min(n - 1, i))
  if (t === activeIndex.value) return
  emit('select', visibleModes.value[t].id)
  countSwipe()
}

function onCardClick(i, e) {
  if (!e) return
  // 内容组件内部的点击会冒泡到这里，而那个按钮可能已经改掉了 activeId（比如时间应用里
  // 「下一提醒」跳到提醒卡）。此时 activeIndex 已不等于 i，只看 activeIndex 会把它误判成
  // "点了第 i 张"再跳回去。所以：只有点在卡片本身才算导航。
  // 邻卡的内容被设成了 pointer-events:none，所以点露出区的任何位置，
  // target 都是卡片自己 —— 不会因为这条判断丢掉可点区域。
  if (e.target !== e.currentTarget) return
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (phase.value !== 'idle') return
  if (i === activeIndex.value) return
  goTo(i)
}

/* ------------------------------------------------------------------ *
 * 身份行：状态圆点由宿主通过 dotOf 决定语义
 * ------------------------------------------------------------------ */
const dotState = computed(() => props.dotOf(activeMode.value && activeMode.value.id))
const dotPulse = computed(() => dotState.value === 'run')
const dotOpacity = computed(() => (dotState.value === 'dim' ? 0.28 : 1))

const moreOpen = ref(false)
const barEl = ref(null)
function toggleMore() {
  moreOpen.value = !moreOpen.value
}
function onDocPointerDown(e) {
  if (!moreOpen.value) return
  // 点在身份行内（含「更多」按钮本身）不关，否则按钮的 toggle 会被立刻抵消
  if (barEl.value && barEl.value.contains(e.target)) return
  moreOpen.value = false
}
function onOpenSettings() {
  moreOpen.value = false
  if (window.api && window.api.openSettings) window.api.openSettings()
}
async function onHideMode() {
  moreOpen.value = false
  if (visibleModes.value.length <= 1) return
  const subs = { ...(appSettings.enabledSubs || {}) }
  subs[activeMode.value.id] = false
  await update({ enabledSubs: subs })
}

/* ------------------------------------------------------------------ *
 * 同步：所有外部变化（点击邻卡、内容里发起的跳转、设置里开关模式、容器尺寸）
 * ------------------------------------------------------------------ */
function measure() {
  const w = deckEl.value && deckEl.value.clientWidth
  if (w && w > 0) deckW.value = w
}

// 模式的增删 → 卡片的 DOM 数量变了，按新索引就地复位
watch(
  () => visibleModes.value.map((m) => m.id).join(','),
  () => nextTick(() => snapTo(activeIndex.value))
)

// 外部改 activeId
watch(activeIndex, (next, prev) => {
  if (phase.value !== 'idle') return
  const dist = Math.abs(next - prev)
  if (!dist) return
  // 先把起点钉死在旧索引的基准上，避免上一次操作留下的位置偏差
  xProxy.x = baseX(prev)
  applyX()
  runTween(baseX(next), dist === 1 ? 0.42 : 0.46, dist === 1 ? 'power3.out' : 'power4.out')
})

// 视口宽度变化 → 几何重算，当前卡片重新居中
watch([cardW, originX], () => {
  if (phase.value === 'idle') snapTo(activeIndex.value)
})

let ro = null
onMounted(() => {
  measure()
  snapTo(activeIndex.value)
  window.addEventListener('keydown', onKeydown)
  // 必须 passive: false，否则 preventDefault 无效
  deckEl.value?.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('pointerdown', onDocPointerDown, true)
  if (typeof ResizeObserver === 'function' && deckEl.value) {
    ro = new ResizeObserver(measure)
    ro.observe(deckEl.value)
  }
  // 等展开形变跑完再提示，不然两件事会抢注意力
  if (hintOn.value) hintStartTimer = setTimeout(playHint, 900)
})

onBeforeUnmount(() => {
  endPointer()
  if (tween) {
    tween.kill()
    tween = null
  }
  hideHint()
  clearTimeout(suppressTimer)
  window.removeEventListener('keydown', onKeydown)
  deckEl.value?.removeEventListener('wheel', onWheel)
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  if (ro) {
    ro.disconnect()
    ro = null
  }
})
</script>

<style scoped>
.carousel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 兜底值，实际由 :style 覆盖（cardW 从视口宽度算出来） */
  --card-w: 314px;
  --gap: 10px;
}

/* ---------------- 身份行 ---------------- */
.mode-bar {
  position: relative;
  z-index: 5;
  flex-shrink: 0;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 14px 0 6px;
}
.bar-handle {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.28);
}
.bar-handle-ico {
  width: 13px;
  height: 13px;
}
.bar-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin: 0 7px 0 2px;
  transition: background 0.28s ease, opacity 0.28s ease;
}
.bar-dot.pulse {
  animation: dot-pulse 1.6s ease-in-out infinite;
}
@keyframes dot-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.55);
  }
}
.bar-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-fill {
  flex: 1;
  min-width: 0;
}
.bar-more {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.42);
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}
.bar-more:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
}
.bar-more-ico {
  width: 15px;
  height: 15px;
}

/* 更多菜单 */
.more-pop {
  position: absolute;
  top: 31px;
  right: 10px;
  min-width: 132px;
  padding: 4px;
  border-radius: 11px;
  background: rgba(30, 30, 34, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 1px;
  z-index: 30;
}
.more-item {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  padding: 6px 9px;
  border-radius: 7px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
}
.more-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.09);
}
.more-item:disabled {
  color: rgba(255, 255, 255, 0.28);
  cursor: default;
}
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s cubic-bezier(0.22, 1, 0.36, 1);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.96);
}

/* ---------------- 滑动提示 ---------------- */
/* 浮在卡片下沿之上的一个小胶囊。pointer-events: none —— 点穿透，
   不挡卡片本身的按钮；用户一交互就收掉。 */
.swipe-hint {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
}
.swipe-hint-ico {
  width: 11px;
  height: 11px;
  opacity: 0.6;
}
.swipe-hint-ico:first-child {
  animation: hint-l 1.9s ease-in-out infinite;
}
.swipe-hint-ico:last-child {
  animation: hint-r 1.9s ease-in-out infinite;
}
/* 「动画」设为关闭时不抖 */
.swipe-hint.still .swipe-hint-ico {
  animation: none;
  opacity: 0.8;
}
@keyframes hint-l {
  0%,
  100% {
    transform: translateX(0);
    opacity: 0.45;
  }
  50% {
    transform: translateX(-3px);
    opacity: 0.95;
  }
}
@keyframes hint-r {
  0%,
  100% {
    transform: translateX(0);
    opacity: 0.45;
  }
  50% {
    transform: translateX(3px);
    opacity: 0.95;
  }
}
.hint-enter-active,
.hint-leave-active {
  transition: opacity 0.32s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.hint-enter-from,
.hint-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}

/* ---------------- 卡片轨道 ---------------- */
.deck {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  touch-action: pan-y;
  margin-top: 6px;
}
.deck.is-dragging {
  cursor: grabbing;
  user-select: none;
}
.track {
  display: flex;
  align-items: stretch;
  gap: var(--gap);
  height: 100%;
  will-change: transform;
}



/* =========================================================
   卡片
   Apple 风格：
   当前卡 = 清晰、稳定
   侧卡   = 若隐若现的下一项提示
   ========================================================= */

.card {
  position: relative;
  flex: 0 0 var(--card-w);
  width: var(--card-w);
  height: 100%;

  display: flex;
  flex-direction: column;

  padding: 3px 10px;
  box-sizing: border-box;

  border-radius: 22px;
  background: transparent;
  border: none;

  transform-origin: center center;
  backface-visibility: hidden;
  contain: paint;

  /*
   * 非逐帧属性才使用 transition
   * transform / opacity 由 JS 控制时不要加 transition
   */
  transition:
    box-shadow 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.32s ease;
}


/* ---------------------------------------------------------
   当前卡片
   --------------------------------------------------------- */

.card:not(.is-side) {
  /*
   * 当前卡不要刻意加阴影。
   * 灵动岛应该让内容本身成为视觉中心。
   */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025);
}


/* ---------------------------------------------------------
   卡片内容
   --------------------------------------------------------- */

.card-body {
  /*
   * 永远存在 transition，
   * 避免 .is-side 切换时 transition 被销毁。
   */
  transition:
    filter 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}


/* =========================================================
   侧卡
   ========================================================= */

.card.is-side {
  cursor: pointer;

  /*
   * 不要做成明显的白色玻璃板。
   * 只给极低存在感的透明层。
   */
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.045) 0%,
      rgba(255, 255, 255, 0.018) 42%,
      rgba(255, 255, 255, 0.008) 100%
    );

  /*
   * 真正的毛玻璃只保留很弱的一层。
   */
  backdrop-filter: blur(14px) saturate(115%);
  -webkit-backdrop-filter: blur(14px) saturate(115%);

  /*
   * 不再使用明显的外发光。
   *
   * 这里的重点是：
   * 用户“感觉到有一张卡”，
   * 而不是“一眼看到一个发光按钮”。
   */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    inset 0 0 18px rgba(255, 255, 255, 0.025);

  /*
   * 整张侧卡稍微降低存在感。
   */
  filter: brightness(0.92);
}


/* ---------------------------------------------------------
   侧卡内容
   --------------------------------------------------------- */

.card.is-side .card-body {
  filter:
    blur(2.8px)
    saturate(88%)
    brightness(0.72);

  opacity: 0.72;
}


/* =========================================================
   Hover
   ========================================================= */

.card.is-side:hover {
  /*
   * Hover 才明确告诉用户：
   * “这张可以点”
   */
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.075) 0%,
      rgba(255, 255, 255, 0.028) 45%,
      rgba(255, 255, 255, 0.012) 100%
    );

  filter: brightness(1);

  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    inset 0 0 22px rgba(255, 255, 255, 0.035),
    0 0 14px rgba(255, 255, 255, 0.055);
}


.card.is-side:hover .card-body {
  filter:
    blur(1.2px)
    saturate(95%)
    brightness(0.82);

  opacity: 0.84;
}


/* =========================================================
   Pointer / 拖动状态
   ========================================================= */

.deck.is-dragging .card.is-side {
  /*
   * 拖动时不要让 hover 效果干扰视觉。
   */
  filter: brightness(0.88);
}

.deck.is-dragging .card.is-side .card-body {
  filter:
    blur(3px)
    saturate(85%)
    brightness(0.68);

  opacity: 0.65;
}


/* =========================================================
   非常轻微的顶部玻璃高光
   ========================================================= */

.card.is-side::before {
  content: "";

  position: absolute;
  left: 18px;
  right: 18px;
  top: 3px;

  height: 1px;

  border-radius: 999px;

  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.13),
      transparent
    );

  opacity: 0.55;
  pointer-events: none;
}


/* Hover 时高光稍微明显 */

.card.is-side:hover::before {
  opacity: 0.85;
}
</style>
