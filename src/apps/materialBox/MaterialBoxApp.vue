<template>
  <div class="mbox">
    <!-- ---------- 顶部：任务名 + 操作 ---------- -->
    <div class="head">
      <span class="box-ico"><Icon name="box" class="box-glyph" /></span>
      <div class="head-text">
        <div class="head-title">材料箱</div>
        <div class="head-sub">{{ activeTask ? activeTask.name : '还没有收集任务' }}</div>
      </div>
      <button class="hbtn" title="切换任务" @click="view = 'tasks'">
        <Icon name="chevron-down" class="hbtn-ico" />
      </button>
      <button class="hbtn" title="更多操作" @click="openMenu">
        <Icon name="more" class="hbtn-ico" />
      </button>
    </div>

    <!-- ---------- 收集进度 ---------- -->
    <div v-if="activeTask" class="progress">
      <span class="p-count">{{ progressText }}</span>
      <div class="p-track">
        <div class="p-fill" :class="{ done: isComplete }" :style="{ width: `${pct}%` }" />
      </div>
      <span class="p-pct">{{ pct }}%</span>
    </div>

    <!-- ---------- 材料列表 ---------- -->
    <MaterialFileList
      v-if="activeTask"
      :task="activeTask"
      @remove="removeFile"
      @reveal="revealFile"
      @relocate="relocate"
    />
    <div v-else class="no-task">
      <div class="no-ico"><Icon name="box" class="no-glyph" /></div>
      <div class="no-text">先建一个收集任务</div>
      <div class="no-hint">比如「XX公司9月发票」，再把材料一个个丢进来</div>
      <button class="no-btn" @click="view = 'new'"><Icon name="plus" class="no-btn-ico" />新建任务</button>
    </div>

    <!-- ---------- 底部：两种"收口"方式并列，压缩不是必须的 ---------- -->
    <div class="foot">
      <button class="btn ghost" :disabled="!activeTask" @click="pickFiles" title="继续往当前任务里加材料">
        <Icon name="plus" class="btn-ico" />继续添加
      </button>
      <button
        class="btn secondary"
        :disabled="!fileCount"
        title="把材料统一复制到一个文件夹（不压缩，原文件不动）"
        @click="organize"
      >
        <Icon name="folder" class="btn-ico" />整理到文件夹
      </button>
      <button class="btn primary" :disabled="!fileCount" title="打包成一个 ZIP" @click="openZip">
        <Icon name="package" class="btn-ico" />打包
      </button>
    </div>

    <!-- ---------- 轻提示 ---------- -->
    <Transition name="toast">
      <div v-if="toast" class="toast" :class="toast.kind">{{ toast.text }}</div>
    </Transition>

    <!-- ---------- 覆盖面板 ---------- -->
    <MaterialTaskList
      v-if="view === 'tasks' || view === 'new'"
      :mode="view === 'new' ? 'new' : 'switch'"
      :tasks="tasks"
      :active-task-id="activeTaskId"
      @update:mode="(m) => (view = m)"
      @close="view = null"
      @pick="onPickTask"
      @remove="removeTask"
      @create="onCreateTask"
    />

    <MaterialZipDialog
      v-if="view === 'zip'"
      ref="zipRef"
      :task="activeTask"
      :dirs="zipDirs"
      @close="view = null"
      @pick-other="chooseOtherDir"
      @confirm="onConfirmZip"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '../../components/Icon.vue'
import MaterialFileList from './components/MaterialFileList.vue'
import MaterialTaskList from './components/MaterialTaskList.vue'
import MaterialZipDialog from './components/MaterialZipDialog.vue'
import { useMaterialBox } from './useMaterialBox'

const {
  tasks,
  activeTaskId,
  activeTask,
  toast,
  requestView,
  taskProgress,
  isComplete,
  refresh,
  pickFiles,
  createTask,
  removeTask,
  setActiveTask,
  removeFile,
  relocate,
  revealFile,
  exportZip,
  copyToFolder,
  pickFolder,
  defaultDirs,
  openMenu,
  flash,
} = useMaterialBox()

const view = ref(null)
const zipRef = ref(null)
const zipDirs = ref([])

const pct = computed(() => taskProgress.value.pct)
const fileCount = computed(() => (activeTask.value?.files || []).length)

const progressText = computed(() => {
  const t = activeTask.value
  if (!t) return ''
  if (t.requiredCount > 0) return `${t.collected} / ${t.requiredCount}`
  return `${t.files.length} 项材料`
})

// 右键菜单请求的面板
watch(requestView, (v) => {
  if (v) {
    view.value = v
    requestView.value = null
  }
})

