<template>
  <div class="st-win">
    <!-- 标题栏。拖动是手动的：mousedown 记起点 → 算位移 → IPC setPosition。
         无边框窗口用 -webkit-app-region: drag 在 Windows 上会频闪。 -->
    <header class="st-titlebar" @mousedown="startDrag">
      <div class="st-title">
        <Icon name="settings" />
        <span>设置</span>
      </div>
      <div class="st-winbtns" @mousedown.stop>
        <button class="st-winbtn" title="最小化" @click="win('winMinimize')">
          <Icon name="minus" />
        </button>
        <button class="st-winbtn" title="最大化" @click="win('winToggleMaximize')">
          <Icon name="square" />
        </button>
        <button class="st-winbtn close" title="关闭" @click="win('winClose')">
          <Icon name="close" />
        </button>
      </div>
    </header>

    <div class="st-body">
      <!-- 左侧导航 -->
      <nav class="st-side">
        <div class="st-brand">
          <span class="st-brand-ico"><span class="st-brand-mark" /></span>
          <span>
            <span class="st-brand-name">灵动岛</span>
            <span class="st-brand-sub">Dynamic Island for Windows</span>
          </span>
        </div>

        <div class="st-nav">
          <button
            v-for="t in TABS"
            :key="t.id"
            class="st-nav-item"
            :class="{ on: tab === t.id }"
            @click="go(t.id)"
          >
            <Icon :name="t.icon" />
            <span>{{ t.name }}</span>
          </button>
        </div>

        <div class="st-side-foot">
          <button class="st-reset-link" :disabled="allDefault" @click="askReset">
            <Icon name="reset" />
            <span>恢复默认设置</span>
          </button>
          <div class="st-side-ver">v{{ version }}</div>
        </div>
      </nav>

      <!-- 内容区 -->
      <main ref="mainEl" class="st-main">
        <div class="st-main-inner">
          <div v-if="!inDetail" class="st-page-head">
            <h1 class="st-page-title">{{ pageTitle }}</h1>
            <div v-if="pageSub" class="st-page-sub">{{ pageSub }}</div>
          </div>
          <component :is="current.comp" ref="sectionRef" @detail="onDetail" />
        </div>
      </main>
    </div>

    <!-- 恢复默认确认 -->
    <Transition name="stfade">
      <div v-if="confirming" class="st-dlg-mask" @click.self="confirming = false">
        <div class="st-dlg">
          <div class="st-dlg-title">恢复所有设置？</div>
          <div class="st-dlg-text">
            应用数据不会被删除。<br />
            便签、待办、时间数据、剪贴板历史与材料箱任务都会保留，<br />
            只会把偏好设置还原为初始值。
          </div>
          <div class="st-dlg-actions">
            <button class="st-btn ghost" @click="confirming = false">取消</button>
            <button class="st-btn danger" @click="doReset">恢复</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watchEffect } from 'vue'
import Icon from '../components/Icon.vue'
import GeneralSection from './sections/GeneralSection.vue'
import AppearanceSection from './sections/AppearanceSection.vue'
import BehaviorSection from './sections/BehaviorSection.vue'
import AppsSection from './sections/AppsSection.vue'
import AboutSection from './sections/AboutSection.vue'
import {
  hydrate,
  listen,
  resetAll,
  isAllDefault,
  effectiveTheme,
} from '../composables/useSettings'

const TABS = [
  { id: 'general', name: '常规', icon: 'settings', comp: GeneralSection, sub: '设置软件的基础行为与启动选项' },
  { id: 'appearance', name: '外观', icon: 'palette', comp: AppearanceSection, sub: '调整灵动岛的视觉表现' },
  { id: 'behavior', name: '行为', icon: 'cursor', comp: BehaviorSection, sub: '控制灵动岛的展开、收起与通知方式' },
  { id: 'apps', name: '应用', icon: 'grid', comp: AppsSection, sub: '管理灵动岛中的功能模块' },
  { id: 'about', name: '关于', icon: 'info', comp: AboutSection, sub: '' },
]

const tab = ref('general')
const current = computed(() => TABS.find((t) => t.id === tab.value) || TABS[0])

// 主题：把结果写到 <html data-theme>，settings.css 里的变量整组跟着换。
// （灵动岛本身固定纯黑，主题只影响这个设置窗口）
watchEffect(() => {
  document.documentElement.dataset.theme = effectiveTheme()
})
const mainEl = ref(null)
const sectionRef = ref(null)
const version = ref('1.0.0')

// 「应用」页进到子设置后由子组件自己画标题，父级别重复画。
// 子页通过 @detail 事件上报自己在不在子页，比隔着模板 ref 读内部状态可靠。
const detailTitle = ref('')
const onDetail = (title) => {
  detailTitle.value = title || ''
}
const inDetail = computed(() => !!detailTitle.value)
const pageTitle = computed(() => detailTitle.value || current.value.name)
const pageSub = computed(() => (detailTitle.value ? '' : current.value.sub))

function go(id) {
  if (id === tab.value) return
  sectionRef.value?.back?.() // 离开时把「应用」子页收回目录
  detailTitle.value = ''
  tab.value = id
  if (mainEl.value) mainEl.value.scrollTop = 0
}

const confirming = ref(false)
const allDefault = computed(() => isAllDefault())

function askReset() {
  if (allDefault.value) return
  confirming.value = true
}
async function doReset() {
  await resetAll()
  sectionRef.value?.back?.()
  detailTitle.value = ''
  confirming.value = false
}

const win = (m) => {
  if (window.api && window.api[m]) window.api[m]()
}

// ---------- 拖动（代替 -webkit-app-region: drag） ----------
let drag = null

async function startDrag(e) {
  if (e.button !== 0) return
  if (!window.api || !window.api.winGetBounds) return
  const b = await window.api.winGetBounds()
  if (!b || b.maximized) return
  drag = { sx: e.screenX, sy: e.screenY, wx: b.x, wy: b.y, moved: false }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', endDrag)
}

function onDragMove(e) {
  if (!drag) return
  const dx = e.screenX - drag.sx
  const dy = e.screenY - drag.sy
  if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
  drag.moved = true
  window.api.winMoveTo(drag.wx + dx, drag.wy + dy)
}

function endDrag() {
  drag = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', endDrag)
}

onMounted(async () => {
  await hydrate()
  listen()
  if (window.api && window.api.settingsMeta) {
    const m = await window.api.settingsMeta()
    if (m && m.version) version.value = m.version
  }
})
</script>
