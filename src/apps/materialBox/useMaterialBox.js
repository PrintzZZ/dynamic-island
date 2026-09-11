import { computed, ref } from 'vue'
import {
  island,
  showNotice,
  dismissNotice,
  updateNotice,
  switchApp,
} from '../../composables/useIsland'
import { sfx } from '../../utils/sound'

// 材料箱状态：模块级单例
// 关键约束（见需求第二十节）：这里只保存「路径 + 文件名 + 大小 + 类型 + 状态」，
// 绝不把文件内容、Base64、Blob 或 Buffer 带进 Renderer。

const tasks = ref([])
const activeTaskId = ref(null)
const limits = ref({ maxFiles: 200, maxNameLen: 120 })

const adding = ref(null) // { total, done }  正在添加文件
const zip = ref(null) // { phase, bytes, totalBytes, doneFiles, totalFiles, current, outPath }
const copying = ref(null) // { done, total }
const toast = ref(null) // { kind: 'ok' | 'warn' | 'error', text }
// 右键菜单请求打开的面板，由 MaterialBoxApp 消费（'tasks' | 'new' | 'zip'）
const requestView = ref(null)

let toastTimer = null
let inited = false

const activeTask = computed(
  () => tasks.value.find((t) => t.id === activeTaskId.value) || null
)

// ---------- 进度百分比 ----------
const taskProgress = computed(() => {
  const t = activeTask.value
  if (!t) return { done: 0, total: 0, pct: 0 }
  if (t.requiredCount > 0) {
    return {
      done: t.collected,
      total: t.requiredCount,
      pct: Math.round((t.collected / t.requiredCount) * 100),
    }
  }
  // 没设清单时不显示分母，只统计已收集数量
  return { done: t.files.length, total: 0, pct: t.files.length ? 100 : 0 }
})

const isComplete = computed(() => {
  const t = activeTask.value
  if (!t) return false
  if (t.requiredCount > 0) return t.collected >= t.requiredCount && t.files.length > 0
  return t.files.length > 0
})

// ---------- 提示 ----------
function flash(kind, text, ms = 2600) {
  toast.value = { kind, text }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, ms)
}

function applyState(s) {
  if (!s) return
  tasks.value = Array.isArray(s.tasks) ? s.tasks : []
  activeTaskId.value = s.activeTaskId || null
  if (s.limits) limits.value = s.limits
}

async function refresh() {
  if (!window.api?.mboxGet) return
  applyState(await window.api.mboxGet())
}

// ---------- 文件加入 ----------
// 统一入口：paths 为 Windows 绝对路径数组
async function addPaths(paths) {
  const list = (paths || []).filter(Boolean)
  if (!list.length) return { added: 0, skipped: 0 }
  if (!activeTaskId.value) {
    flash('warn', '请先新建一个收集任务')
    return { added: 0, skipped: list.length }
  }
  adding.value = { total: list.length, done: 0 }
  // 大批量才值得显示「正在添加」，否则一闪而过反而像卡顿
  if (list.length >= 20) showAdding(list.length)
  try {
    const r = await window.api.mboxAddPaths(list)
    applyState(r?.state)
    const added = r?.added?.length || 0
    const skipped = r?.skipped || []
    if (added) {
      sfx.tick()
      showAdded(added)
      const dup = skipped.filter((s) => s.reason === 'DUPLICATE').length
      const other = skipped.length - dup
      if (other) flash('warn', `已添加 ${added} 个，${other} 个无法添加`)
      else if (dup) flash('ok', `已添加 ${added} 个（${dup} 个重复已跳过）`)
      else flash('ok', `已添加 ${added} 个文件`)
    } else if (skipped.length) {
      const reason = skipped[0].reason
      const text =
        reason === 'DUPLICATE'
          ? '这些文件已经在任务里了'
          : reason === 'LIMIT'
            ? `单个任务最多 ${limits.value.maxFiles} 个文件`
            : '文件不存在或不是文件'
      flash('warn', text)
    }
    return { added, skipped: skipped.length }
  } catch (err) {
    flash('error', `添加失败：${err?.message || err}`)
    return { added: 0, skipped: list.length }
  } finally {
    adding.value = null
  }
}

// 走系统文件选择框（拖拽不灵时的兜底入口）
async function pickFiles() {
  if (!activeTaskId.value) {
    flash('warn', '请先新建一个收集任务')
    return
  }
  adding.value = { total: 1, done: 0 }
  try {
    const r = await window.api.mboxPickFiles()
    applyState(r?.state)
    const added = r?.added?.length || 0
    if (added) {
      sfx.tick()
      flash('ok', `已添加 ${added} 个文件`)
    }
  } catch (err) {
    flash('error', `添加失败：${err?.message || err}`)
  } finally {
    adding.value = null
  }
}

