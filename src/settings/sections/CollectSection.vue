<template>
  <div class="collect">
    <!-- ---------- 顶部：子页签 + 工具栏 ---------- -->
    <div class="cl-bar">
      <div class="cl-seg">
        <button :class="{ on: view === 'phrases' }" @click="view = 'phrases'">
          常用语<em>{{ phrases.length }}</em>
        </button>
        <button :class="{ on: view === 'images' }" @click="view = 'images'">
          常用图片<em>{{ images.length }}</em>
        </button>
      </div>
      <div class="cl-tools">
        <select v-model="sortMode" class="cl-input cl-sel">
          <option value="smart">置顶 · 频率 · 最近</option>
          <option value="count">按使用频率</option>
          <option value="recent">按最近使用</option>
        </select>
      </div>
    </div>

    <!-- 分组：筛选 + 管理（常用语与常用图片共用一套分组） -->
    <GroupChips
      v-model="group"
      :groups="groups"
      :counts="counts"
      :total="source.length"
      manage
      class="cl-groups"
      @add="onGroupAdd"
      @rename="onGroupRename"
      @remove="onGroupRemove"
    />

    <!-- 搜索与新增合成一行：同一个输入框，有匹配就筛选，没匹配回车直接添加 -->
    <div class="cl-add">
      <input
        ref="inputEl"
        v-model="q"
        class="cl-input cl-grow"
        :placeholder="
          view === 'phrases'
            ? group && group !== '*'
              ? `在「${group}」里搜索，或输入新的常用语…`
              : '搜索，或输入新的常用语…'
            : '搜索图片…'
        "
        @keydown.enter="onEnter"
        @keydown.esc="q = ''"
      />
      <button class="st-btn primary" @click="onPlus">
        {{ view === 'phrases' ? '添加' : '导入图片' }}
      </button>
    </div>

    <div v-if="view === 'images'" class="cl-hint">
      刚截完图不用管星标 —— 直接按 <kbd>Ctrl</kbd>+<kbd>V</kbd> 就能把剪贴板里的图存成常用图
    </div>

    <!-- ---------- 常用语 ---------- -->
    <template v-if="view === 'phrases'">
      <div v-if="!list.length" class="cl-empty">
        <template v-if="q.trim()">没有匹配「{{ q.trim() }}」—— 回车即可添加为新常用语</template>
        <template v-else-if="group !== '*'">
          {{ group ? `「${group}」里还没有常用语` : '还没有未分类的常用语' }} —— 在上方输入框输入后回车，
          会加到这个分组
        </template>
        <template v-else>还没有常用语，在上方输入框输入后回车即可添加</template>
      </div>

      <div v-else class="cl-list">
        <div v-for="p in list" :key="p.id" class="cl-row">
          <button class="cl-star" :class="{ on: p.favorite }" :title="p.favorite ? '取消置顶' : '置顶'" @click="toggleFav(p)">
            {{ p.favorite ? '★' : '☆' }}
          </button>
          <div class="cl-body" title="点击复制到剪贴板" @click="copyPhrase(p)">
            <template v-if="editing === p.id">
              <input
                v-model="editText"
                class="cl-input cl-grow"
                @keydown.enter="saveEdit(p)"
                @keydown.esc="editing = ''"
                @click.stop
              />
            </template>
            <template v-else>
              <div class="cl-text">{{ p.text }}</div>
            </template>
            <div class="cl-meta">
              <!-- 分类不在这里重复显示：右侧的分组下拉已经能看出来 -->
              <span>用过 {{ p.useCount || 0 }} 次</span>
              <span v-if="p.lastUsedAt">{{ rel(p.lastUsedAt) }}用过</span>
            </div>
          </div>
          <div class="cl-acts">
            <template v-if="editing === p.id">
              <button class="st-btn primary" @click="saveEdit(p)">保存</button>
              <button class="st-btn ghost" @click="editing = ''">取消</button>
            </template>
            <template v-else>
              <select
                class="cl-input cl-sel cl-cat"
                :value="p.category || ''"
                @change="setCategory(p, $event.target.value)"
              >
                <option value="">未分类</option>
                <option v-for="c in groups" :key="c" :value="c">{{ c }}</option>
              </select>
              <button class="st-btn ghost" @click="startEdit(p)">编辑</button>
              <button class="st-btn danger" @click="del(p)">删除</button>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- ---------- 常用图片（瀑布流，像 Eagle） ---------- -->
    <template v-else>
      <div v-if="!list.length" class="cl-empty">
        <template v-if="q.trim()">没有匹配「{{ q.trim() }}」—— 换个关键词，或点「导入图片」</template>
        <template v-else-if="group !== '*'">
          {{ group ? `「${group}」里还没有图片` : '还没有未分类的图片' }} —— Ctrl+V 存进来的图会归到这个分组
        </template>
        <template v-else>还没有常用图片 —— 按 Ctrl+V 把剪贴板里的图存进来，或点「导入图片」</template>
      </div>

      <div v-else class="wf">
        <figure v-for="m in list" :key="m.id" class="wf-item">
          <div class="wf-pic" title="点击复制图片到剪贴板" @click="copyImage(m)">
            <img :src="thumbUrl(m.id)" :alt="m.name" loading="lazy" />
            <button
              class="wf-star"
              :class="{ on: m.favorite }"
              :title="m.favorite ? '取消置顶' : '置顶'"
              @click.stop="toggleFav(m)"
            >
              {{ m.favorite ? '★' : '☆' }}
            </button>
            <div class="wf-hover">
              <span>点击复制</span>
            </div>
          </div>
          <figcaption>
            <input
              v-if="editing === m.id"
              v-model="editText"
              class="cl-input cl-name-edit"
              @keydown.enter="saveEdit(m)"
              @keydown.esc="editing = ''"
              @blur="saveEdit(m)"
            />
            <div v-else class="wf-name" :title="m.name" @dblclick="startEdit(m)">{{ m.name }}</div>
            <div class="wf-meta">
              <span v-if="m.w">{{ m.w }}×{{ m.h }}</span>
              <span>用过 {{ m.useCount || 0 }} 次</span>
            </div>
            <div class="wf-acts">
              <select
                class="cl-input cl-sel cl-cat"
                :value="m.category || ''"
                @change="setCategory(m, $event.target.value)"
              >
                <option value="">未分类</option>
                <option v-for="c in groups" :key="c" :value="c">{{ c }}</option>
              </select>
              <button class="st-btn ghost" @click="startEdit(m)">改名</button>
              <button class="st-btn danger" @click="del(m)">删除</button>
            </div>
          </figcaption>
        </figure>
      </div>
    </template>

    <transition name="cl-fade">
      <div v-if="toast" class="cl-toast">✓ {{ toast }}</div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import GroupChips from '../../components/GroupChips.vue'
