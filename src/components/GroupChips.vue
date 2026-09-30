<template>
  <div class="gc">
    <div class="gc-scroll">
      <button class="gc-chip" :class="{ on: modelValue === '*' }" @click="pick('*')">
        全部<em v-if="total">{{ total }}</em>
      </button>

      <button
        v-for="g in groups"
        :key="g"
        class="gc-chip"
        :class="{ on: modelValue === g }"
        @click="pick(g)"
      >
        {{ g }}<em v-if="count(g)">{{ count(g) }}</em>
        <span v-if="manage && modelValue === g" class="gc-x" title="删除该分组" @click.stop="remove(g)">×</span>
      </button>

      <button
        v-if="uncategorized"
        class="gc-chip muted"
        :class="{ on: modelValue === '' }"
        @click="pick('')"
      >
        未分类<em>{{ uncategorized }}</em>
      </button>
    </div>

    <!-- 新建 / 重命名：Electron 里没有 window.prompt，用行内输入框 -->
    <div v-if="editing" class="gc-edit">
      <input
        ref="inputEl"
        v-model="draft"
        class="gc-input"
        :placeholder="editing === 'new' ? '新分组名称…' : '重命名分组…'"
        maxlength="12"
        @keydown.enter="commit"
        @keydown.esc="cancel"
        @blur="commit"
      />
      <span class="gc-tip">{{ editing === 'new' ? '回车新建' : '回车重命名，组内条目一起改' }}</span>
    </div>

    <div v-else-if="manage" class="gc-actions">
      <button class="gc-mini" title="新建分组" @click="startNew">＋ 新建分组</button>
      <button v-if="isGroup" class="gc-mini" title="重命名当前分组" @click="startRename">重命名</button>
      <span v-if="isGroup" class="gc-tip">删除该分组时，里面的条目会变成「未分类」</span>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'

const props = defineProps({
  // '*' = 全部（不筛选）；组名 = 该组；'' = 未分类
  modelValue: { type: String, default: '*' },
  groups: { type: Array, default: () => [] },
  counts: { type: Object, default: () => new Map() },
  manage: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue', 'add', 'rename', 'remove'])

const editing = ref('') // '' | 'new' | 组名
const draft = ref('')
const inputEl = ref(null)

const isGroup = computed(() => !!props.modelValue && props.modelValue !== '*')
const count = (g) => (props.counts && props.counts.get ? props.counts.get(g) || 0 : 0)
const uncategorized = computed(() => count(''))

function pick(v) {
  if (editing.value) cancel()
  emit('update:modelValue', v)
}

function startNew() {
  editing.value = 'new'
  draft.value = ''
  nextTick(() => inputEl.value && inputEl.value.focus())
}

function startRename() {
  if (!isGroup.value) return
  editing.value = props.modelValue
  draft.value = props.modelValue
  nextTick(() => inputEl.value && inputEl.value.focus())
}

function cancel() {
  editing.value = ''
  draft.value = ''
}

function commit() {
  const name = draft.value.trim()
  const mode = editing.value
  if (!mode || !name) return cancel()
  if (mode === 'new') {
    if (props.groups.includes(name)) return cancel()
    emit('add', name)
    emit('update:modelValue', name) // 新建后直接切过去
  } else if (name !== mode) {
    if (props.groups.includes(name)) return cancel()
    emit('rename', mode, name)
    emit('update:modelValue', name)
  }
  cancel()
}

// 只负责把"要删"这件事报上去：**不要**在这里顺手切换选中项 ——
// 删除通常需要二次确认，切换会让 ✕ 立刻消失，第二次就点不到了（实测踩过）。
// 父组件在真正删掉之后再决定要不要把选中项切回「全部」。
function remove(g) {
  emit('remove', g)
}
</script>

<style scoped>
.gc {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gc-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.gc-scroll::-webkit-scrollbar {
  display: none;
}
.gc-chip {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--st-fill, rgba(255, 255, 255, 0.06));
  color: var(--st-text-2, rgba(255, 255, 255, 0.55));
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.gc-chip:hover {
  color: var(--st-text, #f5f5f7);
}
.gc-chip.on {
  background: rgba(191, 90, 242, 0.18);
  border-color: rgba(191, 90, 242, 0.45);
  color: #bf5af2;
  font-weight: 600;
}
.gc-chip.muted {
  color: var(--st-text-3, rgba(255, 255, 255, 0.38));
}
.gc-chip em {
  font-style: normal;
  font-size: 10px;
  opacity: 0.6;
}
.gc-x {
  margin-left: 2px;
  font-size: 13px;
  line-height: 1;
  opacity: 0.75;
}
.gc-x:hover {
  opacity: 1;
  color: #ff453a;
}

.gc-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.gc-mini {
  padding: 2px 8px;
  border: 1px solid var(--st-line, rgba(255, 255, 255, 0.12));
  border-radius: 7px;
  background: transparent;
  color: var(--st-text-2, rgba(255, 255, 255, 0.6));
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.gc-mini:hover {
  color: var(--st-text, #f5f5f7);
  border-color: rgba(255, 255, 255, 0.28);
}
.gc-tip {
  font-size: 10.5px;
  color: var(--st-text-3, rgba(255, 255, 255, 0.32));
}

.gc-edit {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gc-input {
  width: 150px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(191, 90, 242, 0.5);
  border-radius: 8px;
  background: var(--st-field, rgba(255, 255, 255, 0.06));
  color: var(--st-text, #f5f5f7);
  font-size: 12px;
  outline: none;
}
</style>
