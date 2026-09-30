// 收集层：剪贴板历史（临时） + 常用（沉淀：常用语 / 常用图片）
//
// 设计依据见 docs 里的方案，要点：
//   · 剪贴板负责"收集"，常用负责"沉淀" —— 两者数据互相独立；
//   · 图片一律**存文件**，Vue / JSON 里只有路径与元数据，绝不塞 Base64（内存与体积都受不了）；
//   · 瀑布流只加载缩略图，点"复制"时才读原图；
//   · 用户主动点 ☆ 才把临时内容提升成常用内容。
//
// 目录布局：
//   userData/data/clipboard/history.json        剪贴板文本历史 + 最近图片的元数据
//   userData/data/clipboard/images/<id>.png     最近图片（最多 10 张，自动淘汰最旧）
//   userData/data/phrases/phrases.json          常用语
//   userData/data/phrases/images/<id>.<ext>     常用图片原图
//   userData/data/phrases/thumbnails/<id>.jpg   常用图片缩略图（瀑布流用）
//
// 渲染进程通过自定义协议 collect:// 取图，而不是直接引 file://：
//   collect://thumb/<id>   常用图片缩略图
//   collect://full/<id>    常用图片原图
//   collect://clip/<id>    最近图片
// 这样两个窗口（岛 / 设置）都能稳定加载，不依赖 file:// 的同源策略。
import { app, clipboard, ipcMain, net, nativeImage, protocol, shell, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as settings from './settings.js'

// 自定义协议必须在 app ready 之前登记（collect.js 在 main.js 顶部被 import，满足这个时机）
try {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'collect', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ])
} catch {
  /* 重复登记忽略 */
}

const RECENT_IMAGES_MAX = 10 // 方案第 5 条：最近图片最多 10 张
const THUMB_WIDTH = 480 // 瀑布流缩略图宽度

let winRef = null // 岛窗口，用来推"有新的剪贴板内容"
let settingsWinRef = null

// ---------------------------------------------------------------- 目录与读写

function dataDir() {
  return path.join(app.getPath('userData'), 'data')
}
function dirs() {
  const d = dataDir()
  return {
    clip: path.join(d, 'clipboard'),
    clipImages: path.join(d, 'clipboard', 'images'),
    phrases: path.join(d, 'phrases'),
    images: path.join(d, 'phrases', 'images'),
    thumbs: path.join(d, 'phrases', 'thumbnails'),
  }
}
function ensureDirs() {
  for (const p of Object.values(dirs())) {
    try {
      fs.mkdirSync(p, { recursive: true })
    } catch {
      /* ignore */
    }
  }
}
function readJson(file, fallback) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    return raw ?? fallback
  } catch {
    return fallback
  }
}
function writeJson(file, value) {
  try {
    ensureDirs()
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
    return true
  } catch (e) {
    console.error('[collect] 写盘失败', file, e && e.message)
    return false
  }
}
function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// 写盘防抖：图片元数据变动很密集（每复制一张图都要落一次）
let saveTimer = null
let dirty = false
function saveSoon() {
  dirty = true
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (dirty) flush()
  }, 300)
}
function flush() {
  dirty = false
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  writeJson(path.join(dirs().clip, 'history.json'), {
    version: 2,
    items: clipItems,
    images: clipImages,
  })
  writeJson(path.join(dirs().phrases, 'phrases.json'), { version: 1, phrases })
}

// ---------------------------------------------------------------- 状态

let clipItems = [] // 文本 / 链接，新的在前
let clipImages = [] // 最近图片，新的在前，最多 RECENT_IMAGES_MAX
let phrases = [] // 常用语
let images = [] // 常用图片

function clipMax() {
  return Math.max(1, Number(settings.load().clipboardLimit) || 60)
}
function clipOn() {
  return settings.load().clipboardEnabled !== false
}

