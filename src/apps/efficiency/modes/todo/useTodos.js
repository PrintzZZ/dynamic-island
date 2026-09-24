import { ref, computed, watch } from 'vue'
import { sfx } from '../../../../utils/sound'

const STORAGE_KEY = 'island.todos.v1'

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// 模块级单例：多个组件共享同一份待办数据
const todos = ref(load())

watch(
  todos,
  (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)),
  { deep: true }
)

let seq = 0

export function useTodos() {
  const pending = computed(() => todos.value.filter((t) => !t.done).length)
  const doneCount = computed(() => todos.value.filter((t) => t.done).length)
  const progress = computed(() =>
    todos.value.length ? doneCount.value / todos.value.length : 0
  )

  function addTodo(text) {
    const s = text.trim()
    if (!s) return
    const todo = {
      id: `${Date.now()}-${seq++}`,
      text: s,
      done: false,
      createdAt: Date.now(),
    }
    todos.value.unshift(todo)
  }

  function toggleTodo(id) {
    const t = todos.value.find((x) => x.id === id)
    if (t) {
      t.done = !t.done
      sfx.tick()
    }
  }

  function removeTodo(id) {
    const i = todos.value.findIndex((x) => x.id === id)
    if (i !== -1) todos.value.splice(i, 1)
  }

  function clearDone() {
    todos.value = todos.value.filter((t) => !t.done)
  }

  return { todos, pending, doneCount, progress, addTodo, toggleTodo, removeTodo, clearDone }
}