import { settings as appSettings, update as updateSettings } from '../../composables/useSettings'
import {
  addGroup,
  addPhrase,
  filterCollect,
  groupCounts,
  groups,
  images,
  initCollectState,
  installPasteHandler,
  phrases,
  removeGroup,
  removeImage,
  removePhrase,
  renameGroup,
  sortCollect,
  thumbUrl,
  updateImage,
  updatePhrase,
  useImage,
  usePhrase,
  pickImages,
} from '../../composables/useCollect'

const view = ref('phrases')
const q = ref('')
// 分组筛选：'*' 全部 / '' 未分类 / 组名。新建的条目会落进当前选中的分组。
// 与岛内共用同一个记忆值（settings.json 的 phraseGroup），两边切换保持一致。
const group = computed({
  get: () => appSettings.phraseGroup || '*',
  set: (v) => updateSettings({ phraseGroup: String(v || '*') }),
})
const sortMode = ref('smart')

const inputEl = ref(null)
const editing = ref('')
const editText = ref('')
const toast = ref('')
let toastTimer = null

function say(msg) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 1600)
}

const source = computed(() => (view.value === 'phrases' ? phrases.value : images.value))
const list = computed(() =>
  sortCollect(filterCollect(source.value, { q: q.value, group: group.value }), sortMode.value)
)
// 胶囊计数用当前页签的全量数据，不受搜索影响
const counts = computed(() => groupCounts(source.value))

// 记忆的分组被删掉时回落到「全部」
watch(groups, (list) => {
  const g = group.value
  if (g !== '*' && g !== '' && !list.includes(g)) group.value = '*'
})

/* ---------------- 分组管理 ---------------- */
async function onGroupAdd(name) {
  const g = await addGroup(name)
  if (g) say(`已新建分组「${g}」`)
}

async function onGroupRename(from, to) {
  const g = await renameGroup(from, to)
  say(g ? `已重命名为「${g}」` : '重命名失败（可能已有同名分组）')
}