// 老版本的单文件存储：迁移过来，避免用户丢历史
function migrateLegacy() {
  try {
    const legacy = path.join(app.getPath('userData'), 'clipboard-history.json')
    if (!fs.existsSync(legacy)) return
    if (fs.existsSync(path.join(dirs().clip, 'history.json'))) return
    const raw = readJson(legacy, null)
    if (Array.isArray(raw) && raw.length) {
      clipItems = raw
        .filter((x) => x && typeof x.text === 'string')
        .map((x) => ({
          id: String(x.id || uid('c')),
          kind: clipExtractUrl(x.text) ? 'link' : 'text',
          text: x.text,
          url: typeof x.url === 'string' ? x.url : clipExtractUrl(x.text),
          at: Number(x.at) || Date.now(),
        }))
        .slice(0, clipMax())
      console.log('[collect] 已迁移旧剪贴板历史', clipItems.length, '条')
    }
  } catch {
    /* ignore */
  }
}

export function initCollect() {
  ensureDirs()
  migrateLegacy()
  const h = readJson(path.join(dirs().clip, 'history.json'), null)
  if (h) {
    if (Array.isArray(h.items)) {
      clipItems = h.items.filter((x) => x && typeof x.text === 'string').slice(0, clipMax())
      for (const it of clipItems) {
        if (!it.kind) it.kind = it.url ? 'link' : 'text'
      }
    }
    if (Array.isArray(h.images)) {
      clipImages = h.images.filter((x) => x && x.file && fs.existsSync(x.file)).slice(0, RECENT_IMAGES_MAX)
      // 磁盘上多出来的（异常退出留下的）一并清掉
      pruneOrphanClipImages()
    }
  }
  const p = readJson(path.join(dirs().phrases, 'phrases.json'), null)
  if (p && Array.isArray(p.phrases)) {
    phrases = p.phrases
      .filter((x) => x && typeof x.text === 'string' && x.text.trim())
      .map((x) => ({
        id: String(x.id || uid('p')),
        text: x.text,
        category: typeof x.category === 'string' ? x.category : '',
        favorite: !!x.favorite,
        useCount: Number(x.useCount) || 0,
        lastUsedAt: Number(x.lastUsedAt) || 0,
        createdAt: Number(x.createdAt) || Date.now(),
        updatedAt: Number(x.updatedAt) || Number(x.createdAt) || Date.now(),
      }))
  }
  images = scanImages()
  flush()
}

// 常用图片的元数据以 JSON 为准，但也要把磁盘上"有文件没记录"的补回来（例如手动丢进目录）
function scanImages() {
  const meta = readJson(path.join(dirs().phrases, 'images.json'), null)
  const known = new Map()
  if (meta && Array.isArray(meta.images)) {
    for (const m of meta.images) if (m && m.id) known.set(String(m.id), m)
  }
  const out = []
  let files = []
  try {
    files = fs.readdirSync(dirs().images)
  } catch {
    files = []
  }
  for (const f of files) {
    const full = path.join(dirs().images, f)
    let st = null
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const id = f.replace(/\.[^.]+$/, '')
    const m = known.get(id) || {}
    const size = imageSize(path.join(dirs().thumbs, `${id}.jpg`)) || imageSize(full)
    out.push({
      id,
      name: String(m.name || id),
      category: typeof m.category === 'string' ? m.category : '',
      favorite: !!m.favorite,
      useCount: Number(m.useCount) || 0,
      lastUsedAt: Number(m.lastUsedAt) || 0,
      createdAt: Number(m.createdAt) || Math.round(st.birthtimeMs || st.mtimeMs || Date.now()),
      updatedAt: Number(m.updatedAt) || Math.round(st.mtimeMs || Date.now()),
      ext: path.extname(f).slice(1).toLowerCase(),
      bytes: st.size,
      w: Number(m.w) || (size && size.w) || 0,
      h: Number(m.h) || (size && size.h) || 0,
    })
  }
  out.sort((a, b) => b.createdAt - a.createdAt)
  return out
}

function scanImagesMetaPath() {
  return path.join(dirs().phrases, 'images.json')
}

function imageSize(file) {
  try {
    if (!fs.existsSync(file)) return null
    const img = nativeImage.createFromPath(file)
    if (img.isEmpty()) return null
    return img.getSize()
  } catch {
    return null
  }
}

function writeImagesMeta() {
  writeJson(scanImagesMetaPath(), { version: 1, images })
}

