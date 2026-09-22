// 「材料箱」主进程模块
//
// 核心产品逻辑（见需求第七、二十节）：
//   · 只保存「路径 + 元数据」，绝不移动 / 删除 / 修改原文件，也绝不读取文件内容
//   · 所有真实文件操作（存在性检查、复制、打包、打开位置）都在主进程完成
//   · 打包走流式（见 zip.js），内存峰值与文件大小无关
//   · 数据落在 userData/material-box.json，不用 localStorage
//
// 注意：本文件用 ESM 语法。Electron 入口 main.js 以 import 引用它，
// Rollup 才会把它打进 dist-electron/main.js；若用 require('./materialbox')，
// 会变成运行期调用，打包后文件不存在。

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { app, dialog, shell, Menu, screen } from 'electron'
import { createZip } from './zip.js'
import * as settings from './settings.js'

const MAX_FILES_PER_TASK = 200
const MAX_NAME_LEN = 120
const MAX_TASKS = 50

let win = null
let state = { tasks: [], activeTaskId: null }
let saveTimer = null
let zipJob = null // { cancelled: boolean }

// ---------- 持久化 ----------
function storePath() {
  return path.join(app.getPath('userData'), 'material-box.json')
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    if (!raw || !Array.isArray(raw.tasks)) throw new Error('bad shape')
    state.tasks = raw.tasks
      .filter((t) => t && typeof t.name === 'string')
      .slice(0, MAX_TASKS)
      .map((t) => ({
        id: String(t.id || uid('task')),
        name: String(t.name).slice(0, MAX_NAME_LEN),
        createdAt: Number(t.createdAt) || Date.now(),
        updatedAt: Number(t.updatedAt) || Date.now(),
        required: Array.isArray(t.required)
          ? t.required
              .filter((r) => r && typeof r.name === 'string')
              .map((r) => ({
                id: String(r.id || uid('req')),
                name: String(r.name).slice(0, MAX_NAME_LEN),
                fileId: typeof r.fileId === 'string' ? r.fileId : null,
              }))
          : [],
        files: Array.isArray(t.files)
          ? t.files
              .filter((f) => f && typeof f.path === 'string')
              .slice(0, MAX_FILES_PER_TASK)
              .map((f) => ({
                id: String(f.id || uid('f')),
                name: String(f.name || path.basename(f.path)),
                path: f.path,
                size: Number(f.size) || 0,
                ext: String(f.ext || path.extname(f.path).slice(1)).toLowerCase(),
                addedAt: Number(f.addedAt) || Date.now(),
                missing: !!f.missing,
              }))
          : [],
      }))
    state.activeTaskId = state.tasks.some((t) => t.id === raw.activeTaskId)
      ? raw.activeTaskId
      : state.tasks[0]?.id || null
  } catch {
    state = { tasks: [], activeTaskId: null }
  }
}

function writeNow() {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(state))
  } catch (err) {
    console.error('保存材料箱失败：', err)
  }
}

// 写盘做 300ms 防抖，避免拖入一批文件时反复落盘
function save() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    writeNow()
  }, 300)
}

// 退出前强制落盘：否则最后 300ms 内的改动会随进程一起消失
function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  writeNow()
}

function push() {
  if (win && !win.isDestroyed()) win.webContents.send('mbox:changed', snapshot())
}

// ---------- 视图 ----------
function snapshot() {
  return {
    tasks: state.tasks.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      required: t.required.map((r) => ({ id: r.id, name: r.name, fileId: r.fileId })),
      files: t.files.map((f) => ({ ...f })),
      collected: t.required.filter((r) => r.fileId).length,
      requiredCount: t.required.length,
      totalSize: t.files.reduce((s, f) => s + (f.size || 0), 0),
      missingCount: t.files.filter((f) => f.missing).length,
    })),
    activeTaskId: state.activeTaskId,
    limits: { maxFiles: MAX_FILES_PER_TASK, maxNameLen: MAX_NAME_LEN },
  }
}

function activeTask() {
  return state.tasks.find((t) => t.id === state.activeTaskId) || null
}

