<template>
  <div class="gc">
    <div
      ref="scrollEl"
      class="gc-scroll"
      :class="{ 'is-scrollable': scrollable, 'can-left': canLeft, 'can-right': canRight }"
      :title="scrollable ? '分组较多：Shift + 滚轮 可横向滚动' : ''"
      @wheel="onWheel"
      @scroll="updateScrollable"
    >
      <button class="gc-chip" :class="{ on: modelValue === '*' }" @click="pick('*', $event)">
        全部<em v-if="total">{{ total }}</em>
      </button>

      <button
        v-for="g in groups"
        :key="g"
        class="gc-chip"
        :class="{ on: modelValue === g }"
        @click="pick(g, $event)"
      >
        {{ g }}<em v-if="count(g)">{{ count(g) }}</em>
        <span v-if="manage && modelValue === g" class="gc-x" title="删除该分组" @click.stop="remove(g)">×</span>
      </button>

      <button
        v-if="uncategorized"
        class="gc-chip muted"
        :class="{ on: modelValue === '' }"
        @click="pick('', $event)"
      >
        未分类<em>{{ uncategorized }}</em>
      </button>

      <!-- 放在最后一个分组之后：点它才回到第一个（滚动回去，不改选中） -->
      <button v-if="scrollable" class="gc-jump" title="回到第一个分组" @click="jumpToStart">
        <Icon name="chevron-right" class="gc-jump-ico" />
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'

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

// ---------- 横向滚动 ----------
// 分组一多就溢出，而这一行的滚动条是隐藏的、竖向滚轮默认也不会横向滚 ——
// 不加处理的话第 7 个往后的分组根本够不到（用户反馈）。所以：
//   1) 滚轮映射成横向滚动；
//   2) 点哪个胶囊就把它滚进视野（"点第六个，整排往右挪一个"）；
//   3) 打开时把当前选中的分组滚进视野 —— 选中是会被记住的，记到第 8 个也得能看见。
const scrollEl = ref(null)
const scrollable = ref(false)
const canLeft = ref(false)
const canRight = ref(false)

function updateScrollable() {
  const el = scrollEl.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  scrollable.value = max > 4
  canLeft.value = max > 4 && el.scrollLeft > 2
  canRight.value = max > 4 && el.scrollLeft < max - 2
}

// 右侧渐隐宽度（与样式里的 22px 对齐）——"算作可见"的边距必须 >= 它，
// 否则胶囊明明压在渐隐里，这里却认为已经露全了，用户看到的就是"只漏出来一点点"。
const FADE = 22
const EDGE = FADE + 8

// 平滑滚动：自己用 rAF 做。
// 不能用 scrollTo({ behavior: 'smooth' }) —— 这个容器是 overflow-x: hidden，
// 实测那个 API 在它上面不会产生动画，直接瞬移。
let animRaf = 0
function scrollToLeft(left) {
  const el = scrollEl.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  const target = Math.max(0, Math.min(max, Math.round(left)))
  const from = el.scrollLeft
  if (Math.abs(target - from) < 1) return
  if (animRaf) cancelAnimationFrame(animRaf)
  // 距离越远稍慢一点，但控制在 140~320ms，点起来才跟手
  const dur = Math.min(320, Math.max(140, Math.abs(target - from) * 0.45))
  const t0 = performance.now()
  const ease = (p) => 1 - Math.pow(1 - p, 3) // easeOutCubic：起步快、收尾稳
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur)
    el.scrollLeft = from + (target - from) * ease(p)
    updateScrollable()
    if (p < 1) {
      animRaf = requestAnimationFrame(step)
    } else {
      animRaf = 0
      el.scrollLeft = target
      updateScrollable()
    }
  }
  animRaf = requestAnimationFrame(step)
}

// 某个胶囊是否"舒服地"露出来了（避开两侧渐隐）；退化 rect 视为到位，别乱滚
function isComfortable(chip) {
  const el = scrollEl.value
  if (!el || !chip) return true
  const box = el.getBoundingClientRect()
  const r = chip.getBoundingClientRect()
  if (!r.width || !box.width) return true
  return r.left >= box.left + EDGE && r.right <= box.right - EDGE
}

function activeChipEl() {
  const el = scrollEl.value
  return el ? el.querySelector('.gc-chip.on') : null
}

// 让某个胶囊"舒服地"露出来：
//   · 已经避开两侧渐隐、完整可见 → 不动它（免得每点一下都乱跳）
//   · 否则把它**对齐到左边距** —— 关键是"对齐左边"而不是"最小移动"：
//     只移动刚够自己露出来的距离，它后面那个（常常就是最后一个）仍然看不见（用户反馈）。
//     对齐左边之后，它后面那几个会一起露出来。
function ensureVisible(chip, opts = {}) {
  const el = scrollEl.value
  if (!el || !chip) return
  if (isComfortable(chip) && !opts.force) return
  const box = el.getBoundingClientRect()
  const r = chip.getBoundingClientRect()
  // 退化 rect（元素已脱离文档流）→ 别滚：拿它算出来的目标会一路跑回最左边
  if (!r.width || !box.width) return
  scrollToLeft(el.scrollLeft + (r.left - box.left) - EDGE)
}