function pruneOrphanClipImages() {
  const keep = new Set(clipImages.map((x) => path.basename(x.file)))
  let files = []
  try {
    files = fs.readdirSync(dirs().clipImages)
  } catch {
    return
  }
  for (const f of files) {
    if (!keep.has(f)) {
      try {
        fs.unlinkSync(path.join(dirs().clipImages, f))
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------- 广播

function broadcast() {
  const payload = snapshot()
  for (const w of [winRef, settingsWinRef]) {
    if (w && !w.isDestroyed()) {
      try {
        w.webContents.send('collect:changed', payload)
      } catch {
        /* ignore */
      }
    }
  }
}

export function attachCollectWindows(islandWin, settingsWin) {
  winRef = islandWin
  if (settingsWin !== undefined) settingsWinRef = settingsWin
}

export function snapshot() {
  return {
    phrases: phrases.map((p) => ({ ...p })),
    images: images.map((m) => ({ ...m })),
    clip: {
      items: clipItems.map((c) => ({ ...c })),
      images: clipImages.map((c) => ({ ...c })),
    },
  }
}

// ---------------------------------------------------------------- 链接识别

// 方案第 15 条：只认 http / https，不碰 file:// 与未知协议
export function clipExtractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"'`]+/i)
  if (!m) return null
  const url = m[0].replace(/[.,;:!?，。；：！？）)】\]}》>'"”’]+$/, '')
  return url || null
}

// ---------------------------------------------------------------- 剪贴板写入（内部写入保护）

// 方案第 16 条 + 第 66/67 条：程序自己写进剪贴板的内容，不能再被监听器当成"用户复制的"
// 记进历史。做法是记下写入签名 + 一个很短的豁免窗口，双保险。
//
// 文本用**精确匹配**（可靠）；图片用「窗口内一律算自己写的」——
// 图片没法算稳定签名：写入时的 PNG 字节数和从剪贴板读回来再编码的字节数不一定相等
// （alpha 预乘等差异），拿它做相等判断会漏。代价是这 1.5s 内用户真复制的另一张图会被忽略，
// 这个概率极低且无副作用。
const SELF_WRITE_MS = 1500
let selfTextSig = ''
let selfImageUntil = 0
let selfUntil = 0

function markSelfText(text) {
  selfTextSig = `t:${text}`
  selfImageUntil = 0
  selfUntil = Date.now() + SELF_WRITE_MS
  if (DEBUG) console.log('[collect:dbg] markSelfText', JSON.stringify(selfTextSig))
}

function markSelfImage() {
  selfTextSig = ''
  selfImageUntil = Date.now() + SELF_WRITE_MS
  selfUntil = Date.now() + SELF_WRITE_MS
}

function isSelfText(text) {
  if (Date.now() > selfUntil) return false
  return !!selfTextSig && selfTextSig === `t:${text}`
}

function isSelfImage() {
  return Date.now() <= selfImageUntil
}

const DEBUG = !!process.env.DSH_COLLECT_DEBUG

export function writeClipboardText(text) {
  const t = String(text || '')
  markSelfText(t)
  clipboard.writeText(t)
}

export function writeClipboardImageById(id, from) {
  const file = from === 'clip' ? clipImages.find((x) => x.id === id)?.file : images.find((x) => x.id === id)?.file
  if (!file || !fs.existsSync(file)) return false
  const img = nativeImage.createFromPath(file)
  if (img.isEmpty()) return false
  markSelfImage()
  clipboard.writeImage(img)
  return true
}

// ---------------------------------------------------------------- 剪贴板采集

let clipLastText = ''
let lastImageSig = ''
let lastImageAt = 0

function pushClipText(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const dup = clipItems.findIndex((x) => x.text === t)
  if (dup !== -1) {
    if (settings.load().clipDedupe === 'ignore') return null
    clipItems.splice(dup, 1)
  }
  const url = clipExtractUrl(t)
  const item = {
    id: uid('c'),
    kind: url ? 'link' : 'text',
    text: t,
    url,
    at: Date.now(),
  }
  clipItems.unshift(item)
  if (clipItems.length > clipMax()) clipItems.length = clipMax()
  saveSoon()
  return item
}

function pushClipImage(img) {
  if (!img || img.isEmpty()) return null
  const size = img.getSize()
  if (!size || !size.width || !size.height) return null
  // 同一次写入被拆成两个事件（很多软件会分阶段写剪贴板）才去重 —— 只看**很短的窗口内**。
  // 不能"永不复位"地拿签名当历史：先复制图片 A、再复制文本、然后又复制同一张 A，
  // 第二次会被静默丢掉（实测踩过）。
  const sig = `${size.width}x${size.height}:${img.toPNG().length}`
  const now = Date.now()
  if (DEBUG) console.log('[collect:dbg] pushClipImage sig=' + sig + ' last=' + lastImageSig + ' dt=' + (now - lastImageAt))
  if (sig === lastImageSig && now - lastImageAt < 800) {
    if (DEBUG) console.log('[collect:dbg] 去重跳过')
    return null
  }
  lastImageSig = sig
  lastImageAt = now

  ensureDirs()
  const id = uid('ci')
  const file = path.join(dirs().clipImages, `${id}.png`)
  try {
    fs.writeFileSync(file, img.toPNG())
  } catch (e) {
    console.error('[collect] 写剪贴板图片失败', e && e.message)
    return null
  }
  const item = { id, kind: 'image', file, w: size.width, h: size.height, at: Date.now(), starred: false }
  clipImages.unshift(item)
  if (clipImages.length > RECENT_IMAGES_MAX) {
    const dropped = clipImages.splice(RECENT_IMAGES_MAX)
    for (const d of dropped) {
      try {
        fs.unlinkSync(d.file)
      } catch {
        /* ignore */
      }
    }
  }
  saveSoon()
  return item
}

// 真正读一次剪贴板：图片优先，其次文本。返回新条目（或 null）
export function readClipboardNow() {
  if (!clipOn()) return null
  // 1) 图片
  try {
    const img = clipboard.readImage()
    if (DEBUG) console.log('[collect:dbg] readImage empty=' + img.isEmpty() + ' selfImage=' + isSelfImage() + ' clipOn=' + clipOn())
    if (img && !img.isEmpty()) {
      if (isSelfImage()) {
        if (DEBUG) console.log('[collect:dbg] 图片事件来自自己写入，忽略')
        return null
      }
      return pushClipImage(img)
    }
  } catch {
    /* ignore */
  }
  // 2) 文本
  let text = ''
  try {
    text = clipboard.readText()
  } catch {
    return null
  }
  if (!text) return null
  if (isSelfText(text)) {
    if (DEBUG) console.log('[collect:dbg] 文本事件来自自己写入，忽略', JSON.stringify(text))
    return null
  }
  if (text === clipLastText) return null
  if (DEBUG) console.log('[collect:dbg] 收下文本', JSON.stringify(text), 'selfUntil 剩', selfUntil - Date.now(), 'ms')
  clipLastText = text
  return pushClipText(text)
}

// ---------------------------------------------------------------- 原生剪贴板事件（koffi）

// 方案第 10-12 条：不再 700ms 轮询，改成 AddClipboardFormatListener + WM_CLIPBOARDUPDATE，
// 收到事件后再 debounce 几十毫秒才读（防止部分软件分阶段写剪贴板读到半截）。
//
// 为什么能收到消息：Electron 主进程的 UI 线程本来就有 Win32 消息泵，我们在同一个线程上
// 创建一个 message-only 窗口并注册自己的 WndProc，泵会把消息 Dispatch 过来。
// 拿不到 koffi / 注册失败时自动退回低频轮询，功能不受影响。
const WM_CLIPBOARDUPDATE = 0x031d
const HWND_MESSAGE = -3
const CLIP_DEBOUNCE_MS = 60
const CLIP_FALLBACK_MS = 1000

let pollTimer = null
let debounceTimer = null
let nativeHandle = null
let nativeOk = false

function scheduleRead(reason) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const item = readClipboardNow()
    if (item) {
      broadcast()
      if (DEBUG) console.log('[collect:dbg] 发送 clipboard:new', item.kind, item.id, 'winRef=' + !!winRef)
      if (winRef && !winRef.isDestroyed()) {
        try {
          winRef.webContents.send('clipboard:new', item)
        } catch {
          /* ignore */
        }
      }
    }
  }, CLIP_DEBOUNCE_MS)
}

