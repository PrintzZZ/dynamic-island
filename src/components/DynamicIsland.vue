<template>
  <div class="island-root" @contextmenu.prevent="showMenu">
    <div
      ref="pillEl"
      class="pill"
      @mousedown="onPillDown"
    >
      <Transition name="slot">
        <!-- 通知态：临时接管胶囊，主动"触达"用户 -->
        <div
          v-if="island.notice"
          key="notice"
          class="notice-slot"
          :style="{ '--notice-accent': island.notice.accent || '#ffd60a' }"
          @click.stop="onNoticeBody"
        >
          <div ref="noticeEl" class="notice-inner">
            <div class="notice-icon">
              <Icon :name="island.notice.icon || 'clipboard'" class="notice-ico" />
            </div>
            <div class="notice-text">
              <div class="notice-title">{{ island.notice.title }}</div>
              <div class="notice-detail">{{ island.notice.detail }}</div>
            </div>
            <button
              v-if="island.notice.url"
              class="notice-act"
              title="打开链接"
              @click.stop="onNoticeOpen"
            >
              <Icon name="external" class="notice-act-ico" />
            </button>
            <button
              v-else-if="island.notice.ack"
              class="notice-act"
              title="知道了"
              @click.stop="onNoticeAck"
            >
              <Icon name="check" class="notice-act-ico" />
            </button>
          </div>
        </div>

        <!-- 紧凑态 -->
        <div v-else-if="island.mode === 'compact'" key="compact" class="compact-slot">
          <component :is="activeApp.compact" v-if="activeApp.compact" />
          <div v-else class="default-compact">
            <span class="icon">{{ activeApp.icon }}</span>
            <span class="name">{{ activeApp.name }}</span>
          </div>
        </div>

        <!-- 展开态 -->
        <div v-else key="expanded" class="expanded-slot">
          <div ref="headerEl" class="header">
            <button class="drag-handle" title="拖动" @mousedown.prevent="startDrag">
              <Icon name="drag" class="drag-ico" />
            </button>
            <div ref="tabsEl" class="app-tabs">
              <div ref="indicatorEl" class="tab-indicator" />
              <button
                v-for="app in apps"
                :key="app.id"
                :ref="(el) => setTabRef(app.id, el)"
                class="tab"
                :class="{ active: app.id === island.activeAppId }"
                :title="app.name"
                @click="switchApp(app.id)"
              >
                <span class="tab-dot" :style="{ background: app.accent }" />
                <span v-if="app.id === island.activeAppId" class="tab-name">{{ app.name }}</span>
              </button>
            </div>
            <div class="header-actions">
              <button
                class="icon-btn"
                :class="{ on: island.pinned }"
                title="固定展开"
                @click="togglePin"
              >
                <Icon :name="island.pinned ? 'dot-on' : 'dot-off'" class="ico" />
              </button>
              <button class="icon-btn" title="隐藏到托盘" @click.stop="doHide">
                <Icon name="close" class="ico" />
              </button>
            </div>
          </div>
          <div ref="bodyEl" class="body">
            <Transition name="app" mode="out-in">
              <component :is="activeApp.component" :key="island.activeAppId" />
            </Transition>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import gsap from 'gsap'
import Icon from './Icon.vue'
import { useIsland, bindPill } from '../composables/useIsland'
import { toggleMuted, isMuted, sfx } from '../utils/sound'

const {
  island,
  activeApp,
  apps,
  expand,
  collapse,
  forceCollapse,
  switchApp,
  togglePin,
  setDock,
  toggleDock,
  dismissNotice,
  pauseNotice,
  resumeNotice,
} = useIsland()

const pillEl = ref(null)
const headerEl = ref(null)
const bodyEl = ref(null)
const tabsEl = ref(null)
const indicatorEl = ref(null)
const noticeEl = ref(null)

// 记录最近一次鼠标位置：通知消失后据此重算点击穿透
let lastPointer = { x: 0, y: 0 }

// ---------- 悬停展开 / 收起 ----------
let enterTimer = null
let leaveTimer = null
let hovering = false
let suppressExpand = false

function hitTest(x, y) {
  const el = pillEl.value
  if (!el) return false
  const r = el.getBoundingClientRect()
  const pad = 4
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
}

function syncClickThrough(cx, cy) {
  const inside = hitTest(cx, cy)
  hovering = inside
  if (window.api) window.api.setClickThrough(!inside)
}

function onMove(e) {
  if (dragging) return
  lastPointer = { x: e.clientX, y: e.clientY }
  const inside = hitTest(e.clientX, e.clientY)
  if (inside !== hovering) {
    hovering = inside
    if (window.api) window.api.setClickThrough(!inside)
  }
  // 通知态：悬停暂停倒计时，且不触发展开 / 收起
  if (island.notice) {
    clearTimeout(enterTimer)
    enterTimer = null
    clearTimeout(leaveTimer)
    leaveTimer = null
    if (inside) pauseNotice()
    else resumeNotice()
    return
  }
  if (inside) {
    clearTimeout(leaveTimer)
    leaveTimer = null
    if (!suppressExpand && !enterTimer) {
      enterTimer = setTimeout(() => {
        enterTimer = null
        expand()
      }, 120)
    }
  } else {
    clearTimeout(enterTimer)
    enterTimer = null
    suppressExpand = false
    if (!leaveTimer) {
      leaveTimer = setTimeout(() => {
        leaveTimer = null
        collapse()
      }, 260)
    }
  }
}