// 滚轮：**只认 Shift + 竖向滚轮**，其余全部放行。
//
// 为什么收得这么紧：滚轮在岛内已经被 CardCarousel 占用了，而且它有一套刻意的策略 ——
// 竖向滚轮"先滚内容、滚到边界才切卡"，横向滚动直接切卡。分组栏只是顶部一条窄带，
// 指针经常掠过它；只要在这里拦一下竖向滚轮，列表就滚不动（用户反馈的冲突），
// 拦横向滚动又会抢掉切卡手势。所以只留 Shift + 滚轮这个谁都不用的组合。
//
// 够不到后面的分组也不用担心：**点第 6 个会自动把它滚进视野**，一路点过去就能走到最后；
// 另外打开时会自动把（记住的）当前分组滚到可见位置。
function onWheel(e) {
  const el = scrollEl.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  if (max <= 4) return
  if (!e.shiftKey) return // 竖向交给内容滚动、横向交给切卡，都不抢
  const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY))
  if (next === el.scrollLeft) return
  e.preventDefault()
  el.scrollLeft = next // 逐格操作，即时（平滑动画留给点击/定位）
  updateScrollable()
}

function scrollActiveIntoView() {
  ensureVisible(activeChipEl())
}

// 展开动画 / 字体加载 / 计数变化都会让布局尺寸继续变，一次测量往往不够，所以要补测；
// 但**一旦到位就立刻停** —— 否则动画结束后的一次补测若判成"不够舒服"，
// 会把这排再拽一次，看起来就像"自己乱跳"。
let settleTimers = []
const SETTLE_DELAYS = [0, 120, 260, 480, 800]
function scrollActiveIntoViewSoon() {
  settleTimers.forEach(clearTimeout)
  settleTimers = []
  const pass = (i) => {
    scrollActiveIntoView()
    if (i + 1 < SETTLE_DELAYS.length && !isComfortable(activeChipEl())) {
      settleTimers.push(setTimeout(() => pass(i + 1), SETTLE_DELAYS[i + 1]))
    }
  }
  pass(0)
}

onMounted(() => {
  updateScrollable()
  window.addEventListener('resize', updateScrollable)
  // 等一帧再定位：首次渲染时胶囊尺寸还没算出来
  nextTick(() => requestAnimationFrame(scrollActiveIntoViewSoon))
})
onUnmounted(() => {
  window.removeEventListener('resize', updateScrollable)
  settleTimers.forEach(clearTimeout)
  settleTimers = []
  if (animRaf) cancelAnimationFrame(animRaf)
})
watch(
  () => props.groups.length,
  () => nextTick(updateScrollable)
)
// 选中项变了（含"记忆的分组在打开时被恢复"）就把它滚进视野
watch(
  () => props.modelValue,
  () => nextTick(scrollActiveIntoViewSoon)
)
const count = (g) => (props.counts && props.counts.get ? props.counts.get(g) || 0 : 0)
const uncategorized = computed(() => count(''))

// 回到第一个分组：只滚动，不改变当前选中（改选中会让人意外）
function jumpToStart() {
  scrollToLeft(0)
}

function pick(v, ev) {
  if (editing.value) cancel()
  emit('update:modelValue', v)
  // 点了就滚进视野：分组多的时候，点第 6 个应该让整排往右挪一格
  const chip = ev && ev.currentTarget
  if (chip) nextTick(() => ensureVisible(chip))
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
  /* 两个轴都必须写 hidden —— 这里踩过一次很隐蔽的坑：
     · overflow-x: auto 时，浏览器会把竖向滚轮判成"横向滚动这条"，指针掠过分组栏
       就会把面板的滚轮吃掉；
     · 只写 overflow-x: hidden 也不行：**按规范另一轴的 visible 会被算成 auto**，
       于是分组栏看起来成了"能上下滚的容器"（padding-bottom 那 2px 溢出就够了），
       CardCarousel 的 scrollableAt() 会把滚轮整段让给它 —— 表现就是"在常用语里
       滚轮既不能滚列表、也不能左右切应用"，而剪贴板没有分组栏所以正常。
     hidden 下它仍是可编程滚动的容器，scrollLeft 照常可写，滚动全部交给
     下面 onWheel / ensureVisible 精确控制。 */
  overflow-x: hidden;
  overflow-y: hidden;
  /* 右侧留出渐隐的宽度：不留的话最后一个胶囊永远贴着右边缘、压在渐隐里，
     看起来像"只漏出来一点点"（滚到最右也没用，因为内容右边没有余量）。
     左侧不用留 —— 没滚动时本来就没有左侧渐隐。 */
  padding-right: 34px;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.gc-scroll::-webkit-scrollbar {
  display: none;
}
/* 只有真的溢出、且那一侧还有内容时才渐隐那一侧 */
.gc-scroll.can-right {
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
}
.gc-scroll.can-left {
  -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(to left, #000 calc(100% - 22px), transparent);
}
.gc-scroll.can-left.can-right {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 22px, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 22px, #000 calc(100% - 22px), transparent);
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
/* 排在最后一个分组之后的「›」：点它才回到开头 */
.gc-jump {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--st-fill, rgba(255, 255, 255, 0.06));
  color: var(--st-text-2, rgba(255, 255, 255, 0.5));
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.gc-jump:hover {
  background: rgba(191, 90, 242, 0.2);
  color: #bf5af2;
}
.gc-jump-ico {
  width: 13px;
  height: 13px;
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
