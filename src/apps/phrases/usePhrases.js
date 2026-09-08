import { ref, watch } from 'vue'

const STORAGE_KEY = 'island.phrases.v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

// 模块级单例：多个组件共享同一份常用语数据
const phrases = ref(load())

watch(
  phrases,
  (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)),
  { deep: true }
)

let seq = 0

export function usePhrases() {
  function addPhrase(text) {
    const t = String(text || '').trim()
    if (!t) return null
    const phrase = { id: `${Date.now()}-${seq++}`, text: t }
    phrases.value.unshift(phrase)
    return phrase
  }

  function removePhrase(id) {
    const i = phrases.value.findIndex((x) => x.id === id)
    if (i !== -1) phrases.value.splice(i, 1)
  }

  return { phrases, addPhrase, removePhrase }
}
