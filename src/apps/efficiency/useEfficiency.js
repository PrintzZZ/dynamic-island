import { reactive, ref, watch } from 'vue'
import { settings as appSettings, subEnabled } from '../../composables/useSettings'

const STORAGE_KEY = 'island.efficiency.v1'

// 「效率」内部的四个模式。它们本身仍然是完整的岛内应用
// （便签 / 待办 / 常用语 / 剪贴板），这里只是把它们收进一个应用里，
// 用和时间板块同一套的横向卡片堆栈切换。
//
// 注意几个约定：
//   · 这四个 id 同时就是设置里的 enabledSubs 键（沿用已久，不改名，老数据不丢）；
//   · icon 必须是 Icon.vue 里存在的名字（时间板块同理）；
//   · accent 决定身份行状态圆点的颜色（showBar 打开时才看得到）。
export const MODES = [
  { id: 'notes', name: '便签', icon: 'pencil', accent: '#FFD60A' },
  { id: 'todo', name: '待办', icon: 'check-square', accent: '#30D158' },
  { id: 'phrases', name: '常用语', icon: 'quote', accent: '#BF5AF2' },
  { id: 'clipboard', name: '剪贴板', icon: 'clipboard', accent: '#5AC8FA' },
]

export const MODE_IDS = MODES.map((m) => m.id)

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (MODE_IDS.includes(raw.mode)) return raw.mode
  } catch {
    /* ignore */
  }
  return MODES[0].id
}

// 模块级单例：展开视图与紧凑视图共享同一份状态
const state = reactive({ mode: load() })

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: state.mode }))
  } catch {
    /* ignore */
  }
}

// 设置里被单独关掉的模式不出现在卡片里。
// 兜底：全关掉时退回完整列表（否则效率应用会一张卡都没有）。
// 和 useIsland 的 apps 一样用 ref + watch 显式重建，不依赖 computed 的失效传播。
const visibleModes = ref(MODES.filter((m) => subEnabled(m.id)))

watch(
  () => JSON.stringify(appSettings.enabledSubs || {}),
  () => {
    const on = MODES.filter((m) => subEnabled(m.id))
    visibleModes.value = on.length ? on : MODES
    // 正在看的模式被关掉 → 落到第一个还开着的
    if (!visibleModes.value.some((m) => m.id === state.mode)) {
      state.mode = visibleModes.value[0].id
      save()
    }
  }
)

export function useEfficiency() {
  function setMode(id) {
    if (!MODE_IDS.includes(id) || state.mode === id) return
    // 被设置关掉的模式不允许切过去
    if (!visibleModes.value.some((m) => m.id === id)) return
    state.mode = id
    save()
  }

  return { state, setMode }
}