// HTML5 拖拽 → 真实路径
function pathsFromDataTransfer(dt) {
  if (!dt) return []
  const out = []
  const files = dt.files
  for (let i = 0; i < files.length; i++) {
    const p = window.api?.mboxPathForFile ? window.api.mboxPathForFile(files[i]) : ''
    if (p) out.push(p)
  }
  return out
}

function dataTransferHasFiles(dt) {
  if (!dt) return false
  const t = dt.types
  if (!t) return false
  for (let i = 0; i < t.length; i++) if (t[i] === 'Files') return true
  return false
}

// ---------- 岛上的「接收态」与「添加中」 ----------
// 复用通知态槽位：variant 决定外观，sticky 表示不自动消失
function enterDropState(count) {
  showNotice(
    {
      variant: 'drop',
      sticky: true,
      icon: 'drop-in',
      accent: '#0A84FF',
      title: '放入材料箱',
      detail: count > 1 ? `添加到当前任务（${count} 个文件）` : '添加到当前任务',
    },
    0
  )
}

function leaveDropState() {
  if (island.notice && island.notice.variant === 'drop') dismissNotice()
}

// 只有紧凑态才需要在岛上弹状态；展开态应用自己会显示
function islandCompact() {
  return island.mode === 'compact' && !document.hidden
}

function showAdding(count) {
  if (!islandCompact()) return
  showNotice(
    {
      variant: 'progress',
      sticky: true,
      icon: 'box',
      accent: '#0A84FF',
      title: '材料箱',
      detail: `正在添加 ${count} 个文件…`,
      spinning: true,
    },
    0
  )
}

function showAdded(count) {
  if (!islandCompact()) return
  showNotice(
    {
      variant: 'progress',
      icon: 'check',
      accent: '#30D158',
      title: '材料箱',
      detail: `已添加 ${count} 个文件`,
    },
    3000
  )
}

function showZipProgress(p) {
  const pct = p.totalBytes > 0 ? Math.round((p.bytes / p.totalBytes) * 100) : 0
  const detail = `${p.doneFiles}/${p.totalFiles} 个文件`
  if (!updateNotice({ progress: pct, detail, spinning: pct < 100 })) {
    showNotice(
      {
        variant: 'progress',
        sticky: true,
        icon: 'package',
        accent: '#0A84FF',
        title: '正在打包',
        detail,
        progress: pct,
        spinning: true,
      },
      0
    )
  }
}

// ---------- 任务 ----------
async function createTask(name, required) {
  const r = await window.api.mboxCreateTask(name, required)
  if (!r?.ok) {
    const map = { EMPTY_NAME: '任务名不能为空', TOO_MANY_TASKS: '任务数量已达上限' }
    flash('warn', map[r?.error] || '创建失败')
    return false
  }
  applyState(r.state)
  sfx.tick()
  flash('ok', '任务已创建，把文件拖进来吧')
  return true
}

async function removeTask(id) {
  applyState((await window.api.mboxRemoveTask(id))?.state)
}

async function setActiveTask(id) {
  applyState((await window.api.mboxSetActiveTask(id))?.state)
}

async function clearTask(id) {
  applyState((await window.api.mboxClearTask(id))?.state)
  flash('ok', '已清空当前任务')
}

// ---------- 文件 ----------
async function removeFile(fileId) {
  const t = activeTask.value
  if (!t) return
  applyState((await window.api.mboxRemoveFile(t.id, fileId))?.state)
}

async function revalidate() {
  const r = await window.api.mboxRevalidate()
  applyState(r?.state)
  const miss = activeTask.value?.missingCount || 0
  if (miss) flash('warn', `有 ${miss} 个文件已失效`)
  return miss
}

async function relocate(fileId) {
  const t = activeTask.value
  if (!t) return
  const r = await window.api.mboxRelocate(t.id, fileId)
  if (r?.ok) {
    applyState(r.state)
    flash('ok', '已重新定位')
  } else if (r?.error && r.error !== 'CANCELLED') {
    flash('warn', r.error === 'NOT_A_FILE' ? '请选择一个文件（不是文件夹）' : '重新定位失败')
  }
}

async function revealFile(p) {
  const r = await window.api.mboxReveal(p)
  if (!r?.ok) flash('warn', '文件不存在，无法定位')
}

// ---------- 打包 / 复制 ----------
async function exportZip({ name, dir }) {
  const t = activeTask.value
  if (!t) return null
  const r = await window.api.mboxExportZip({ taskId: t.id, name, dir })
  if (!r?.ok) {
    if (r?.error === 'CANCELLED') flash('warn', '已取消打包')
    else if (r?.error === 'NO_FILES') flash('warn', '没有可打包的文件')
    else flash('error', `打包失败：${r?.message || r?.error || '未知错误'}`)
    return null
  }
  return r
}

