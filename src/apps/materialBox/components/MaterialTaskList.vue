<template>
  <div class="task-panel">
    <!-- ---------- 切换任务 ---------- -->
    <template v-if="mode === 'switch'">
      <div class="panel-head">
        <span class="panel-title">收集任务</span>
        <button class="x" title="关闭" @click="$emit('close')">
          <Icon name="close" class="x-ico" />
        </button>
      </div>

      <div class="list">
        <button
          v-for="t in tasks"
          :key="t.id"
          class="task"
          :class="{ on: t.id === activeTaskId }"
          @click="$emit('pick', t.id)"
        >
          <span class="radio" />
          <span class="tname">{{ t.name }}</span>
          <span class="tcount">
            {{ t.requiredCount ? `${t.collected}/${t.requiredCount}` : t.files.length }}
          </span>
          <span class="tdel" title="删除任务" @click.stop="$emit('remove', t.id)">
            <Icon name="close" class="tdel-ico" />
          </span>
        </button>
        <div v-if="!tasks.length" class="no-task">还没有任务</div>
      </div>

      <button class="new-btn" @click="startNew">
        <Icon name="plus" class="new-ico" />新建任务
      </button>
    </template>

    <!-- ---------- 新建任务 ---------- -->
    <template v-else>
      <div class="panel-head">
        <span class="panel-title">新建收集任务</span>
      </div>

      <label class="field">
        <span class="flabel">任务名称</span>
        <input
          ref="nameEl"
          v-model="name"
          class="input"
          maxlength="40"
          placeholder="XX公司9月发票"
          @keydown.enter="submit"
        />
      </label>

      <div class="checklist">
        <div class="flabel">
          可选材料清单<span class="hint">可以不选，之后直接拖文件</span>
        </div>
        <div class="chips">
          <button
            v-for="p in PRESETS"
            :key="p"
            class="chip"
            :class="{ on: picked.includes(p) }"
            @click="toggle(p)"
          >
            <Icon v-if="picked.includes(p)" name="check" class="chip-ico" />{{ p }}
          </button>
          <span v-for="(x, i) in extra" :key="x" class="chip on">
            {{ x }}
            <button class="chip-x" @click="extra.splice(i, 1)">×</button>
          </span>
        </div>
        <div class="custom">
          <input
            v-model="custom"
            class="input small"
            maxlength="20"
            placeholder="自定义材料名"
            @keydown.enter="addCustom"
          />
          <button class="add" title="加入清单" @click="addCustom">
            <Icon name="plus" class="add-ico" />
          </button>
        </div>
      </div>

      <div class="panel-foot">
        <button class="btn ghost" @click="$emit('close')">取消</button>
        <button class="btn primary" :disabled="!canSubmit" @click="submit">创建</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import Icon from '../../../components/Icon.vue'

const props = defineProps({
  mode: { type: String, default: 'switch' },
  tasks: { type: Array, default: () => [] },
  activeTaskId: { type: String, default: null },
})

const emit = defineEmits(['close', 'pick', 'remove', 'create', 'update:mode'])

// 常用材料名，点一下就能进清单
const PRESETS = ['汇款截图', '开票信息', '合同', '对账单', '报价单', '发票']

const name = ref('')
const picked = ref([])
const extra = ref([])
const custom = ref('')
const nameEl = ref(null)

const canSubmit = computed(() => name.value.trim().length > 0)

function toggle(p) {
  const i = picked.value.indexOf(p)
  if (i === -1) picked.value.push(p)
  else picked.value.splice(i, 1)
}

function addCustom() {
  const v = custom.value.trim()
  if (!v) return
  if (!picked.value.includes(v) && !extra.value.includes(v)) extra.value.push(v)
  custom.value = ''
}

function startNew() {
  name.value = ''
  picked.value = []
  extra.value = []
  custom.value = ''
  emit('update:mode', 'new')
  nextTick(() => nameEl.value?.focus())
}

function submit() {
  if (!canSubmit.value) return
  emit('create', { name: name.value.trim(), required: [...picked.value, ...extra.value] })
  name.value = ''
  picked.value = []
  extra.value = []
}

watch(
  () => props.mode,
  (m) => {
    if (m === 'new') nextTick(() => nameEl.value?.focus())
  }
)
</script>

<style scoped>
.task-panel {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  background: #000;
  border-radius: 0 0 34px 34px;
  padding: 12px 14px 14px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
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

/* 任务列表 */
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.task {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  text-align: left;
  transition: background 0.16s ease;
}
.task:hover {
  background: rgba(255, 255, 255, 0.07);
}
.task.on {
  background: rgba(10, 132, 255, 0.16);
  color: #f5f5f7;
}
.radio {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
  position: relative;
}
.task.on .radio {
  border-color: #0a84ff;
}
.task.on .radio::after {
  content: '';
  position: absolute;
  inset: 2.5px;
  border-radius: 50%;
  background: #0a84ff;
}
.tname {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tcount {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.tdel {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.3);
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.16s ease, background 0.16s ease, color 0.16s ease;
}
.tdel-ico {
  width: 9px;
  height: 9px;
}
.task:hover .tdel {
  opacity: 1;
}
.tdel:hover {
  background: var(--red);
  color: #fff;
}
.no-task {
  padding: 18px 0;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

.new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  padding: 9px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 11px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}
.new-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.35);
  color: #f5f5f7;
}
.new-ico {
  width: 13px;
  height: 13px;
}

/* 新建表单 */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}
.flabel {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.28);
}
.input {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 11px;
  color: #f5f5f7;
  outline: none;
  padding: 9px 11px;
  font-size: 13px;
  transition: border-color 0.16s ease, background 0.16s ease;
}
.input:focus {
  border-color: rgba(10, 132, 255, 0.7);
  background: rgba(255, 255, 255, 0.1);
}
.input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}
.input.small {
  padding: 7px 10px;
  font-size: 12px;
}

.checklist {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 12px;
  overflow-y: auto;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}
.chip:hover {
  background: rgba(255, 255, 255, 0.12);
}
.chip.on {
  background: rgba(10, 132, 255, 0.22);
  color: #6cb2ff;
}
.chip-ico {
  width: 10px;
  height: 10px;
  stroke-width: 3;
}
.chip-x {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0 0 0 2px;
}
.custom {
  display: flex;
  gap: 7px;
}
.add {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #f5f5f7;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease;
}
.add:hover {
  background: rgba(255, 255, 255, 0.2);
}
.add-ico {
  width: 13px;
  height: 13px;
}

.panel-foot {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  flex-shrink: 0;
}
.btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.16s ease, opacity 0.16s ease;
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