// ---------- 任务 ----------
function createTask(name, requiredNames = []) {
  const n = String(name || '').trim().slice(0, MAX_NAME_LEN)
  if (!n) return { ok: false, error: 'EMPTY_NAME' }
  if (state.tasks.length >= MAX_TASKS) return { ok: false, error: 'TOO_MANY_TASKS' }
  const task = {
    id: uid('task'),
    name: n,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    required: (Array.isArray(requiredNames) ? requiredNames : [])
      .map((x) => String(x || '').trim().slice(0, MAX_NAME_LEN))
      .filter(Boolean)
      .slice(0, 30)
      .map((rn) => ({ id: uid('req'), name: rn, fileId: null })),
    files: [],
  }
  state.tasks.unshift(task)
  state.activeTaskId = task.id
  save()
  push()
  return { ok: true, state: snapshot() }
}

function removeTask(id) {
  const i = state.tasks.findIndex((t) => t.id === id)
  if (i === -1) return { ok: false, error: 'NOT_FOUND' }
  state.tasks.splice(i, 1)
  if (state.activeTaskId === id) state.activeTaskId = state.tasks[0]?.id || null
  save()
  push()
  return { ok: true, state: snapshot() }
}

function setActiveTask(id) {
  if (!state.tasks.some((t) => t.id === id)) return { ok: false, error: 'NOT_FOUND' }
  state.activeTaskId = id
  save()
  push()
  return { ok: true, state: snapshot() }
}

function clearTask(id) {
  const t = state.tasks.find((x) => x.id === id)
  if (!t) return { ok: false, error: 'NOT_FOUND' }
  t.files = []
  t.required.forEach((r) => {
    r.fileId = null
  })
  t.updatedAt = Date.now()
  save()
  push()
  return { ok: true, state: snapshot() }
}

// ---------- 文件 ----------
function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,8}$/, '')
    .replace(/[\s_\-()（）【】[\]]/g, '')
}

// 把文件挂到清单项上：名字互相包含即视为匹配（归一化后比较）
function matchRequired(task, fileName) {
  const key = normKey(fileName)
  if (!key) return null
  return (
    task.required.find((r) => {
      if (r.fileId) return false
      const rk = normKey(r.name)
      return rk && (key.includes(rk) || rk.includes(key))
    }) || null
  )
}

function collectPaths(paths) {
  const t = activeTask()
  if (!t) return { ok: false, error: 'NO_TASK' }

  const added = []
  const skipped = []
  const seen = new Set(t.files.map((f) => f.path.toLowerCase()))

  for (const raw of paths) {
    const p = String(raw || '')
    if (!p) continue
    let st
    try {
      st = fs.statSync(p)
    } catch {
      skipped.push({ name: path.basename(p), path: p, reason: 'NOT_FOUND' })
      continue
    }
    if (!st.isFile()) {
      skipped.push({ name: path.basename(p), path: p, reason: 'NOT_A_FILE' })
      continue
    }
    if (seen.has(p.toLowerCase())) {
      skipped.push({ name: path.basename(p), path: p, reason: 'DUPLICATE' })
      continue
    }
    if (t.files.length >= MAX_FILES_PER_TASK) {
      skipped.push({ name: path.basename(p), path: p, reason: 'LIMIT' })
      continue
    }
    const name = path.basename(p).slice(0, MAX_NAME_LEN)
    const f = {
      id: uid('f'),
      name,
      path: p,
      size: st.size,
      ext: path.extname(p).slice(1).toLowerCase(),
      addedAt: Date.now(),
      missing: false,
    }
    t.files.push(f)
    seen.add(p.toLowerCase())
    added.push(f)
    const slot = matchRequired(t, name)
    if (slot) slot.fileId = f.id
  }

  if (added.length) {
    t.updatedAt = Date.now()
    save()
    push()
  }
  return { ok: true, added, skipped, state: snapshot() }
}

function removeFile(taskId, fileId) {
  const t = state.tasks.find((x) => x.id === taskId)
  if (!t) return { ok: false, error: 'NOT_FOUND' }
  const i = t.files.findIndex((f) => f.id === fileId)
  if (i === -1) return { ok: false, error: 'NOT_FOUND' }
  t.files.splice(i, 1)
  t.required.forEach((r) => {
    if (r.fileId === fileId) r.fileId = null
  })
  t.updatedAt = Date.now()
  save()
  push()
  return { ok: true, state: snapshot() }
}

