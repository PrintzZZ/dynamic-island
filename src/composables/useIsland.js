import { reactive, computed, watch } from 'vue'
import gsap from 'gsap'
import { getApps, getApp } from '../apps/registry'
import { sfx } from '../utils/sound'

// 胶囊尺寸（需与 main.css 的 CSS 变量、electron/main.js 的 WIN 保持一致）
export const SIZES = {
  compact: { w: 176, h: 44, r: 22 },
  expanded: { w: 384, h: 480, r: 34 },
}

// 胶囊距窗口顶部的偏移：浮动 / 吸附贴边
export const PILL_TOP = { float: 16, docked: 0 }

function loadDocked() {
  try {
    return localStorage.getItem('island.docked') === '1'
  } catch {
    return false
  }
}

export const island = reactive({
  mode: 'compact', // 'compact' | 'expanded'
  activeAppId: 'notes',
  pinned: false, // 固定展开态，离开时不自动收起
  docked: loadDocked(), // 是否吸附在屏幕顶部
})

watch(
  () => island.docked,
  (v) => localStorage.setItem('island.docked', v ? '1' : '0')
)

const activeApp = computed(() => getApp(island.activeAppId) || getApps()[0])
const apps = computed(() => getApps())

let pillEl = null

function currentSize() {
  return island.mode === 'expanded' ? SIZES.expanded : SIZES.compact
}

function currentTop() {
  return island.docked ? PILL_TOP.docked : PILL_TOP.float
}

// 吸附时顶部两角归 0（贴边），底部保持圆角；否则四角统一圆角
function cornerRadius() {
  const r = currentSize().r
  const topR = island.docked ? 0 : r
  return { tl: topR, tr: topR, bl: r, br: r }
}

// 绑定胶囊 DOM，初始化尺寸 / 圆角 / 位置与 GPU 合成提示
export function bindPill(el) {
  pillEl = el
  if (el) {
    const s = currentSize()
    const c = cornerRadius()
    gsap.set(el, {
      width: s.w,
      height: s.h,
      top: currentTop(),
      borderTopLeftRadius: c.tl,
      borderTopRightRadius: c.tr,
      borderBottomLeftRadius: c.bl,
      borderBottomRightRadius: c.br,
      willChange: 'width,height,border-radius,top',
    })
  }
}

// 统一形变：尺寸 + 顶部偏移 + 四角圆角一起补间（合成层内渲染，流畅）
function syncShape() {
  if (!pillEl) return
  const s = currentSize()
  const c = cornerRadius()
  gsap.to(pillEl, {
    width: s.w,
    height: s.h,
    top: currentTop(),
    borderTopLeftRadius: c.tl,
    borderTopRightRadius: c.tr,
    borderBottomLeftRadius: c.bl,
    borderBottomRightRadius: c.br,
    duration: 0.5,
    ease: 'expo.out', // 苹果式：先快后慢的弹性收束
    overwrite: 'auto',
  })
}

export function useIsland() {
  function expand() {
    if (island.mode === 'expanded') return
    island.mode = 'expanded'
    syncShape()
    sfx.expand()
  }

  // 自动收起（悬停离开），受"固定"约束
  function collapse() {
    if (island.pinned) return
    if (island.mode === 'compact') return
    island.mode = 'compact'
    syncShape()
    sfx.collapse()
  }

  // 显式收起（按钮 / Esc），无视固定
  function forceCollapse() {
    if (island.mode === 'compact') return
    island.mode = 'compact'
    syncShape()
    sfx.collapse()
  }

  function toggle() {
    island.mode === 'compact' ? expand() : forceCollapse()
  }

  function switchApp(id) {
    if (!getApp(id)) return
    if (island.activeAppId !== id) sfx.switchApp()
    island.activeAppId = id
    expand()
  }

  function togglePin() {
    island.pinned = !island.pinned
  }

  // 吸附 / 解除吸附：圆角 + 顶部偏移一起过渡
  function setDock(value) {
    const next = !!value
    if (island.docked === next) return
    island.docked = next
    if (window.api) window.api.reportDock(next)
    sfx[next ? 'dock' : 'undock']()
    syncShape()
  }

  function toggleDock() {
    setDock(!island.docked)
  }

  return {
    island,
    activeApp,
    apps,
    expand,
    collapse,
    forceCollapse,
    toggle,
    switchApp,
    togglePin,
    setDock,
    toggleDock,
  }
}
