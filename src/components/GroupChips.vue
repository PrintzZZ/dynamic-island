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

// 让某个胶囊完整露出来（留一点边距，不然贴着渐隐边缘不好看）
function ensureVisible(chip) {
  const el = scrollEl.value
  if (!el || !chip) return
  const box = el.getBoundingClientRect()
  const r = chip.getBoundingClientRect()
  const pad = 10
  if (r.left < box.left + pad) el.scrollLeft -= box.left + pad - r.left
  else if (r.right > box.right - pad) el.scrollLeft += r.right - (box.right - pad)
  updateScrollable()
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
  el.scrollLeft = next
  updateScrollable()
}

function scrollActiveIntoView() {
  const el = scrollEl.value
  if (!el) return
  const chip = el.querySelector('.gc-chip.on')
  if (chip) ensureVisible(chip)
}

// 展开动画 / 字体加载 / 计数变化都会让布局尺寸继续变，一次测量往往不够 ——
// 轻量重试几次（不常驻、不与用户滚动打架）
let settleTimers = []
function scrollActiveIntoViewSoon() {
  settleTimers.forEach(clearTimeout)
  settleTimers = [0, 90, 220, 460, 900].map((d) => setTimeout(scrollActiveIntoView, d))
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
  /* 刻意用 hidden 而不是 auto：auto 时浏览器会把竖向滚轮也判成"横向滚动这条"，
     于是指针一掠过分组栏，面板列表就滚不动了（用户反馈的冲突）。
     这里 overflow-x: hidden 仍然是一个可编程滚动的滚动容器，scrollLeft 照常可写，
     滚动全部交给下面 onWheel / ensureVisible 精确控制。 */
  overflow-x: hidden;
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