// 重新校验所有路径（移动 / 删除 / 拔盘后调用）
async function revalidate() {
  let changed = false
  for (const t of state.tasks) {
    for (const f of t.files) {
      let exists = false
      try {
        const st = await fsp.stat(f.path)
        exists = st.isFile()
      } catch {
        exists = false
      }
      const missing = !exists
      if (f.missing !== missing) {
        f.missing = missing
        changed = true
      }
    }
  }
  if (changed) {
    save()
    push()
  }
  return { ok: true, state: snapshot() }
}

// 重新定位：弹文件选择框，把失效条目指向新位置（不静默失败）
async function relocate(taskId, fileId) {
  const t = state.tasks.find((x) => x.id === taskId)
  if (!t) return { ok: false, error: 'NOT_FOUND' }
  const f = t.files.find((x) => x.id === fileId)
  if (!f) return { ok: false, error: 'NOT_FOUND' }

  const r = await dialog.showOpenDialog(win, {
    title: `重新定位「${f.name}」`,
    properties: ['openFile'],
  })
  if (r.canceled || !r.filePaths.length) return { ok: false, error: 'CANCELLED' }

  const newPath = r.filePaths[0]
  let st
  try {
    st = await fsp.stat(newPath)
    if (!st.isFile()) return { ok: false, error: 'NOT_A_FILE' }
  } catch {
    return { ok: false, error: 'NOT_FOUND' }
  }

  f.path = newPath
  f.name = path.basename(newPath).slice(0, MAX_NAME_LEN)
  f.size = st.size
  f.ext = path.extname(newPath).slice(1).toLowerCase()
  f.missing = false
  t.updatedAt = Date.now()
  save()
  push()
  return { ok: true, state: snapshot() }
}

// ---------- 系统对话框 ----------
async function pickFiles() {
  const r = await dialog.showOpenDialog(win, {
    title: '选择要放入材料箱的文件',
    properties: ['openFile', 'multiSelections'],
  })
  if (r.canceled || !r.filePaths.length) {
    return { ok: true, added: [], skipped: [], state: snapshot() }
  }
  return collectPaths(r.filePaths)
}

async function pickFolder(title = '选择目标文件夹') {
  const r = await dialog.showOpenDialog(win, {
    title,
    properties: ['openDirectory', 'createDirectory'],
  })
  if (r.canceled || !r.filePaths.length) return { ok: false, error: 'CANCELLED' }
  return { ok: true, dir: r.filePaths[0] }
}

function revealFile(p) {
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'NOT_FOUND' }
  shell.showItemInFolder(p)
  return { ok: true }
}

function revealPath(p) {
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'NOT_FOUND' }
  shell.openPath(p)
  return { ok: true }
}

// ---------- 输出目录候选 ----------
function defaultDirs(task) {
  const out = []
  const first = task?.files.find((f) => !f.missing)
  if (first) out.push({ id: 'first', label: '第一个文件所在目录', dir: path.dirname(first.path) })
  try {
    out.push({ id: 'desktop', label: '桌面', dir: app.getPath('desktop') })
  } catch {
    /* ignore */
  }
  try {
    out.push({ id: 'downloads', label: '下载', dir: app.getPath('downloads') })
  } catch {
    /* ignore */
  }
  return out
}

// 不覆盖已有文件：冲突时追加 (1) (2) …
function uniquePath(dir, baseName) {
  const ext = path.extname(baseName)
  const stem = path.basename(baseName, ext)
  let candidate = path.join(dir, baseName)
  let i = 0
  while (fs.existsSync(candidate)) {
    i++
    candidate = path.join(dir, `${stem} (${i})${ext}`)
    if (i > 999) break
  }
  return candidate
}