function startNativeWatch() {
  let koffi = null
  try {
    koffi = require('koffi')
  } catch (e) {
    console.warn('[collect] koffi 不可用，剪贴板退回低频轮询：', e && e.message)
    return false
  }
  try {
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')

    const WNDPROC = koffi.proto('intptr_t WndProc(void *hWnd, uint32_t msg, uintptr_t wParam, intptr_t lParam)')
    const WNDCLASSEX = koffi.struct('WNDCLASSEX', {
      cbSize: 'uint32_t',
      style: 'uint32_t',
      lpfnWndProc: koffi.pointer(WNDPROC),
      cbClsExtra: 'int32_t',
      cbWndExtra: 'int32_t',
      hInstance: 'void *',
      hIcon: 'void *',
      hCursor: 'void *',
      hbrBackground: 'void *',
      lpszMenuName: 'str16',
      lpszClassName: 'str16',
      hIconSm: 'void *',
    })

    const DefWindowProcW = user32.func('intptr_t DefWindowProcW(void *hWnd, uint32_t msg, uintptr_t wParam, intptr_t lParam)')
    const RegisterClassExW = user32.func('uint16_t RegisterClassExW(WNDCLASSEX *lpwcx)')
    const CreateWindowExW = user32.func(
      'void *CreateWindowExW(uint32_t dwExStyle, str16 lpClassName, str16 lpWindowName, uint32_t dwStyle, int32_t X, int32_t Y, int32_t nWidth, int32_t nHeight, void *hWndParent, void *hMenu, void *hInstance, void *lpParam)'
    )
    const AddClipboardFormatListener = user32.func('bool AddClipboardFormatListener(void *hwnd)')
    const RemoveClipboardFormatListener = user32.func('bool RemoveClipboardFormatListener(void *hwnd)')
    const DestroyWindow = user32.func('bool DestroyWindow(void *hwnd)')
    const GetModuleHandleW = kernel32.func('void *GetModuleHandleW(str16 lpModuleName)')

    const wndProcCb = (hWnd, msg, wParam, lParam) => {
      if (msg === WM_CLIPBOARDUPDATE) {
        scheduleRead('event')
        return 0
      }
      return DefWindowProcW(hWnd, msg, wParam, lParam)
    }
    const wndProcPtr = koffi.register(wndProcCb, koffi.pointer(WNDPROC))

    const className = `DshClipListener_${process.pid}`
    const wc = {
      cbSize: koffi.sizeof(WNDCLASSEX),
      style: 0,
      lpfnWndProc: wndProcPtr,
      cbClsExtra: 0,
      cbWndExtra: 0,
      hInstance: GetModuleHandleW(null),
      hIcon: null,
      hCursor: null,
      hbrBackground: null,
      lpszMenuName: null,
      lpszClassName: className,
      hIconSm: null,
    }
    if (!RegisterClassExW(wc)) {
      // 已经注册过（热重载）也算成功
      console.warn('[collect] RegisterClassExW 失败（可能已注册），继续尝试建窗口')
    }
    const hwnd = CreateWindowExW(0, className, className, 0, 0, 0, 0, 0, HWND_MESSAGE, null, null, null)
    if (!hwnd) {
      console.warn('[collect] 创建消息窗口失败，退回轮询')
      koffi.unregister(wndProcPtr)
      return false
    }
    if (!AddClipboardFormatListener(hwnd)) {
      console.warn('[collect] AddClipboardFormatListener 失败，退回轮询')
      DestroyWindow(hwnd)
      koffi.unregister(wndProcPtr)
      return false
    }
    nativeHandle = { koffi, hwnd, wndProcPtr, RemoveClipboardFormatListener, DestroyWindow }
    console.log('[collect] 剪贴板使用原生事件监听（WM_CLIPBOARDUPDATE）')
    return true
  } catch (e) {
    console.warn('[collect] 原生剪贴板监听初始化失败，退回轮询：', e && e.message)
    return false
  }
}