async function cancelZip() {
  await window.api.mboxCancelZip()
}

async function copyToFolder(dir) {
  const t = activeTask.value
  if (!t) return null
  copying.value = { done: 0, total: t.files.length }
  try {
    const r = await window.api.mboxCopyToFolder({ taskId: t.id, dir })
    if (!r?.ok) {
      flash('warn', r?.error === 'NO_FILES' ? '没有可整理的文件' : '整理失败')
      return null
    }
    if (r.failed?.length) flash('warn', `已整理 ${r.copied.length} 个，${r.failed.length} 个失败`)
    else flash('ok', `已整理 ${r.copied.length} 个文件到「${shortPath(r.dir)}」`)
    return r
  } finally {
    copying.value = null
  }
}

function shortPath(p) {
  const parts = String(p || '').split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? p : `…\\${parts[parts.length - 1]}`
}

async function pickFolder(title) {
  return window.api.mboxPickFolder(title)
}

async function defaultDirs(taskId) {
  return (await window.api.mboxDefaultDirs(taskId)) || []
}

function openMenu(taskId) {
  window.api.mboxMenu(taskId)
}

// ---------- 右键菜单动作 ----------
function taskById(id) {
  return tasks.value.find((t) => t.id === (id || activeTaskId.value)) || null
}

// 需要界面的动作：先把岛切到材料箱应用，再让 App 消费 requestView
async function handleMenuAction(p) {
  if (!p || !p.action) return
  const t = taskById(p.taskId)

  if (p.action === 'open') return switchApp('material-box')
  if (p.action === 'new-task') {
    switchApp('material-box')
    requestView.value = 'new'
    return
  }
  if (p.action === 'switch-task') {
    switchApp('material-box')
    requestView.value = 'tasks'
    return
  }
  if (p.action === 'zip') {
    if (!t || !t.files.length) return flash('warn', '还没有可打包的材料')
    switchApp('material-box')
    requestView.value = 'zip'
    return
  }
  if (p.action === 'clear') {
    if (t) await clearTask(t.id)
    return
  }
  if (p.action === 'reveal') {
    const f = t?.files.find((x) => !x.missing)
    if (!f) return flash('warn', '没有可定位的文件')
    await revealFile(f.path)
    return
  }
  if (p.action === 'organize') {
    if (!t || !t.files.length) return flash('warn', '还没有可整理的材料')
    const picked = await pickFolder('选择要整理到的文件夹')
    if (picked?.ok) await copyToFolder(picked.dir)
  }
}

// ---------- 初始化 ----------
function init() {
  if (inited) return
  inited = true
  const api = window.api
  if (!api) return
  refresh()
  api.onMboxChanged?.((s) => applyState(s))
  api.onMboxZipProgress?.((p) => {
    if (p.phase === 'start') {
      zip.value = { phase: 'start', bytes: 0, totalBytes: 0, doneFiles: 0, totalFiles: p.totalFiles, current: '' }
      showZipProgress({ bytes: 0, totalBytes: 0, doneFiles: 0, totalFiles: p.totalFiles })
    } else if (p.phase === 'progress') {
      zip.value = { ...(zip.value || {}), phase: 'progress', ...p }
      showZipProgress(p)
    } else if (p.phase === 'done') {
      zip.value = null
      const mb = ((p.zipBytes || 0) / 1048576).toFixed(1)
      sfx.notice()
      showNotice(
        {
          variant: 'progress',
          icon: 'check',
          accent: '#30D158',
          title: '材料已打包',
          detail: `${p.outPath.split(/[\\/]/).pop()} · ${mb} MB`,
        },
        7000
      )
    } else if (p.phase === 'cancelled') {
      zip.value = null
      dismissNotice()
    } else if (p.phase === 'error') {
      zip.value = null
      sfx.alarm()
      showNotice(
        { variant: 'progress', icon: 'warning', accent: '#FF453A', title: '打包失败', detail: p.message || '' },
        7000
      )
    }
  })
  api.onMboxCopyProgress?.((p) => {
    copying.value = { done: p.done, total: p.total }
  })
  api.onMboxMenu?.(handleMenuAction)
}

init()

export function useMaterialBox() {
  return {
    tasks,
    activeTaskId,
    activeTask,
    limits,
    adding,
    zip,
    copying,
    toast,
    requestView,
    taskProgress,
    isComplete,
    refresh,
    addPaths,
    pickFiles,
    pathsFromDataTransfer,
    dataTransferHasFiles,
    enterDropState,
    leaveDropState,
    showAdding,
    showAdded,
    createTask,
    removeTask,
    setActiveTask,
    clearTask,
    removeFile,
    revalidate,
    relocate,
    revealFile,
    exportZip,
    cancelZip,
    copyToFolder,
    pickFolder,
    defaultDirs,
    openMenu,
    flash,
  }
}