// 按「材料箱设置 → 同名文件」解析最终路径。
//   rename = 直接自动追加 (1)（默认，静默不打扰）
//   ask    = 冲突时弹一次询问，可覆盖 / 自动重命名 / 取消
// 返回 null 表示用户取消。
function resolveConflict(dir, baseName) {
  const direct = path.join(dir, baseName)
  if (!fs.existsSync(direct)) return direct
  if (settings.load().mboxSameName !== 'ask') return uniquePath(dir, baseName)
  const r = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: ['覆盖', '自动重命名', '取消'],
    defaultId: 1,
    cancelId: 2,
    message: `目标位置已有「${baseName}」`,
    detail: dir,
  })
  if (r === 0) return direct
  if (r === 1) return uniquePath(dir, baseName)
  return null
}

// 按「材料箱设置 → 默认保存位置」挑一个默认目录
function preferredDir(task) {
  const first = task?.files.find((f) => !f.missing)
  const mode = settings.load().mboxSaveDir
  const pick = (id) => {
    if (id === 'first') return first ? path.dirname(first.path) : null
    try {
      return app.getPath(id === 'desktop' ? 'desktop' : 'downloads')
    } catch {
      return null
    }
  }
  const order =
    mode === 'desktop'
      ? ['desktop', 'downloads', 'first']
      : mode === 'downloads'
        ? ['downloads', 'desktop', 'first']
        : ['first', 'desktop', 'downloads']
  for (const id of order) {
    const d = pick(id)
    if (d && fs.existsSync(d)) return d
  }
  return null
}

function safeFileName(s) {
  return (
    String(s || '材料')
      .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
      .replace(/^\.+/, '')
      .trim()
      .slice(0, 80) || '材料'
  )
}

// ---------- 打包 ----------
function zipProgress(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('mbox:zip-progress', payload)
}

async function exportZip({ taskId, name, dir }) {
  if (zipJob) return { ok: false, error: 'BUSY' }
  const t = state.tasks.find((x) => x.id === taskId)
  if (!t) return { ok: false, error: 'NOT_FOUND' }

  // 打包前先确认文件都还在（需求第十八节）
  await revalidate()
  const files = t.files.filter((f) => !f.missing)
  if (!files.length) return { ok: false, error: 'NO_FILES' }

  const targetDir =
    (dir && fs.existsSync(dir) && dir) || preferredDir(t) || path.dirname(files[0].path)
  const zipName = `${safeFileName(name || t.name)}.zip`
  const outPath = resolveConflict(targetDir, zipName)
  if (!outPath) return { ok: false, error: 'CANCELLED' }

  zipJob = { cancelled: false }
  zipProgress({ phase: 'start', outPath, totalFiles: files.length })
  try {
    const r = await createZip({
      files: files.map((f) => ({ absPath: f.path, name: f.name, size: f.size })),
      outPath,
      onProgress: (p) => zipProgress({ phase: 'progress', ...p }),
      isCancelled: () => zipJob.cancelled,
    })
    zipProgress({ phase: 'done', outPath: r.outPath, fileCount: r.fileCount, zipBytes: r.zipBytes })
    // 「打包完成后打开文件夹」
    if (settings.load().mboxOpenAfterZip) {
      try {
        shell.showItemInFolder(r.outPath)
      } catch {
        /* 打开失败不影响打包结果 */
      }
    }
    return { ok: true, ...r }
  } catch (err) {
    const cancelled = err && err.code === 'CANCELLED'
    zipProgress({ phase: cancelled ? 'cancelled' : 'error', message: err?.message || String(err) })
    return { ok: false, error: cancelled ? 'CANCELLED' : 'ZIP_FAILED', message: err?.message }
  } finally {
    zipJob = null
  }
}

function cancelZip() {
  if (zipJob) zipJob.cancelled = true
  return { ok: true }
}