function startFallbackPoll() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    const item = readClipboardNow()
    if (item) {
      broadcast()
      if (winRef && !winRef.isDestroyed()) {
        try {
          winRef.webContents.send('clipboard:new', item)
        } catch {
          /* ignore */
        }
      }
    }
  }, CLIP_FALLBACK_MS)
}

export function startClipboardWatch() {
  if (!clipOn()) return
  // 原始探测一次：把启动前就在剪贴板里的内容也收进来
  readClipboardNow()
  nativeOk = startNativeWatch()
  if (!nativeOk) startFallbackPoll()
}

export function stopClipboardWatch() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (nativeHandle) {
    try {
      nativeHandle.RemoveClipboardFormatListener(nativeHandle.hwnd)
      nativeHandle.DestroyWindow(nativeHandle.hwnd)
      nativeHandle.koffi.unregister(nativeHandle.wndProcPtr)
    } catch {
      /* ignore */
    }
    nativeHandle = null
  }
  nativeOk = false
}

// 设置面板改了开关/上限
export function reconfigureClipboard() {
  if (!clipOn()) {
    stopClipboardWatch()
    return
  }
  if (!nativeHandle && !pollTimer) startClipboardWatch()
  if (clipItems.length > clipMax()) {
    clipItems.length = clipMax()
    saveSoon()
  }
}