async function onGroupRemove(name) {
  if (confirming.value !== `g:${name}`) {
    confirming.value = `g:${name}`
    say(`再点一次删除分组「${name}」（组内条目会变成未分类）`)
    setTimeout(() => {
      if (confirming.value === `g:${name}`) confirming.value = ''
    }, 2600)
    return
  }
  confirming.value = ''
  const ok = await removeGroup(name)
  if (ok) {
    // 切回「全部」必须放在删除**成功之后**：否则第一次点击（二次确认那一步）
    // 就会切走，胶囊上的 ✕ 随之消失，第二次根本点不到（实测踩过）
    if (group.value === name) group.value = '*'
    say(`已删除分组「${name}」`)
  } else {
    say('删除失败')
  }
}

function rel(ts) {
  const d = Date.now() - Number(ts || 0)
  if (d < 60000) return '刚刚'
  if (d < 3600000) return `${Math.floor(d / 60000)} 分钟前`
  if (d < 86400000) return `${Math.floor(d / 3600000)} 小时前`
  return `${Math.floor(d / 86400000)} 天前`
}

async function addNow(text) {
  const t = String(text || '').trim()
  if (!t) return
  // 落进当前选中的分组（'*' 或 '' 时按未分类）
  const target = group.value && group.value !== '*' ? group.value : ''
  await addPhrase(t, target)
  q.value = ''
  say('已添加')
}

// 回车：**只在没搜到任何匹配时**才添加 —— 管理页上不该"搜着搜着就被改数据"。
// 想明确新增就按「添加」按钮。
async function onEnter() {
  const v = q.value.trim()
  if (!v || view.value !== 'phrases') return
  if (list.value.length) return
  await addNow(v)
}

// 「添加」按钮：常用语页新增当前输入；空输入时聚焦输入框；图片页导入本地图片
async function onPlus() {
  if (view.value === 'images') return doImport()
  const v = q.value.trim()
  if (v) return addNow(v)
  inputEl.value && inputEl.value.focus()
}

function startEdit(item) {
  editing.value = item.id
  editText.value = item.text || item.name || ''
}

async function saveEdit(item) {
  const v = editText.value.trim()
  if (!v) {
    editing.value = ''
    return
  }
  if (item.text !== undefined) await updatePhrase(item.id, { text: v })
  else await updateImage(item.id, { name: v })
  editing.value = ''
  say('已保存')
}

async function toggleFav(item) {
  const patch = { favorite: !item.favorite }
  if (item.text !== undefined) await updatePhrase(item.id, patch)
  else await updateImage(item.id, patch)
}

async function setCategory(item, cat) {
  if (item.text !== undefined) await updatePhrase(item.id, { category: cat })
  else await updateImage(item.id, { category: cat })
}

async function copyPhrase(p) {
  if (editing.value === p.id) return
  const ok = await usePhrase(p.id)
  say(ok ? '已复制到剪贴板' : '复制失败')
}

async function copyImage(m) {
  const ok = await useImage(m.id)
  say(ok ? '已复制图片，可直接粘贴' : '复制失败')
}

async function del(item) {
  const isImage = item.text === undefined
  // 不用 window.prompt/confirm：Electron 里这些原生弹窗会被静音或直接不可用
  if (!confirming.value || confirming.value !== item.id) {
    confirming.value = item.id
    say(isImage ? '再点一次删除这张图片' : '再点一次删除这条常用语')
    setTimeout(() => {
      if (confirming.value === item.id) confirming.value = ''
    }, 2600)
    return
  }
  confirming.value = ''
  if (isImage) await removeImage(item.id)
  else await removePhrase(item.id)
  say('已删除')
}
const confirming = ref('')

async function doImport() {
  const r = await pickImages()
  if (r && r.ok) say(`已导入 ${r.added ? r.added.length : 0} 张`)
}

// Ctrl+V：在「常用图片」页直接把剪贴板里的图存成常用图 ——
// 刚截完图（截图工具已把图放进剪贴板）就不用再去点岛上的星标了
let offPaste = null
onMounted(() => {
  initCollectState()
  offPaste = installPasteHandler(
    () => view.value === 'images',
    (r) => {
      if (r && r.ok) say('已从剪贴板保存 1 张')
      else if (r && r.error === 'EMPTY') say('剪贴板里没有图片')
      else say('保存失败')
    }
  )
})
onUnmounted(() => {
  if (offPaste) offPaste()
})
</script>

<style scoped>
.collect {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 20px;
}

