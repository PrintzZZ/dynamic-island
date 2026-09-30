// 「常用」的渲染侧状态：常用语 + 常用图片（模块级单例，岛与设置窗口各持一份镜像）
//
// 数据真身在主进程 collect.js（userData/data/**），这里只存**元数据镜像**：
// 图片是 collect://thumb/<id> 这样的 URL，绝不把 Base64 放进 Vue state —— 方案第 56 条。
import { computed, ref } from 'vue'

const state = ref({ phrases: [], images: [], clip: { items: [], images: [] } })
let bound = false

function apply(s) {
  if (s && typeof s === 'object') state.value = s
}

// 两个窗口都调这个：设置窗口和岛各订阅一份
export function initCollectState() {
  if (bound || typeof window === 'undefined' || !window.api || !window.api.collectGet) return
  bound = true
  if (window.api.onCollectChanged) window.api.onCollectChanged(apply)
  Promise.resolve(window.api.collectGet())
    .then(apply)
    .catch(() => {})
}

export const phrases = computed(() => state.value.phrases || [])
export const images = computed(() => state.value.images || [])
export const clipTexts = computed(() => (state.value.clip && state.value.clip.items) || [])
export const clipImages = computed(() => (state.value.clip && state.value.clip.images) || [])

// 方案第 29 条的分类。不是强制项：留空 = 未分类。
export const CATEGORIES = ['售前', '安装', '使用', '售后', '其他']

export const thumbUrl = (id) => `collect://thumb/${id}`
export const fullUrl = (id) => `collect://full/${id}`
export const clipUrl = (id) => `collect://clip/${id}`

// 统一排序：置顶（星标）→ 使用频率 → 最近使用（方案第 27、38 条）
export function sortCollect(list, mode = 'smart') {
  const arr = Array.isArray(list) ? list.slice() : []
  const ts = (x) => Number(x.lastUsedAt) || Number(x.updatedAt) || Number(x.createdAt) || 0
  if (mode === 'recent') return arr.sort((a, b) => ts(b) - ts(a))
  if (mode === 'count') return arr.sort((a, b) => (Number(b.useCount) || 0) - (Number(a.useCount) || 0))
  return arr.sort(
    (a, b) =>
      (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
      (Number(b.useCount) || 0) - (Number(a.useCount) || 0) ||
      ts(b) - ts(a)
  )
}

// 搜索：常用语搜正文，图片搜名称（方案第 31、39 条）
export function filterCollect(list, { q = '', category = '' } = {}) {
  const kw = String(q || '').trim().toLowerCase()
  return (Array.isArray(list) ? list : []).filter((x) => {
    if (category && (x.category || '') !== category) return false
    if (!kw) return true
    const hay = [x.text, x.name, x.category].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(kw)
  })
}

/* ---------------- 操作：全部转给主进程 ---------------- */

const api = () => (typeof window !== 'undefined' ? window.api : null)

export async function addPhrase(text, category = '') {
  const a = api()
  if (!a || !a.phraseAdd) return null
  const t = String(text || '').trim()
  if (!t) return null
  return a.phraseAdd({ text: t, category })
}

export async function updatePhrase(id, patch) {
  const a = api()
  if (!a || !a.phraseUpdate) return null
  return a.phraseUpdate(id, patch)
}

export async function removePhrase(id) {
  const a = api()
  if (!a || !a.phraseRemove) return false
  return !!(await a.phraseRemove(id))
}

// 点常用语 = 直接写进系统剪贴板 + 计数（不弹确认，方案第 23、26 条）
export async function usePhrase(id) {
  const a = api()
  if (!a || !a.phraseUse) return false
  return !!(await a.phraseUse(id))
}

// 点常用图片 = 把**图片**写进系统剪贴板，可以直接粘到任何窗口（方案第 35、36 条）
export async function useImage(id) {
  const a = api()
  if (!a || !a.imageUse) return false
  return !!(await a.imageUse(id))
}

export async function updateImage(id, patch) {
  const a = api()
  if (!a || !a.imageUpdate) return null
  return a.imageUpdate(id, patch)
}

export async function removeImage(id) {
  const a = api()
  if (!a || !a.imageRemove) return false
  return !!(await a.imageRemove(id))
}

export async function pickImages() {
  const a = api()
  if (!a || !a.imagePick) return { ok: false }
  return a.imagePick()
}

// Ctrl+V：把系统剪贴板里的图直接存成常用图片（省掉"忘记点星标"那一步）
export async function pasteImage() {
  const a = api()
  if (!a || !a.imagePaste) return { ok: false, error: 'NO_API' }
  return a.imagePaste()
}

// 全局粘贴监听：只在指定视图生效；焦点在输入框/文本域里时不拦截
// （否则用户想在搜索框里粘贴文字会被抢走）
export function installPasteHandler(getEnabled, onResult) {
  if (typeof window === 'undefined') return () => {}
  const handler = async (e) => {
    if (!getEnabled()) return
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    e.preventDefault()
    const r = await pasteImage()
    if (onResult) onResult(r)
  }
  window.addEventListener('paste', handler)
  return () => window.removeEventListener('paste', handler)
}

export async function importImages(paths) {
  const a = api()
  if (!a || !a.imageImport) return { ok: false }
  return a.imageImport(paths)
}

export async function revealFile(p) {
  const a = api()
  if (!a || !a.collectReveal) return false
  return !!(await a.collectReveal(p))
}

export function usePhrases() {
  return {
    phrases,
    images,
    clipTexts,
    clipImages,
    CATEGORIES,
    addPhrase,
    updatePhrase,
    removePhrase,
    usePhrase,
    useImage,
    updateImage,
    removeImage,
    pickImages,
    importImages,
  }
}

// 模块加载即订阅：岛和设置窗口都 import 这个文件，两边都能立刻拿到数据与变更推送
initCollectState()