export function clipboardMode() {
  return nativeOk ? 'native' : pollTimer ? 'poll' : 'off'
}

// ---------------------------------------------------------------- 常用语

export function phraseAdd({ text, category }) {
  const t = String(text || '').trim()
  if (!t) return null
  const now = Date.now()
  const p = {
    id: uid('p'),
    text: t,
    category: String(category || '').trim(),
    favorite: false,
    useCount: 0,
    lastUsedAt: 0,
    createdAt: now,
    updatedAt: now,
  }
  phrases.unshift(p)
  flush()
  broadcast()
  return p
}

export function phraseUpdate(id, patch) {
  const p = phrases.find((x) => x.id === id)
  if (!p) return null
  if (patch && typeof patch.text === 'string' && patch.text.trim()) p.text = patch.text.trim()
  if (patch && typeof patch.category === 'string') p.category = patch.category.trim()
  if (patch && typeof patch.favorite === 'boolean') p.favorite = patch.favorite
  p.updatedAt = Date.now()
  flush()
  broadcast()
  return p
}

export function phraseRemove(id) {
  const i = phrases.findIndex((x) => x.id === id)
  if (i === -1) return false
  phrases.splice(i, 1)
  flush()
  broadcast()
  return true
}

export function phraseUse(id) {
  const p = phrases.find((x) => x.id === id)
  if (!p) return false
  writeClipboardText(p.text)
  p.useCount = (Number(p.useCount) || 0) + 1
  p.lastUsedAt = Date.now()
  saveSoon()
  broadcast()
  return true
}

// ---------------------------------------------------------------- 常用图片

function makeThumb(srcFile, id) {
  try {
    const img = nativeImage.createFromPath(srcFile)
    if (img.isEmpty()) return null
    const size = img.getSize()
    const scale = size.width > THUMB_WIDTH ? THUMB_WIDTH / size.width : 1
    const thumb = scale < 1 ? img.resize({ width: Math.max(1, Math.round(size.width * scale)) }) : img
    const out = path.join(dirs().thumbs, `${id}.jpg`)
    fs.writeFileSync(out, thumb.toJPEG(82))
    return { file: out, w: size.width, h: size.height }
  } catch (e) {
    console.error('[collect] 生成缩略图失败', e && e.message)
    return null
  }
}