/* ---------- 顶部条 ---------- */
.cl-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.cl-seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--st-fill, rgba(255, 255, 255, 0.06));
}
.cl-seg button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--st-text-2, rgba(255, 255, 255, 0.6));
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.cl-seg button:hover {
  color: var(--st-text, #fff);
}
.cl-seg button.on {
  background: var(--st-card, rgba(255, 255, 255, 0.12));
  color: var(--st-text, #fff);
  font-weight: 600;
}
.cl-seg em {
  font-style: normal;
  font-size: 11px;
  opacity: 0.55;
}
.cl-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* ---------- 输入控件 ---------- */
.cl-input {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--st-line, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  background: var(--st-field, rgba(255, 255, 255, 0.05));
  color: var(--st-text, #fff);
  font-size: 12.5px;
  outline: none;
}
.cl-input:focus {
  border-color: rgba(90, 200, 250, 0.55);
}
.cl-search {
  width: 180px;
}
.cl-sel {
  padding-right: 6px;
  cursor: pointer;
}
.cl-grow {
  flex: 1;
  min-width: 160px;
}
.cl-add {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ---------- 常用语列表 ---------- */
.cl-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--st-line, rgba(255, 255, 255, 0.1));
  border-radius: 10px;
  background: var(--st-card, rgba(255, 255, 255, 0.04));
  transition: border-color 0.15s ease, background 0.15s ease;
}
.cl-row:hover {
  background: var(--st-card-hover, rgba(255, 255, 255, 0.07));
}
.cl-star {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.cl-star:hover {
  background: rgba(255, 255, 255, 0.1);
}
.cl-star.on {
  color: #ffd60a;
}
.cl-body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.cl-text {
  font-size: 13px;
  line-height: 1.45;
  color: var(--st-text, #fff);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
.cl-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--st-text-3, rgba(255, 255, 255, 0.38));
}
.cl-acts {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.cl-cat {
  height: 26px;
  font-size: 11.5px;
}

/* ---------- 图片瀑布流（Eagle 那种：图片为主、信息克制） ---------- */
.wf {
  column-width: 210px;
  column-gap: 12px;
}
.wf-item {
  break-inside: avoid;
  margin: 0 0 12px;
  border: 1px solid var(--st-line, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  background: var(--st-card, rgba(255, 255, 255, 0.04));
  overflow: hidden;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.wf-item:hover {
  border-color: rgba(90, 200, 250, 0.45);
}
.wf-pic {
  position: relative;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.25);
  line-height: 0;
}
.wf-pic img {
  width: 100%;
  display: block;
}
.wf-star {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
}
.wf-item:hover .wf-star,
.wf-star.on {
  opacity: 1;
}
.wf-star.on {
  color: #ffd60a;
}
.wf-hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.wf-pic:hover .wf-hover {
  opacity: 1;
}
.wf-item figcaption {
  padding: 8px 10px 9px;
}
.wf-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--st-text, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}
.cl-name-edit {
  width: 100%;
  height: 24px;
  font-size: 12.5px;
}
.wf-meta {
  display: flex;
  gap: 8px;
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--st-text-3, rgba(255, 255, 255, 0.38));
}
.wf-acts {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.wf-item:hover .wf-acts {
  opacity: 1;
}
.wf-acts .cl-cat {
  flex: 1;
  min-width: 0;
}

/* 列表里的删除按钮：默认描边、悬停才实心 —— 每行一块实心红在长列表里太抢眼 */
.cl-acts .st-btn.danger {
  background: transparent;
  border-color: rgba(255, 69, 58, 0.38);
  color: #ff6961;
}
.cl-acts .st-btn.danger:hover {
  background: rgba(255, 69, 58, 0.92);
  border-color: transparent;
  color: #fff;
}

/* 分组胶囊：与上方工具栏、下方输入行保持一致的间距 */
.cl-groups {
  padding: 0 2px;
}

/* ---------- 空态与提示 ---------- */
.cl-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
  font-size: 11.5px;
  color: var(--st-text-3, rgba(255, 255, 255, 0.42));
}
.cl-hint kbd {
  padding: 1px 5px;
  border: 1px solid var(--st-line, rgba(255, 255, 255, 0.16));
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.06);
  font-family: inherit;
  font-size: 10.5px;
  color: var(--st-text-2, rgba(255, 255, 255, 0.7));
}
.cl-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--st-text-3, rgba(255, 255, 255, 0.35));
}
.cl-toast {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 12.5px;
  pointer-events: none;
}
.cl-fade-enter-active,
.cl-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.cl-fade-enter-from,
.cl-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
