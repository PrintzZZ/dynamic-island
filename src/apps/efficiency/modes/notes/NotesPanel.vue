<template>
  <div class="notes-app">
    <!-- 列表视图 -->
    <div v-if="!editing" class="list-view">
      <div class="toolbar">
        <div class="title">
          便签
          <span class="count">{{ notes.length }}</span>
        </div>
        <button class="add-btn" title="新建便签" @click="startCreate">
          <Icon name="plus" class="add-ico" />
        </button>
      </div>

      <div v-if="notes.length" class="list">
        <TransitionGroup name="note">
          <div
            v-for="n in notes"
            :key="n.id"
            class="note-card"
            :style="{ '--note-color': n.color }"
            @click="startEdit(n)"
          >
            <div class="stripe" />
            <div class="body">
              <div class="note-title">{{ n.title || '无标题便签' }}</div>
              <div class="note-content">{{ n.content || '点击编辑内容…' }}</div>
              <div class="meta">{{ fmtTime(n.updatedAt) }}</div>
            </div>
            <button class="del-btn" title="删除" @click.stop="remove(n)">
              <Icon name="close" class="del-ico" />
            </button>
          </div>
        </TransitionGroup>
      </div>

      <div v-else class="empty">
        <div class="empty-icon">
          <Icon name="pencil" class="empty-ico" />
        </div>
        <div class="empty-text">还没有便签</div>
        <button class="empty-btn" @click="startCreate">新建一条</button>
      </div>
    </div>

    <!-- 编辑视图 -->
    <div v-else class="editor-view">
      <div class="toolbar">
        <button class="back-btn" title="返回" @click="cancel">
          <Icon name="back" class="back-ico" />
        </button>
        <div class="colors">
          <button
            v-for="c in palette"
            :key="c"
            class="swatch"
            :class="{ active: draft.color === c }"
            :style="{ background: c }"
            @click="draft.color = c"
          />
        </div>
        <button class="save-btn" @click="save">保存</button>
      </div>
      <input
        v-model="draft.title"
        class="note-input title-input"
        placeholder="标题"
        @keydown.enter.prevent
      />
      <textarea
        v-model="draft.content"
        class="note-input content-input"
        placeholder="写点什么…"
      />
      <button v-if="editing !== 'new'" class="delete-btn" @click="removeAndClose">
        删除便签
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import Icon from '../../../../components/Icon.vue'
import { useNotes } from './useNotes'

const { notes, createNote, updateNote, deleteNote } = useNotes()

// null = 列表视图；'new' = 新建；其它为编辑中的便签 id
const editing = ref(null)
const draft = reactive({ id: null, title: '', content: '', color: '#FFD60A' })

const palette = ['#FFD60A', '#30D158', '#0A84FF', '#FF453A', '#BF5AF2', '#8E8E93']

function fmtTime(t) {
  const d = new Date(t)
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startCreate() {
  editing.value = 'new'
  Object.assign(draft, { id: null, title: '', content: '', color: '#FFD60A' })
}

function startEdit(n) {
  editing.value = n.id
  Object.assign(draft, { id: n.id, title: n.title, content: n.content, color: n.color })
}

function save() {
  const title = draft.title.trim()
  const content = draft.content.trim()
  if (!title && !content) {
    editing.value = null
    return
  }
  if (editing.value === 'new') {
    createNote({ title, content, color: draft.color })
  } else {
    updateNote(draft.id, { title, content, color: draft.color })
  }
  editing.value = null
}

function cancel() {
  editing.value = null
}

function remove(n) {
  deleteNote(n.id)
}

function removeAndClose() {
  if (draft.id) deleteNote(draft.id)
  editing.value = null
}
</script>

<style scoped>
.notes-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.list-view,
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  flex-shrink: 0;
}
.title {
  font-size: 16px;
  font-weight: 700;
  color: #f5f5f7;
  display: flex;
  align-items: center;
  gap: 8px;
}
.count {
  font-size: 11px;
  font-weight: 700;
  color: #0a0a0a;
  background: #ffd60a;
  border-radius: 999px;
  padding: 1px 8px;
}
.add-btn,
.back-btn,
.save-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #f5f5f7;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.add-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.add-ico {
  width: 15px;
  height: 15px;
}
.back-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-ico {
  width: 17px;
  height: 17px;
}
.save-btn {
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 700;
  background: #ffd60a;
  color: #1a1a1a;
}
.add-btn:hover,
.back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.08);
}
.save-btn:hover {
  transform: scale(1.05);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.note-card {
  position: relative;
  display: flex;
  align-items: stretch;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
    background 0.18s ease;
}
.note-card:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(2px);
}
.stripe {
  width: 4px;
  flex-shrink: 0;
  background: var(--note-color);
}
.body {
  flex: 1;
  padding: 10px 12px;
  min-width: 0;
}
.note-title {
  font-size: 13px;
  font-weight: 700;
  color: #f5f5f7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.note-content {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.meta {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 4px;
}
.del-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  opacity: 0;
  transition: all 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.del-ico {
  width: 10px;
  height: 10px;
}
.note-card:hover .del-btn {
  opacity: 1;
}
.del-btn:hover {
  background: var(--red);
  color: #fff;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.5);
}
.empty-icon {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffd60a;
  animation: float 3s ease-in-out infinite;
}
.empty-ico {
  width: 27px;
  height: 27px;
  stroke-width: 1.7;
}
.empty-text {
  font-size: 13px;
}
.empty-btn {
  background: #ffd60a;
  color: #1a1a1a;
  border: none;
  border-radius: 999px;
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease;
}
.empty-btn:hover {
  transform: scale(1.06);
}
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

.editor-view {
  padding: 0 16px 16px;
  gap: 10px;
}
.colors {
  display: flex;
  gap: 6px;
}
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.swatch:hover {
  transform: scale(1.15);
}
.swatch.active {
  border-color: #fff;
  transform: scale(1.15);
}
.note-input {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: #f5f5f7;
  outline: none;
  padding: 10px 12px;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.note-input:focus {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
}
.title-input {
  font-size: 15px;
  font-weight: 700;
}
.content-input {
  flex: 1;
  resize: none;
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
}
.delete-btn {
  background: rgba(255, 69, 58, 0.16);
  color: var(--red);
  border: none;
  border-radius: 10px;
  padding: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.18s ease;
}
.delete-btn:hover {
  background: rgba(255, 69, 58, 0.3);
}

.note-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.note-leave-active {
  transition: all 0.22s ease;
}
.note-move {
  transition: transform 0.3s ease;
}
.note-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.note-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
