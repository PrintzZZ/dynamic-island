import { ref, watch } from 'vue'

const STORAGE_KEY = 'island.notes.v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

// 模块级单例：多个组件共享同一份便签数据
const notes = ref(load())

watch(
  notes,
  (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)),
  { deep: true }
)

let seq = 0

export function useNotes() {
  function createNote(partial = {}) {
    const now = Date.now()
    const note = {
      id: `${now}-${seq++}`,
      title: '',
      content: '',
      color: '#FFD60A',
      createdAt: now,
      updatedAt: now,
      ...partial,
    }
    notes.value.unshift(note)
    return note
  }

  function updateNote(id, patch) {
    const n = notes.value.find((x) => x.id === id)
    if (n) {
      Object.assign(n, patch, { updatedAt: Date.now() })
    }
  }

  function deleteNote(id) {
    const i = notes.value.findIndex((x) => x.id === id)
    if (i !== -1) notes.value.splice(i, 1)
  }

  return { notes, createNote, updateNote, deleteNote }
}