// ---------- 拖动窗口 + 顶部吸附 ----------
const SNAP_DIST = 48 // 距顶部多少像素内触发吸附
let dragging = false
let dragMoved = false
let suppressClick = false
let dragState = null

async function startDrag(e) {
  if (e.button !== 0) return
  if (!window.api) return
  const ws = await window.api.getWindowState()
  if (!ws) return
  dragState = { sx: e.screenX, sy: e.screenY, wx: ws.x, wy: ws.y }
  dragging = true
  dragMoved = false
  window.api.setClickThrough(false)
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onPillDown(e) {
  // 通知态下不拖动，避免把提醒直接拖走
  if (island.notice) return
  // 紧凑态下整颗胶囊都可拖动；展开态由头部手柄拖动
  if (island.mode === 'compact') startDrag(e)
}

function onDragMove(e) {
  if (!dragState) return
  const dx = e.screenX - dragState.sx
  const dy = e.screenY - dragState.sy
  if (!dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    dragMoved = true
    // 拖离顶部时先解除吸附，让胶囊"被拎起"
    if (island.docked) setDock(false)
  }
  if (dragMoved && window.api) {
    window.api.moveTo(dragState.wx + dx, dragState.wy + dy)
  }
}

function onDragEnd(e) {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  dragging = false
  if (dragMoved) {
    suppressClick = true
    snapIfNearTop()
  }
  syncClickThrough(e.clientX, e.clientY)
}

async function snapIfNearTop() {
  if (!window.api) return
  const ws = await window.api.getWindowState()
  if (!ws) return
  const dist = ws.y - ws.workArea.y
  // 向下拖动视为「拖离顶部」，永不吸附；只有向上拖到顶才吸附
  const draggedDown = dragState ? ws.y - dragState.wy > 0 : false
  if (dist < SNAP_DIST && !draggedDown) {
    window.api.moveTo(ws.x, ws.workArea.y)
    setDock(true)
  } else {
    setDock(false)
  }
}

// ---------- 展开内容分镜入场 + 滑动标签指示器 ----------
const tabRefs = {}

function setTabRef(id, el) {
  if (el) tabRefs[id] = el
}

function moveIndicator() {
  const active = tabRefs[island.activeAppId]
  if (!active || !indicatorEl.value || !tabsEl.value) return
  gsap.to(indicatorEl.value, {
    x: active.offsetLeft,
    width: active.offsetWidth,
    opacity: 1,
    duration: 0.4,
    ease: 'expo.out',
    overwrite: 'auto',
  })
}

function revealExpanded() {
  if (headerEl.value) {
    gsap.fromTo(
      headerEl.value,
      { opacity: 0, y: -8 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out', delay: 0.05 }
    )
  }
  if (bodyEl.value) {
    gsap.fromTo(
      bodyEl.value,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out', delay: 0.12 }
    )
  }
  moveIndicator()
}

watch(
  () => island.mode,
  async (m) => {
    if (m === 'expanded') {
      await nextTick()
      revealExpanded()
    }
  }
)

watch(
  () => island.activeAppId,
  async (id) => {
    // 通知主进程：网速应用活跃时才采样，离开/收起后停止
    if (window.api && window.api.setNetActive) window.api.setNetActive(id === 'net')
    if (island.mode === 'expanded') {
      await nextTick()
      moveIndicator()
    }
  },
  { immediate: true }
)

// 通知入场动效：胶囊形变之外，再给内容补一层"被触达"的观感
watch(
  () => island.notice,
  async (n) => {
    await nextTick()
    if (!n) {
      // 提醒消失后按当前鼠标位置重算穿透，避免透明区域挡住点击
      syncClickThrough(lastPointer.x, lastPointer.y)
      return
    }
    if (noticeEl.value) {
      gsap.fromTo(
        noticeEl.value,
        { y: -14, scale: 0.94 },
        { y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.7)' }
      )
    }
  }
)

// ---------- 其它交互 ----------
function onClick() {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (island.notice) return
  if (island.mode === 'compact') expand()
}

// 点通知的空白处：只收起提醒，不展开岛；算作用户"已确认"
function onNoticeBody() {
  dismissNotice('user')
}

// 一键跳转：交给主进程用 shell.openExternal 打开（只放行 http/https）
async function onNoticeOpen() {
  const url = island.notice && island.notice.url
  if (!url) return
  if (window.api && window.api.openClipUrl) await window.api.openClipUrl(url)
  sfx.tick()
  dismissNotice('user')
}

// 「知道了」：明确确认，提醒不再催
function onNoticeAck() {
  sfx.tick()
  dismissNotice('user')
}

function doCollapse() {
  suppressExpand = true
  forceCollapse()
}

function doHide() {
  if (window.api) window.api.hideWindow()
}

function showMenu() {
  if (window.api) window.api.showMenu()
}

function onKey(e) {
  if (e.key !== 'Escape') return
  if (island.notice) {
    dismissNotice('user')
    return
  }
  doCollapse()
}

onMounted(async () => {
  bindPill(pillEl.value)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('click', onClick)
  window.addEventListener('keydown', onKey)
  if (window.api) {
    window.api.onSwitchApp((id) => switchApp(id))
    window.api.onDockToggle(() => toggleDock())
    window.api.onSoundToggle(() => {
      toggleMuted()
      window.api.reportSound(isMuted())
    })
    window.api.reportDock(island.docked)
    window.api.reportSound(isMuted())
    // 若启动即吸附，把窗口贴到顶部
    if (island.docked) {
      const ws = await window.api.getWindowState()
      if (ws) window.api.moveTo(ws.x, ws.workArea.y)
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('click', onClick)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})
</script>

<style scoped>
.island-root {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 胶囊主体：纯黑、发丝边框、柔和投影；尺寸与圆角由 GSAP 驱动 */
.pill {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: var(--island-compact-w);
  height: var(--island-compact-h);
  border-radius: 22px;
  background: var(--island-bg);
  border: 1px solid var(--hairline);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  will-change: width, height, border-radius, top;
}

/* 胶囊脉冲：计时开始（绿）/ 结束与提醒（红）时向外扩散一圈光晕。
   只动 box-shadow，不碰 transform，所以不会干扰形变和居中位移。 */
@keyframes pillPulseStart {
  0% {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 0 rgba(48, 209, 88, 0.55);
  }
  100% {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 16px rgba(48, 209, 88, 0);
  }
}
@keyframes pillPulseEnd {
  0% {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 0 rgba(255, 69, 58, 0.6);
  }
  100% {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 18px rgba(255, 69, 58, 0);
  }
}
.pill.pulse-start {
  animation: pillPulseStart 0.75s cubic-bezier(0.22, 1, 0.36, 1);
}
.pill.pulse-end {
  animation: pillPulseEnd 0.85s cubic-bezier(0.22, 1, 0.36, 1) 2;
}

/* 固定尺寸槽位：居中裁剪，形变过程中内容不回流 */
.compact-slot,
.expanded-slot {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
}
.compact-slot {
  width: var(--island-compact-w);
  height: var(--island-compact-h);
}
.expanded-slot {
  width: var(--island-expanded-w);
  height: var(--island-expanded-h);
  display: flex;
  flex-direction: column;
}

/* 通知态：外层只负责居中（transform 要留给居中），
   内层才交给 GSAP 做位移 / 缩放，避免两套 transform 互相覆盖 */
.notice-slot {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 360px;
  height: 66px;
}
.notice-inner {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 100%;
  padding: 0 12px 0 14px;
}
.notice-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: var(--notice-accent, #ffd60a);
  background: color-mix(in srgb, var(--notice-accent, #ffd60a) 20%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  animation: noticePulse 1.8s ease-in-out infinite;
}
.notice-ico {
  width: 17px;
  height: 17px;
}
@keyframes noticePulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}
.notice-text {
  flex: 1;
  min-width: 0;
}
.notice-title {
  font-size: 13px;
  font-weight: 700;
  color: #f5f5f7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notice-detail {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notice-act {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}
.notice-act:hover {
  background: var(--notice-accent, #ffd60a);
  color: #000;
  transform: scale(1.08);
}
.notice-act-ico {
  width: 15px;
  height: 15px;
}

/* 紧凑 / 展开交叉淡入淡出 */
.slot-enter-active,
.slot-leave-active {
  transition: opacity 0.22s ease;
}
.slot-enter-from,
.slot-leave-to {
  opacity: 0;
}

/* 缺省紧凑内容 */
.default-compact {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
}
.default-compact .icon {
  font-size: 15px;
  color: var(--accent);
}
.default-compact .name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  transform: translateY(-1px);
}

/* 展开态头部 */
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 12px 0 8px;
  flex-shrink: 0;
}
.drag-handle {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-2);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.18s ease, color 0.18s ease;
}
.drag-ico {
  width: 28px;
  height: 28px;
  stroke-width: 2.0;
}
.drag-handle:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}
.drag-handle:active {
  cursor: grabbing;
}
.app-tabs {
  position: relative;
  display: flex;
  gap: 4px;
}
.tab-indicator {
  position: absolute;
  top: 0;
  left: 0;
  height: 30px;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.14);
  width: 0;
  opacity: 0;
  pointer-events: none;
}
.tab {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 15px;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s ease;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  color: var(--text);
}
.tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tab-name {
  white-space: nowrap;
}
.header-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}
.icon-btn .ico {
  width: 13px;
  height: 13px;
}
.icon-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  color: var(--text);
  transform: scale(1.06);
}
.icon-btn.on {
  background: var(--accent);
  color: #000;
}

.body {
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--hairline);
}

/* 应用切换：弹性上滑入场 */
.app-enter-active {
  transition: opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.app-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.app-enter-from {
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}
.app-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.99);
}
</style>
