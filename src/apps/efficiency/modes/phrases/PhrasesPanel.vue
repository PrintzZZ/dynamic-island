<template>
  <div class="phrases-app">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ on: view === 'text' }" @click="view = 'text'">
          常用语<span v-if="phrases.length">{{ phrases.length }}</span>
        </button>
        <button :class="{ on: view === 'image' }" @click="view = 'image'">
          图片<span v-if="images.length">{{ images.length }}</span>
        </button>
      </div>
      <!-- 一行搞定：同一个输入框既搜索也新增，＋ 常驻-->
      <div class="bar">
        <input
          ref="inputEl"
          v-model="q"
          class="add-input"
          :placeholder="view === 'text' ? '搜索或添加…' : '搜索图片…'"
          @keydown.enter="onEnter"
          @keydown.esc="q = ''"
        />
        <button
          class="add-btn"
          :title="view === 'text' ? '添加为新常用语' : '导入图片'"
          @click="onPlus"
        >
          <Icon name="plus" class="add-ico" />
        </button>
      </div>
    </div>

    <!-- 分组筛选：只做筛选，管理在设置面板 →「常用」 -->
    <GroupChips
      v-model="group"
      class="group-bar"
      :groups="groups"
      :counts="counts"
      :total="totalOf"
    />

    <!-- ---------- 常用语 ---------- -->
    <template v-if="view === 'text'">
      <div v-if="shownText.length" class="list">
        <TransitionGroup name="phrase">
          <div
            v-for="p in shownText"
            :key="p.id"
            class="phrase-item"
            :class="{ copied: copiedId === p.id }"
            title="点击复制"
            @click="copy(p)"
          >
            <span class="text">{{ p.text }}</span>
            <Transition name="pop">
              <span v-if="copiedId === p.id" class="copied-tag">
                <Icon name="check" class="copied-ico" />已复制
              </span>
            </Transition>
            <button class="del" title="删除" @click.stop="remove(p.id)">
              <Icon name="close" class="del-ico" />
            </button>
          </div>
        </TransitionGroup>
      </div>

      <div v-else class="empty">
        <div class="empty-icon"><Icon name="quote" class="empty-ico" /></div>
        <template v-if="q.trim()">
          <div class="empty-text">没有匹配「{{ q.trim() }}」</div>
          <div class="empty-hint">回车即可添加为新常用语</div>
        </template>
        <template v-else-if="group !== '*'">
          <div class="empty-text">{{ group ? `「${group}」里还没有常用语` : '还没有未分类的常用语' }}</div>
          <div class="empty-hint">在上方输入框输入，回车即添加到这个分组</div>
        </template>
        <template v-else>
          <div class="empty-text">还没有常用语</div>
          <div class="empty-hint">在上方输入框输入，回车添加<br />点击条目即复制</div>
        </template>
      </div>
    </template>

    <!-- ---------- 常用图片：点一下就复制图片，直接粘到别的窗口 ---------- -->
    <template v-else>
      <div v-if="shownImages.length" class="pic-grid">
        <button
          v-for="m in shownImages"
          :key="m.id"
          class="pic"
          :class="{ copied: copiedId === m.id }"
          :title="`${m.name}｜点击复制图片`"
          @click="copyImage(m)"
        >
          <img :src="thumbUrl(m.id)" :alt="m.name" loading="lazy" />
          <span class="pic-name">{{ m.name }}</span>
          <span v-if="copiedId === m.id" class="pic-badge copied">
            <Icon name="check" class="copied-ico" />已复制
          </span>
          <span v-else-if="m.favorite" class="pic-star">★</span>
        </button>
      </div>

      <div v-else class="empty">
        <div class="empty-icon"><Icon name="grid" class="empty-ico" /></div>
        <template v-if="q.trim()">
          <div class="empty-text">没有匹配「{{ q.trim() }}」</div>
          <div class="empty-hint">换个关键词，或点 ＋ 导入图片</div>
        </template>
        <template v-else-if="group !== '*'">
          <div class="empty-text">{{ group ? `「${group}」里还没有图片` : '还没有未分类的图片' }}</div>
          <div class="empty-hint">Ctrl+V 存进来的图会归到这个分组</div>
        </template>
        <template v-else>
          <div class="empty-text">还没有常用图片</div>
          <div class="empty-hint">
            按 Ctrl+V 把剪贴板里的图存进来<br />或点上方 ＋ 导入本地图片
          </div>
        </template>
      </div>
    </template>

    <Transition name="pop">
      <div v-if="toast" class="toast">✓ {{ toast }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from '../../../../components/Icon.vue'
import GroupChips from '../../../../components/GroupChips.vue'
import {
  addPhrase,
  filterCollect,
  groupCounts,
  groups,
  images,
  installPasteHandler,
  phrases,
  pickImages,
  removePhrase,
  sortCollect,
  thumbUrl,
  useImage,
  usePhrase,
} from './usePhrases'
import { sfx } from '../../../../utils/sound'

const view = ref('text')
const q = ref('')
// 当前选中的分组：'*' 全部 / '' 未分类 / 组名。新增的条目会落进这里选中的组。
const group = ref('*')
const inputEl = ref(null)
const copiedId = ref(null)
const toast = ref('')
let copiedTimer = null
let toastTimer = null

const shownText = computed(() => sortCollect(filterCollect(phrases.value, { q: q.value, group: group.value })))
const shownImages = computed(() => sortCollect(filterCollect(images.value, { q: q.value, group: group.value })))
// 胶囊上的计数用**当前页签的全量数据**算，不受搜索影响
const counts = computed(() => groupCounts(view.value === 'text' ? phrases.value : images.value))
const totalOf = computed(() => (view.value === 'text' ? phrases.value.length : images.value.length))

function flash(id, msg) {
  copiedId.value = id
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copiedId.value = null
  }, 1600)
  if (msg) {
    toast.value = msg
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.value = ''
    }, 1600)
  }
}