// 从剪贴板里的图片收进常用图片（点 ☆ 时走这条）
export function imageAddFromClipImage(clipId) {
  const item = clipImages.find((x) => x.id === clipId)
  if (!item || !fs.existsSync(item.file)) return null
  if (item.starred) {
    // 已经收藏过：直接返回既有那条，不重复导入
    const exist = images.find((m) => m.name && m.fromClipId === clipId)
    if (exist) return exist
  }
  const d = new Date()
  const p2 = (n) => String(n).padStart(2, '0')
  // 手动拼时间：toLocaleString 的格式随系统变化，切片会切出「19:36:」这种尾巴
  const stamp = `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
  const made = imageImportOne(item.file, { name: `截图 ${stamp}` })
  if (made) {
    // 标记来源，并让面板把这张最近图片显示成已收藏（★）
    made.fromClipId = clipId
    item.starred = true
    writeImagesMeta()
    saveSoon()
    broadcast()
  }
  return made
}

// 从任意本地图片文件收进常用图片
export function imageImportOne(srcFile, opts = {}) {
  ensureDirs()
  const id = uid('img')
  const ext = (path.extname(srcFile) || '.png').toLowerCase()
  const dst = path.join(dirs().images, `${id}${ext}`)
  try {
    fs.copyFileSync(srcFile, dst)
  } catch (e) {
    console.error('[collect] 复制图片失败', e && e.message)
    return null
  }
  const thumb = makeThumb(dst, id)
  const st = (() => {
    try {
      return fs.statSync(dst)
    } catch {
      return null
    }
  })()
  const now = Date.now()
  const m = {
    id,
    name: String(opts.name || path.basename(srcFile, ext) || id),
    category: String(opts.category || ''),
    favorite: !!opts.favorite,
    useCount: 0,
    lastUsedAt: 0,
    createdAt: now,
    updatedAt: now,
    ext: ext.slice(1),
    bytes: st ? st.size : 0,
    w: thumb ? thumb.w : 0,
    h: thumb ? thumb.h : 0,
  }
  images.unshift(m)
  writeImagesMeta()
  broadcast()
  return m
}

export async function imagePickAndImport() {
  const r = await dialog.showOpenDialog({
    title: '选择图片',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  })
  if (r.canceled || !r.filePaths.length) return { ok: false, error: 'CANCELLED' }
  const added = []
  for (const f of r.filePaths) {
    const m = imageImportOne(f)
    if (m) added.push(m)
  }
  return { ok: true, added }
}

export function imageUpdate(id, patch) {
  const m = images.find((x) => x.id === id)
  if (!m) return null
  if (patch && typeof patch.name === 'string' && patch.name.trim()) m.name = patch.name.trim()
  if (patch && typeof patch.category === 'string') m.category = patch.category.trim()
  if (patch && typeof patch.favorite === 'boolean') m.favorite = patch.favorite
  m.updatedAt = Date.now()
  writeImagesMeta()
  broadcast()
  return m
}

export function imageRemove(id) {
  const i = images.findIndex((x) => x.id === id)
  if (i === -1) return false
  const m = images[i]
  for (const f of [m.file, m.thumb]) {
    if (f) {
      try {
        fs.unlinkSync(f)
      } catch {
        /* ignore */
      }
    }
  }
  images.splice(i, 1)
  writeImagesMeta()
  broadcast()
  return true
}

export function imageUse(id) {
  const m = images.find((x) => x.id === id)
  if (!m) return false
  const file = path.join(dirs().images, `${m.id}.${m.ext || 'png'}`)
  if (!fs.existsSync(file)) return false
  const img = nativeImage.createFromPath(file)
  if (img.isEmpty()) return false
  markSelfImage()
  clipboard.writeImage(img)
  m.useCount = (Number(m.useCount) || 0) + 1
  m.lastUsedAt = Date.now()
  saveSoon()
  writeImagesMeta()
  broadcast()
  return true
}

function imageFile(m) {
  return path.join(dirs().images, `${m.id}.${m.ext || 'png'}`)
}
function imageThumbFile(m) {
  return path.join(dirs().thumbs, `${m.id}.jpg`)
}

// ---------------------------------------------------------------- 协议 + IPC

export function registerCollectProtocol() {
  protocol.handle('collect', async (req) => {
    try {
      const u = new URL(req.url)
      const id = (u.pathname || '').replace(/^\/+/, '')
      const kind = u.hostname // thumb / full / clip
      let file = ''
      if (kind === 'thumb') {
        const m = images.find((x) => x.id === id)
        if (!m) return new Response('not found', { status: 404 })
        file = imageThumbFile(m)
        if (!fs.existsSync(file)) file = imageFile(m)
      } else if (kind === 'full') {
        const m = images.find((x) => x.id === id)
        if (!m) return new Response('not found', { status: 404 })
        file = imageFile(m)
      } else if (kind === 'clip') {
        const c = clipImages.find((x) => x.id === id)
        if (!c) return new Response('not found', { status: 404 })
        file = c.file
      } else {
        return new Response('bad request', { status: 400 })
      }
      if (!file || !fs.existsSync(file)) return new Response('not found', { status: 404 })
      return net.fetch(pathToFileURL(file).toString())
    } catch (e) {
      return new Response('error ' + (e && e.message), { status: 500 })
    }
  })
}

export function registerCollectIpc() {
  ipcMain.handle('collect:get', () => snapshot())

  // ---- 剪贴板历史（临时）----
  ipcMain.handle('collect:clip-copy', (_e, payload) => {
    try {
      if (payload && payload.kind === 'image') {
        const item = clipImages.find((x) => x.id === payload.id)
        if (!item) return false
        const img = nativeImage.createFromPath(item.file)
        if (img.isEmpty()) return false
        markSelfImage()
        clipboard.writeImage(img)
        return true
      }
      writeClipboardText(String((payload && payload.text) || ''))
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle('collect:clip-star-image', (_e, id) => {
    const m = imageAddFromClipImage(String(id || ''))
    return m || false
  })
  ipcMain.handle('collect:clip-remove', (_e, payload) => {
    const id = String((payload && payload.id) || '')
    if (payload && payload.kind === 'image') {
      const i = clipImages.findIndex((x) => x.id === id)
      if (i === -1) return false
      try {
        fs.unlinkSync(clipImages[i].file)
      } catch {
        /* ignore */
      }
      clipImages.splice(i, 1)
    } else {
      const i = clipItems.findIndex((x) => x.id === id)
      if (i === -1) return false
      clipItems.splice(i, 1)
    }
    flush()
    broadcast()
    return true
  })
  ipcMain.handle('collect:clip-clear', () => {
    clipItems = []
    for (const it of clipImages) {
      try {
        fs.unlinkSync(it.file)
      } catch {
        /* ignore */
      }
    }
    clipImages = []
    flush()
    broadcast()
    return true
  })
  ipcMain.handle('collect:clip-open', async (_e, url) => {
    const u = String(url || '')
    if (!/^https?:\/\//i.test(u)) return false // 方案第 15 条
    try {
      await shell.openExternal(u)
      return true
    } catch {
      return false
    }
  })

  // ---- 常用语 ----
  ipcMain.handle('collect:phrase-add', (_e, payload) => phraseAdd(payload || {}))
  ipcMain.handle('collect:phrase-update', (_e, id, patch) => phraseUpdate(String(id || ''), patch || {}))
  ipcMain.handle('collect:phrase-remove', (_e, id) => phraseRemove(String(id || '')))
  ipcMain.handle('collect:phrase-use', (_e, id) => phraseUse(String(id || '')))

  // ---- 常用图片 ----
  ipcMain.handle('collect:image-use', (_e, id) => imageUse(String(id || '')))
  ipcMain.handle('collect:image-update', (_e, id, patch) => imageUpdate(String(id || ''), patch || {}))
  ipcMain.handle('collect:image-remove', (_e, id) => imageRemove(String(id || '')))
  ipcMain.handle('collect:image-pick', () => imagePickAndImport())
  ipcMain.handle('collect:image-import', (_e, paths) => {
    const list = Array.isArray(paths) ? paths : []
    const added = []
    for (const p of list) {
      if (p && fs.existsSync(p)) {
        const m = imageImportOne(p)
        if (m) added.push(m)
      }
    }
    return { ok: true, added }
  })
  ipcMain.handle('collect:reveal', (_e, p) => {
    try {
      shell.showItemInFolder(String(p || ''))
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle('collect:image-file', (_e, id) => {
    const m = images.find((x) => x.id === id)
    return m ? imageFile(m) : ''
  })
  ipcMain.handle('collect:open-dir', async () => {
    ensureDirs()
    try {
      await shell.openPath(dataDir())
      return true
    } catch {
      return false
    }
  })
}

export function disposeCollect() {
  stopClipboardWatch()
  flush()
}