// ---------- 复制到文件夹 ----------
async function copyToFolder({ taskId, dir }) {
  const t = state.tasks.find((x) => x.id === taskId)
  if (!t) return { ok: false, error: 'NOT_FOUND' }
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'BAD_DIR' }

  await revalidate()
  const files = t.files.filter((f) => !f.missing)
  if (!files.length) return { ok: false, error: 'NO_FILES' }

  const copied = []
  const failed = []

  // 同名文件策略：rename 静默追加 (1)；ask 先统计冲突，整批只弹一次
  const conflicts = files.filter((f) => fs.existsSync(path.join(dir, f.name)))
  let overwrite = false
  if (conflicts.length && settings.load().mboxSameName === 'ask') {
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['全部覆盖', '自动重命名', '取消'],
      defaultId: 1,
      cancelId: 2,
      message: `目标文件夹已有 ${conflicts.length} 个同名文件`,
      detail: dir,
    })
    if (r === 2) return { ok: false, error: 'CANCELLED' }
    overwrite = r === 0
  }

  for (const f of files) {
    try {
      // copyFile 由系统搬运，不会把内容读进 Node 内存
      const direct = path.join(dir, f.name)
      const dest = overwrite && fs.existsSync(direct) ? direct : uniquePath(dir, f.name)
      await fsp.copyFile(f.path, dest)
      copied.push({ name: f.name, dest })
      if (win && !win.isDestroyed()) {
        win.webContents.send('mbox:copy-progress', {
          done: copied.length,
          total: files.length,
          current: f.name,
        })
      }
    } catch (err) {
      failed.push({ name: f.name, message: err?.message || String(err) })
    }
  }
  return { ok: true, copied, failed, dir }
}

// ---------- 右键菜单 ----------
// 两条通道分开：请求弹菜单走 'mbox:menu'（渲染 → 主），
// 菜单动作回传走 'mbox:menu-action'（主 → 渲染）
// 原生菜单被点过具体项 → 说明用户是在操作岛，关闭后不该顺手把岛收起来
let menuActionTaken = false

function markMenuActions(template) {
  return template.map((item) =>
    typeof item.click === 'function'
      ? {
          ...item,
          click: (...args) => {
            menuActionTaken = true
            return item.click(...args)
          },
        }
      : item
  )
}

function popupMenu(taskId) {
  if (!win) return
  menuActionTaken = false
  const t = state.tasks.find((x) => x.id === taskId) || activeTask()
  const hasFiles = !!t && t.files.length > 0
  const send = (payload) => win.webContents.send('mbox:menu-action', payload)
  const menu = Menu.buildFromTemplate(
    markMenuActions([
      { label: '打开材料箱', click: () => send({ action: 'open' }) },
      { type: 'separator' },
      { label: '整理到文件夹', enabled: hasFiles, click: () => send({ action: 'organize', taskId: t?.id }) },
      { label: '打包 ZIP', enabled: hasFiles, click: () => send({ action: 'zip', taskId: t?.id }) },
      { label: '打开所在位置', enabled: hasFiles, click: () => send({ action: 'reveal', taskId: t?.id }) },
      { type: 'separator' },
      { label: '新建任务', click: () => send({ action: 'new-task' }) },
      { label: '切换任务', enabled: state.tasks.length > 0, click: () => send({ action: 'switch-task' }) },
      { label: '清空材料箱', enabled: hasFiles, click: () => send({ action: 'clear', taskId: t?.id }) },
    ])
  )
  menu.popup({
    window: win,
    // 原生菜单关闭后回传光标位置，否则岛会卡在「悬停中」不再自动收起
    callback: () => {
      if (!win || win.isDestroyed()) return
      const keepOpen = menuActionTaken
      menuActionTaken = false
      try {
        const p = screen.getCursorScreenPoint()
        const b = win.getBounds()
        win.webContents.send('island:menu-closed', { x: p.x - b.x, y: p.y - b.y, keepOpen })
      } catch {
        win.webContents.send('island:menu-closed', { keepOpen })
      }
    },
  })
}

// ---------- 初始化 ----------
function init(mainWindow) {
  win = mainWindow
  load()
  // 启动时校验一次路径，让失效文件立刻显形
  revalidate().catch(() => {})
}

export {
  init,
  flush,
  snapshot,
  createTask,
  removeTask,
  setActiveTask,
  clearTask,
  collectPaths,
  removeFile,
  revalidate,
  relocate,
  pickFiles,
  pickFolder,
  revealFile,
  revealPath,
  defaultDirs,
  exportZip,
  cancelZip,
  copyToFolder,
  popupMenu,
}
