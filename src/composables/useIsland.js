import { reactive, computed, watch } from 'vue'
import gsap from 'gsap'
import { getApps, getApp } from '../apps/registry'
import { sfx } from '../utils/sound'

// 胶囊尺寸（需与 main.css 的 CSS 变量、electron/main.js 的 WIN 保持一致）
export const SIZES = {
  compact: { w: 176, h: 44, r: 22 },
  expanded: { w: 384, h: 480, r: 34 },
  notice: { w: 360, h: 66, r: 24 }, // 通知态：临时接管胶囊，用来"触达"用户
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
  notice: null, // 临时通知（如"检测到复制了链接"），非空时胶囊进入通知态
})

watch(
  () => island.docked,
  (v) => localStorage.setItem('island.docked', v ? '1' : '0')
)

const activeApp = computed(() => getApp(island.activeAppId) || getApps()[0])
const apps = computed(() => getApps())

let pillEl = null

function currentSize() {
  if (island.notice) return SIZES.notice
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

// 记录上一次的目标高度：用来判断这次是"放大"还是"缩小"
let lastH = SIZES.compact.h

// 绑定胶囊 DOM，初始化尺寸 / 圆角 / 位置与 GPU 合成提示
export function bindPill(el) {
  pillEl = el
  if (el) {
    const s = currentSize()
    const c = cornerRadius()
    lastH = s.h
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
//
// Q 弹的关键是 back.out 的"过冲"：放大时会先冲过目标尺寸再收回来。
// 但过冲量是按"位移距离"算的，而缩小时位移同样很大（480 → 44），
// 用同样的强度会把胶囊压到几乎看不见、把里面的内容裁掉，
// 所以按方向分开给：放大用明显的弹（约 10% 过冲），缩小只留极轻的回弹。
function syncShape() {
  if (!pillEl) return
  const s = currentSize()
  const c = cornerRadius()
  const growing = s.h >= lastH
  lastH = s.h
  gsap.to(pillEl, {
    width: s.w,
    height: s.h,
    top: currentTop(),
    borderTopLeftRadius: c.tl,
    borderTopRightRadius: c.tr,
    borderBottomLeftRadius: c.bl,
    borderBottomRightRadius: c.br,
    duration: growing ? 0.42 : 0.34,
    ease: growing ? 'back.out(1.7)' : 'back.out(0.7)',
    overwrite: 'auto',
  })
}

// ---------- 通知态：临时接管胶囊，用来主动"触达"用户 ----------
// 计时状态放在模块级，保证不论从哪个组件调用都共用同一份
let noticeTimer = null
let noticeLeft = 0
let noticeAt = 0

function clearNoticeTimer() {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
}

function armNotice(ms) {
  noticeLeft = ms
  noticeAt = Date.now()
  clearNoticeTimer()
  noticeTimer = setTimeout(() => {
    noticeTimer = null
    dismissNotice()
  }, ms)
}

// 弹出通知：胶囊形变到通知尺寸并播放提示音，倒计时结束后自动回到原状态
// payload.silent = true 时不再播提示音（调用方已放过音效）
// payload.sticky = true 时常驻，只能显式 dismissNotice()（用于接收态 / 打包中）
export function showNotice(payload, duration = 6000) {
  if (!payload) return
  island.notice = { ...payload }
  syncShape()
  if (!payload.silent) sfx.notice()
  if (payload.sticky) clearNoticeTimer()
  else armNotice(duration)
}

// 就地更新通知内容（改属性不换引用，因此不会重播入场动画、也不会重置倒计时）
export function updateNotice(patch) {
  if (!island.notice || !patch) return false
  Object.assign(island.notice, patch)
  return true
}

export function dismissNotice(reason = 'auto') {
  clearNoticeTimer()
  const payload = island.notice
  if (!payload) return
  island.notice = null
  syncShape()
  // 通知订阅方：reason = 'user' 表示用户主动关掉，'auto' 表示倒计时自动收起
  for (const cb of noticeDismissHandlers) {
    try {
      cb(payload, reason)
    } catch {
      /* 订阅方出错不影响关闭通知 */
    }
  }
}

// 订阅"通知被关闭"，用于「提醒未被确认就继续催」这类逻辑
const noticeDismissHandlers = new Set()

export function onNoticeDismiss(cb) {
  noticeDismissHandlers.add(cb)
  return () => noticeDismissHandlers.delete(cb)
}

// 订阅"通知条上的动作按钮被点击"（如倒计时结束的「再来一次 / 完成」）
const noticeActionHandlers = new Set()

export function onNoticeAction(cb) {
  noticeActionHandlers.add(cb)
  return () => noticeActionHandlers.delete(cb)
}

export function emitNoticeAction(actionId) {
  const payload = island.notice
  if (!payload) return
  for (const cb of noticeActionHandlers) {
    try {
      cb(payload, actionId)
    } catch {
      /* 订阅方出错不影响其它订阅者 */
    }
  }
}

// 悬停暂停 / 移开继续，避免用户还没看完就消失
export function pauseNotice() {
  if (!noticeTimer) return
  clearNoticeTimer()
  noticeLeft = Math.max(0, noticeLeft - (Date.now() - noticeAt))
}

export function resumeNotice() {
  if (noticeTimer || !island.notice || noticeLeft <= 0) return
  armNotice(noticeLeft)
}

// ---------- 胶囊脉冲：给"开始 / 结束"这类瞬时动作一个视觉反馈 ----------
// 用 CSS 动画改 box-shadow，刻意不碰 transform，避免和形变动画、居中位移打架
export function pulsePill(kind = 'start') {
  const el = pillEl
  if (!el) return
  const cls = kind === 'end' ? 'pulse-end' : 'pulse-start'
  el.classList.remove('pulse-start', 'pulse-end')
  // 读一次布局，保证连续触发时动画能重新播放
  void el.offsetWidth
  el.classList.add(cls)
  const onEnd = () => {
    el.classList.remove(cls)
    el.removeEventListener('animationend', onEnd)
  }
  el.addEventListener('animationend', onEnd)
}

// ---------- 岛屿动作 ----------
// 这些动作不依赖任何组件上下文，统一放在模块级并具名导出：
// 这样应用模块（如材料箱）也能直接调用 switchApp，而不必先 useIsland()
export function expand() {
  if (island.mode === 'expanded') return
  // 通知展示期间不展开，避免把刚弹出的提醒顶掉（例如悬停延迟到期）
  if (island.notice) return
  island.mode = 'expanded'
  syncShape()
  sfx.expand()
}

// 自动收起（悬停离开），受「固定」约束
export function collapse() {
  if (island.pinned) return
  if (island.mode === 'compact') return
  island.mode = 'compact'
  syncShape()
  sfx.collapse()
}

// 显式收起（按钮 / Esc），无视固定
export function forceCollapse() {
  if (island.mode === 'compact') return
  island.mode = 'compact'
  syncShape()
  sfx.collapse()
}

export function toggle() {
  island.mode === 'compact' ? expand() : forceCollapse()
}

export function switchApp(id) {
  if (!getApp(id)) return
  // 从托盘 / 右键菜单切应用时，先收掉正在展示的提醒，否则面板会被通知态挡住
  dismissNotice()
  if (island.activeAppId !== id) sfx.switchApp()
  island.activeAppId = id
  expand()
}

export function togglePin() {
  island.pinned = !island.pinned
}

// 吸附 / 解除吸附：圆角 + 顶部偏移一起过渡
export function setDock(value) {
  const next = !!value
  if (island.docked === next) return
  island.docked = next
  if (window.api) window.api.reportDock(next)
  sfx[next ? 'dock' : 'undock']()
  syncShape()
}

export function toggleDock() {
  setDock(!island.docked)
}

export function useIsland() {
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
    showNotice,
    dismissNotice,
    pauseNotice,
    resumeNotice,
  }
}
