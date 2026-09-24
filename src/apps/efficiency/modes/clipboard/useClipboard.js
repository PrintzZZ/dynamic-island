import { reactive, ref } from 'vue'
import { island, showNotice } from '../../../../composables/useIsland'
import { settings as appSettings, notifyAllowed, update as updateSettings } from '../../../../composables/useSettings'

const MAX = 60

// 「检测到链接时提醒」现在由设置面板统一管（settings.json 的 clipRemindLink）。
// 这里用一对存取器包成 reactive，岛内那个小开关和设置面板改的是同一个值。
const settings = reactive({
  get alertOnLink() {
    return appSettings.clipRemindLink !== false
  },
  set alertOnLink(v) {
    updateSettings({ clipRemindLink: !!v })
  },
})

const notifyLinkEnabled = () => appSettings.clipRemindLink !== false

// 历史记录：真实数据在主进程，这里保存一份镜像供组件渲染
const items = ref([])
const latest = ref(null)

function upsert(item) {
  const i = items.value.findIndex((x) => x.text === item.text)
  if (i !== -1) items.value.splice(i, 1)
  items.value.unshift(item)
  if (items.value.length > MAX) items.value.length = MAX
}

function onNew(item) {
  if (!item || typeof item.text !== 'string') return
  latest.value = item
  upsert(item)
  // 复制到链接时，让灵动岛以通知态主动触达；
  // 展开态 / 窗口隐藏时不打断用户，只安静入库。
  // 两道闸门：剪贴板设置里的「复制链接时提醒」+ 行为·通知里的全局「复制链接时提醒」
  const allow =
    item.url &&
    notifyLinkEnabled() &&
    notifyAllowed('clipboard') &&
    island.mode === 'compact' &&
    !document.hidden
  if (allow) {
    // 不传 duration：用设置里的「通知显示时间」
    showNotice({
      accent: '#5AC8FA',
      icon: 'link',
      title: '检测到复制了链接',
      detail: item.url,
      url: item.url,
      source: 'clipboard',
    })
  }
}

async function refresh() {
  if (!window.api || !window.api.getClipboard) return
  const list = await window.api.getClipboard()
  if (Array.isArray(list)) {
    items.value = list.slice(0, MAX)
    latest.value = items.value[0] || null
  }
}

let inited = false

function init() {
  if (inited) return
  inited = true
  refresh()
  if (window.api && window.api.onClipboardNew) window.api.onClipboardNew(onNew)
}

// 模块加载即订阅，保证剪贴板应用没打开时也能收到新记录、也能弹提醒
init()

export function useClipboard() {
  async function copy(item) {
    if (!item || !window.api || !window.api.copyClip) return false
    const ok = await window.api.copyClip(item.text)
    if (ok) upsert({ ...item, at: Date.now() })
    return !!ok
  }

  async function open(item) {
    if (!item || !item.url || !window.api || !window.api.openClipUrl) return false
    return !!(await window.api.openClipUrl(item.url))
  }

  async function remove(id) {
    if (!window.api || !window.api.removeClip) return
    await window.api.removeClip(id)
    items.value = items.value.filter((x) => x.id !== id)
    if (latest.value && latest.value.id === id) latest.value = items.value[0] || null
  }

  async function clear() {
    if (!window.api || !window.api.clearClip) return
    await window.api.clearClip()
    items.value = []
    latest.value = null
  }

  return { items, latest, settings, copy, open, remove, clear, refresh }
}
