<template>
  <div class="zip-panel">
    <div class="panel-head">
      <span class="panel-title">打包 ZIP</span>
      <button class="x" title="关闭" @click="$emit('close')">
        <Icon name="close" class="x-ico" />
      </button>
    </div>

    <label class="field">
      <span class="flabel">文件名</span>
      <div class="name-row">
        <input v-model="zipName" class="input" maxlength="60" @keydown.enter="confirm" />
        <span class="ext">.zip</span>
      </div>
    </label>

    <div class="field">
      <span class="flabel">保存位置</span>
      <div class="dirs">
        <button
          v-for="d in dirOptions"
          :key="d.id"
          class="dir"
          :class="{ on: dir === d.dir }"
          :title="d.dir"
          @click="dir = d.dir"
        >
          <span class="radio" />
          <span class="dlabel">{{ d.label }}</span>
        </button>
        <button class="dir" :class="{ on: customDir }" @click="chooseOther">
          <span class="radio" />
          <span class="dlabel">{{ customDir ? shortDir(customDir) : '选择其他位置…' }}</span>
        </button>
      </div>
    </div>

    <div class="summary">
      {{ fileCount }} 个文件 · {{ sizeText }}
    </div>

    <div class="panel-foot">
      <button class="btn ghost" @click="$emit('close')">取消</button>
      <button class="btn primary" :disabled="!canSubmit" @click="confirm">
        <Icon name="package" class="btn-ico" />开始打包
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from '../../../components/Icon.vue'

const props = defineProps({
  task: { type: Object, default: null },
  dirs: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'confirm', 'pick-other'])

const zipName = ref('')
const dir = ref('')
const customDir = ref('')

const dirOptions = computed(() => props.dirs || [])

const fileCount = computed(() => (props.task?.files || []).filter((f) => !f.missing).length)

const sizeText = computed(() => {
  const n = (props.task?.files || []).filter((f) => !f.missing).reduce((s, f) => s + (f.size || 0), 0)
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
})

const canSubmit = computed(() => zipName.value.trim().length > 0 && !!dir.value)

function shortDir(d) {
  const parts = String(d).split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? d : `…\\${parts.slice(-2).join('\\')}`
}

function chooseOther() {
  // 具体目录由父组件弹系统选择框，再用 setCustomDir 回填
  emit('pick-other')
}

onMounted(() => {
  const t = props.task
  zipName.value = (t?.name || '材料').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
  dir.value = dirOptions.value[0]?.dir || ''
})

defineExpose({
  setCustomDir(d) {
    customDir.value = d
    dir.value = d
  },
})

function confirm() {
  if (!canSubmit.value) return
  emit('confirm', { name: zipName.value.trim(), dir: dir.value })
}
</script>

<style scoped>
.zip-panel {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #000;
  border-radius: 0 0 34px 34px;
  padding: 12px 14px 14px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #f5f5f7;
}
.x {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, color 0.16s ease;
}
.x:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #f5f5f7;
}
.x-ico {
  width: 10px;
  height: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}
.flabel {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}
.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.input {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 11px;
  color: #f5f5f7;
  outline: none;
  padding: 9px 11px;
  font-size: 13px;
  transition: border-color 0.16s ease;
}
.input:focus {
  border-color: rgba(10, 132, 255, 0.7);
}
.ext {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.45);
  flex-shrink: 0;
}

.dirs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 168px;
  overflow-y: auto;
}
.dir {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.16s ease;
}
.dir:hover {
  background: rgba(255, 255, 255, 0.07);
}
.dir.on {
  background: rgba(10, 132, 255, 0.16);
  color: #f5f5f7;
}
.radio {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
  position: relative;
}
.dir.on .radio {
  border-color: #0a84ff;
}
.dir.on .radio::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  background: #0a84ff;
}
.dlabel {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

.panel-foot {
  display: flex;
  gap: 8px;
  margin-top: auto;
  flex-shrink: 0;
}
.btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.16s ease, opacity 0.16s ease;
}
.btn-ico {
  width: 14px;
  height: 14px;
}
.btn.ghost {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}
.btn.ghost:hover {
  background: rgba(255, 255, 255, 0.15);
}
.btn.primary {
  background: #0a84ff;
  color: #fff;
}
.btn.primary:hover {
  background: #2f95ff;
}
.btn.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