// 回车：搜到就复制第一条，没搜到就直接把它加成新常用语
// （用户的要求：输入框和 ＋ 常驻，没搜到就添加，不用再分两个框）
async function onEnter() {
  const v = q.value.trim()
  if (!v) return
  if (view.value === 'image') return
  if (shownText.value.length) return copy(shownText.value[0])
  await addNow(v)
}

async function addNow(text) {
  const t = String(text || '').trim()
  if (!t) return
  // 落进当前选中的分组（'*' 或 '' 时按未分类）
  const target = group.value && group.value !== '*' ? group.value : ''
  await addPhrase(t, target)
  q.value = ''
  sfx.tick()
  flash(null, '已添加')
}

// ＋：常用语页 = 新增当前输入；空输入时聚焦输入框；图片页 = 导入本地图片
async function onPlus() {
  if (view.value === 'image') return pick()
  const v = q.value.trim()
  if (v) return addNow(v)
  inputEl.value && inputEl.value.focus()
}

// 点击 = 直接复制 + 计数（方案第 23、26 条：不弹确认）
async function copy(p) {
  const ok = await usePhrase(p.id)
  if (!ok) return
  sfx.tick()
  flash(p.id, '已复制到剪贴板')
}

async function copyImage(m) {
  const ok = await useImage(m.id)
  if (!ok) return
  sfx.tick()
  flash(m.id, '已复制图片，可直接粘贴')
}

async function remove(id) {
  await removePhrase(id)
}

async function pick() {
  const r = await pickImages()
  if (r && r.ok) flash(null, `已导入 ${r.added ? r.added.length : 0} 张`)
}