async function openZip() {
  if (!activeTask.value) return
  zipDirs.value = await defaultDirs(activeTaskId.value)
  view.value = 'zip'
}

// 整理到文件夹：不压缩，只把材料统一复制到一处（原文件不动）
async function organize() {
  if (!activeTask.value || !fileCount.value) return
  const picked = await pickFolder('选择要整理到的文件夹')
  if (!picked?.ok) return
  await copyToFolder(picked.dir)
}

async function chooseOtherDir() {
  const r = await pickFolder('选择打包保存位置')
  if (r?.ok) zipRef.value?.setCustomDir(r.dir)
}

async function onConfirmZip({ name, dir }) {
  view.value = null
  const r = await exportZip({ name, dir })
  if (r) {
    flash('ok', `已打包 ${r.fileCount} 个文件 · ${(r.zipBytes / 1048576).toFixed(1)} MB`)
    if (window.api?.mboxReveal) {
      // 打包完直接把文件所在目录打开，省一步
      setTimeout(() => window.api.mboxReveal(r.outPath), 400)
    }
  }
}

async function onPickTask(id) {
  await setActiveTask(id)
  view.value = null
}

async function onCreateTask({ name, required }) {
  const ok = await createTask(name, required)
  if (ok) view.value = null
}

onMounted(() => {
  // 打开时刷新一次，避免看到过期状态
  refresh()
})

// 路径失效时主动提示，不静默失败
watch(
  () => activeTask.value?.missingCount || 0,
  (n) => {
    if (n > 0) flash('warn', `有 ${n} 个文件已失效，可重新定位或移除`)
  }
)
</script>

<style scoped>
.mbox {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px 14px 12px;
  overflow: hidden;
}

/* 顶部 */
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 2px 10px;
  flex-shrink: 0;
}
.box-ico {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #0a84ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.box-glyph {
  width: 17px;
  height: 17px;
}
.head-text {
  flex: 1;
  min-width: 0;
}
.head-title {
  font-size: 14px;
  font-weight: 700;
  color: #f5f5f7;
  line-height: 1.2;
}
.head-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hbtn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.16s ease, color 0.16s ease;
}
.hbtn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f5f5f7;
}
.hbtn-ico {
  width: 14px;
  height: 14px;
}

/* 进度 */
.progress {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 2px 10px;
  flex-shrink: 0;
}
.p-count {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 34px;
}
.p-track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.p-fill {
  height: 100%;
  border-radius: 999px;
  background: #0a84ff;
  transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease;
}
.p-fill.done {
  background: #30d158;
}
.p-pct {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 32px;
  text-align: right;
}

/* 空态 */
.no-task {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
}
.no-ico {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: rgba(10, 132, 255, 0.14);
  color: #0a84ff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.no-glyph {
  width: 26px;
  height: 26px;
}
.no-text {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
}
.no-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  max-width: 240px;
  line-height: 1.5;
}
.no-btn {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: none;
  border-radius: 999px;
  background: #0a84ff;
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease;
}
.no-btn:hover {
  background: #2f95ff;
  transform: scale(1.04);
}
.no-btn-ico {
  width: 12px;
  height: 12px;
}

/* 底部：三个动作同排 —— 添加 / 整理到文件夹 / 打包 */
.foot {
  display: flex;
  gap: 7px;
  padding-top: 10px;
  flex-shrink: 0;
}
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 6px;
  border: none;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.16s ease, opacity 0.16s ease;
}
.btn-ico {
  width: 13px;
  height: 13px;
}
.btn.ghost {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}
.btn.ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}
/* 「整理到文件夹」：和打包并列的另一种收口方式，用蓝色描边区分层级 */
.btn.secondary {
  flex: 1.5;
  background: rgba(10, 132, 255, 0.14);
  color: #7cb8ff;
  box-shadow: inset 0 0 0 1px rgba(10, 132, 255, 0.35);
}
.btn.secondary:hover:not(:disabled) {
  background: rgba(10, 132, 255, 0.26);
}
.btn.primary {
  flex: 1.1;
  background: #0a84ff;
  color: #fff;
}
.btn.primary:hover:not(:disabled) {
  background: #2f95ff;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 轻提示 */
.toast {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 62px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 11.5px;
  font-weight: 600;
  text-align: center;
  background: rgba(28, 28, 30, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  pointer-events: none;
  z-index: 8;
}
.toast.ok {
  border-color: rgba(48, 209, 88, 0.4);
  color: #6ee79a;
}
.toast.warn {
  border-color: rgba(255, 159, 10, 0.4);
  color: #ffc061;
}
.toast.error {
  border-color: rgba(255, 69, 58, 0.45);
  color: #ff8b84;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
