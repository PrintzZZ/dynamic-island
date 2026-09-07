<template>
  <div class="todo-app">
    <div class="toolbar">
      <div class="title">
        待办
        <span v-if="todos.length" class="count">{{ doneCount }}/{{ todos.length }}</span>
      </div>
      <button
        v-if="doneCount"
        class="clear-btn"
        title="清除已完成"
        @click="clearDone"
      >
        清除已完成
      </button>
    </div>

    <!-- 顶部进度条 -->
    <div v-if="todos.length" class="progress-track">
      <div class="progress-fill" :style="{ width: `${progress * 100}%` }" />
    </div>

    <!-- 快捷添加 -->
    <div class="add-bar">
      <input
        v-model="draft"
        class="add-input"
        placeholder="添加待办…"
        @keydown.enter="submit"
      />
      <button class="add-btn" title="添加" @click="submit">＋</button>
    </div>

    <div v-if="todos.length" class="list">
      <TransitionGroup name="todo">
        <div v-for="t in todos" :key="t.id" class="todo-item" :class="{ done: t.done }">
          <button class="checkbox" @click="toggleTodo(t.id)">
            <Transition name="pop">
              <span v-if="t.done" class="tick">✓</span>
            </Transition>
          </button>
          <span class="text" @click="toggleTodo(t.id)">{{ t.text }}</span>
          <button class="del" title="删除" @click="removeTodo(t.id)">✕</button>
        </div>
      </TransitionGroup>
    </div>

    <div v-else class="empty">
      <div class="empty-icon">✓</div>
      <div class="empty-text">暂无待办</div>
      <div class="empty-hint">在上方输入框添加你的第一项待办</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useTodos } from './useTodos'

const { todos, doneCount, progress, addTodo, toggleTodo, removeTodo, clearDone } =
  useTodos()

const draft = ref('')

function submit() {
  addTodo(draft.value)
  draft.value = ''
}
</script>

<style scoped>
.todo-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
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
  background: #30d158;
  border-radius: 999px;
  padding: 1px 8px;
}
.clear-btn {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: color 0.18s ease, background 0.18s ease;
}
.clear-btn:hover {
  color: #f5f5f7;
  background: rgba(255, 255, 255, 0.08);
}

.progress-track {
  height: 3px;
  margin: 0 16px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #30d158;
  border-radius: 999px;
  transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.add-bar {
  display: flex;
  gap: 8px;
  padding: 0 16px 10px;
  flex-shrink: 0;
}
.add-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: #f5f5f7;
  outline: none;
  padding: 9px 12px;
  font-size: 13px;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.add-input:focus {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
}
.add-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}
.add-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: none;
  background: #30d158;
  color: #0a0a0a;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.add-btn:hover {
  transform: scale(1.08);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  transition: background 0.18s ease;
}
.todo-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.checkbox {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.todo-item.done .checkbox {
  border-color: #30d158;
  background: #30d158;
}
.tick {
  color: #0a0a0a;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}
.text {
  flex: 1;
  font-size: 13px;
  color: #f5f5f7;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.2s ease;
}
.todo-item.done .text {
  color: rgba(255, 255, 255, 0.35);
  text-decoration: line-through;
  text-decoration-color: rgba(255, 255, 255, 0.3);
}
.del {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.18s ease;
  flex-shrink: 0;
}
.todo-item:hover .del {
  opacity: 1;
}
.del:hover {
  background: var(--red);
  color: #fff;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.5);
  padding-bottom: 30px;
}
.empty-icon {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #30d158;
  animation: float 3s ease-in-out infinite;
}
.empty-text {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}
.empty-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
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

/* 勾选弹出动画 */
.pop-enter-active {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pop-leave-active {
  transition: transform 0.12s ease;
}
.pop-enter-from,
.pop-leave-to {
  transform: scale(0);
}

/* 列表增删过渡 */
.todo-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.todo-leave-active {
  transition: all 0.22s ease;
}
.todo-move {
  transition: transform 0.3s ease;
}
.todo-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.todo-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
