// 剪贴板面板自身的状态（列表 / 最新一条 / 设置代理）
//
// ⚠️ 这里**只做状态同步**，不再负责弹提示 —— 提示与 ☆ 收藏在
// src/composables/collectBridge.js 里，由 main.js 直接 import 常驻。
// 原因：本文件只被剪贴板面板 import，而面板只在「效率」应用切到剪贴板模式时才挂载，
// 把订阅写在这里会导致"没打开过剪贴板就收不到截图提示"（实测踩过）。
import { reactive, ref } from 'vue'
import { settings as appSettings, update as updateSettings } from '../../../../composables/useSettings'

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

// 历史记录：真实数据在主进程 collect.js，这里保存一份镜像供组件渲染
const items = ref([])
const latest = ref(null)
// 最近一张进历史的图片（面板以后要展示它，先把数据留着）
const latestImage = ref(null)

function upsert(item) {
  const i = items.value.findIndex((x) => x.text === item.text)
  if (i !== -1) items.value.splice(i, 1)
  items.value.unshift(item)
  if (items.value.length > MAX) items.value.length = MAX
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
  if (window.api && window.api.onClipboardNew) {
    window.api.onClipboardNew((item) => {
      if (!item || typeof item !== 'object') return
      if (item.kind === 'image') {
        latestImage.value = item
        return
      }
      if (typeof item.text !== 'string') return
      latest.value = item
      upsert(item)
    })
  }
}

// 模块加载即同步一次，面板没打开时也保持列表是新的
init()

export function useClipboard() {
  async function copy(item) {
    if (!item || !window.api || !window.api.clipCopy) return false
    const ok = await window.api.clipCopy({ text: item.text })
    if (ok) upsert({ ...item, at: Date.now() })
    return !!ok
  }

  async function open(item) {
    if (!item || !item.url || !window.api || !window.api.clipOpenUrl) return false
    return !!(await window.api.clipOpenUrl(item.url))
  }

  async function remove(id) {
    if (!window.api || !window.api.clipRemove) return
    await window.api.clipRemove({ id })
    items.value = items.value.filter((x) => x.id !== id)
    if (latest.value && latest.value.id === id) latest.value = items.value[0] || null
  }

  async function clear() {
    if (!window.api || !window.api.clipClear) return
    await window.api.clipClear()
    items.value = []
    latest.value = null
    latestImage.value = null
  }

  return { items, latest, latestImage, settings, copy, open, remove, clear, refresh }
}