// Ctrl+V：在「图片」页直接把剪贴板里的图存成常用图。
// 这样刚截完图（截图工具已经把图放进剪贴板）就不必去点岛上的星标了。
let offPaste = null
onMounted(() => {
  offPaste = installPasteHandler(
    () => view.value === 'image',
    (r) => {
      if (r && r.ok) flash(null, '已从剪贴板保存 1 张')
      else if (r && r.error === 'EMPTY') flash(null, '剪贴板里没有图片')
    }
  )
})

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
  if (toastTimer) clearTimeout(toastTimer)
  if (offPaste) offPaste()
})
</script>


<style scoped>
.phrases-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px 8px;
  flex-shrink: 0;
  gap: 8px;
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
  background: #bf5af2;
  border-radius: 999px;
  padding: 1px 8px;
}

/* 搜索 + 新增合成一行（原来是搜索框 / 输入框 / 添加按钮三行） */
.bar {
  display: flex;
  gap: 8px;
  /* 占满 seg 右侧剩余空间；min-width:0 才允许内部输入框真正收缩 */
  flex: 1;
  min-width: 0;
}
/* 分组胶囊那一行（管理在设置面板 →「常用」） */
.group-bar {
  padding: 0 8px 8px;
  flex-shrink: 0;
}
.add-input {
  flex: 1;
  min-width: 0;
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
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: none;
  background: #bf5af2;
  color: #0a0a0a;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.add-ico {
  width: 16px;
  height: 16px;
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
.phrase-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.18s ease;
}
.phrase-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.phrase-item.copied {
  background: rgba(191, 90, 242, 0.16);
}
.text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.4;
  color: #f5f5f7;
  /* 两行截断：模板类长常用语也能认出是哪条 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.copied-tag {
  font-size: 11px;
  font-weight: 700;
  color: #bf5af2;
  white-space: nowrap;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.copied-ico {
  width: 11px;
  height: 11px;
  stroke-width: 2.8;
}
.del {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  opacity: 0;
  transition: all 0.18s ease;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.del-ico {
  width: 10px;
  height: 10px;
}
.phrase-item:hover .del {
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
  color: #bf5af2;
  animation: float 3s ease-in-out infinite;
}
.empty-ico {
  width: 24px;
  height: 24px;
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

/* 复制标签弹出动画 */
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
.phrase-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.phrase-leave-active {
  transition: all 0.22s ease;
}
.phrase-move {
  transition: transform 0.3s ease;
}
.phrase-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.phrase-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

/* ---------- 常用语 / 图片 两个子页签 ---------- */
.seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
  /* 和输入框同一行时不能被压扁，否则「常用语」会被拆成竖排 */
  flex-shrink: 0;
}
.seg button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  white-space: nowrap;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg button:hover {
  color: #f5f5f7;
}
.seg button.on {
  background: rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  font-weight: 600;
}
.seg button span {
  font-size: 10px;
  opacity: 0.5;
}

/* ---------- 常用图片：小瀑布流，点一下直接复制图片 ---------- */
.pic-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 12px;
  /* 固定 2 列：用 column-width 的话，图片的固有宽度会把列撑成 1 列 */
  column-count: 2;
  column-gap: 8px;
}
.pic {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  break-inside: avoid;
  margin: 0 0 8px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.pic:hover {
  border-color: rgba(90, 200, 250, 0.5);
  transform: translateY(-1px);
}
.pic.copied {
  border-color: rgba(48, 209, 88, 0.6);
}
.pic img {
  width: 100%;
  display: block;
}
.pic-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 4px;
  font-size: 11px;
  color: #f5f5f7;
  background: rgba(0, 0, 0, 0.45);
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.pic-star {
  position: absolute;
  top: 4px;
  right: 5px;
  font-size: 11px;
  color: #ffd60a;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
.pic-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: rgba(0, 0, 0, 0.55);
  color: #30d158;
  font-size: 11px;
  font-weight: 600;
}

/* 底部轻提示（方案第 24 条） */
.toast {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
.phrases-app {
  position: relative;
}
</style>
