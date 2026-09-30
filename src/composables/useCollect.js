// 「常用」的渲染侧状态：常用语 + 常用图片（模块级单例，岛与设置窗口各持一份镜像）
//
// 数据真身在主进程 collect.js（userData/data/**），这里只存**元数据镜像**：
// 图片是 collect://thumb/<id> 这样的 URL，绝不把 Base64 放进 Vue state —— 方案第 56 条。
import { computed, ref } from 'vue'

const state = ref({ groups: [], phrases: [], images: [], clip: { items: [], images: [] } })
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

// 分组：常用语与常用图片共用同一套名字列表（在设置页管理，岛内只用来筛选）。
// 条目本身依旧用 category 字段存组名，所以老数据不需要迁移。
export const groups = computed(() => state.value.groups || [])

// 分组 → 条目数（胶囊上的计数）；空字符串代表「未分类」
export function groupCounts(list) {
  const m = new Map()
  for (const x of Array.isArray(list) ? list : []) {
    const k = x.category || ''
    m.set(k, (m.get(k) || 0) + 1)
  }
  return m
}

// 首屏预置分组（仅当主进程还没回数据时用来占位，避免胶囊闪一下空白）
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

// 搜索 + 分组筛选（常用语搜正文，图片搜名称）
//   group = '*'  不按分组筛（全部）
//   group = ''   只看「未分类」
//   group = 组名 只看该组
export function filterCollect(list, { q = '', group = '*', category = '' } = {}) {
  const kw = String(q || '').trim().toLowerCase()
  return (Array.isArray(list) ? list : []).filter((x) => {
    if (group !== '*') {
      if ((x.category || '') !== group) return false
    } else if (category && (x.category || '') !== category) {
      // 兼容旧调用（直接传 category）
      return false
    }
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

/* ---------------- 分组 ---------------- */

export async function addGroup(name) {
  const a = api()
  if (!a || !a.groupAdd) return null
  return a.groupAdd(String(name || '').trim())
}

export async function renameGroup(from, to) {
  const a = api()
  if (!a || !a.groupRename) return null
  return a.groupRename(from, to)
}

// 删除分组：该分组下的条目会回落「未分类」
export async function removeGroup(name) {
  const a = api()
  if (!a || !a.groupRemove) return false
  return !!(await a.groupRemove(name))
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
    groups,
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
    addGroup,
    renameGroup,
    removeGroup,
  }
}

// 模块加载即订阅：岛和设置窗口都 import 这个文件，两边都能立刻拿到数据与变更推送
initCollectState()
