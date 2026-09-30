<template>
  <div class="clip-app">
    <div class="toolbar">
      <div class="title">
        剪贴板
        <span v-if="items.length" class="count">{{ items.length }}</span>
      </div>
      <button v-if="items.length" class="clear-btn" title="清空历史" @click="clearAll">
        <Icon name="trash" class="clear-ico" />
        清空
      </button>
    </div>
    <!-- 不需要搜索 -->
    <!-- <div class="search-bar">
      <Icon name="search" class="search-ico" />
      <input v-model="keyword" class="search-input" placeholder="搜索剪贴板…" />
      <button v-if="keyword" class="search-clear" title="清除" @click="keyword = ''">
        <Icon name="close" class="search-clear-ico" />
      </button>
    </div> -->

    <!-- 「最近图片」已移除：改为在「常用图片」页直接 Ctrl+V 粘贴剪贴板里的图并保存，
         不用再记得点星标，剪贴板页也更清爽。 -->

    <div v-if="filtered.length" class="list">
      <TransitionGroup name="clip">
        <div
          v-for="it in filtered"
          :key="it.id"
          class="clip-item"
          :class="{ copied: copiedId === it.id }"
          :title="it.url ? '点击复制 · 右侧可打开链接' : '点击复制'"
          @click="copyItem(it)"
        >
          <div class="kind" :class="it.kind || 'text'">
            <Icon :name="kindIcon(it)" class="kind-ico" />
          </div>

          <div class="body">
            <div class="text">{{ it.text }}</div>
            <div class="meta">
              {{ fmtTime(it.at)
              }}<span v-if="typeLabel(it)" class="meta-link"> · {{ typeLabel(it) }}</span>
            </div>
          </div>

          <Transition name="pop">
            <span v-if="copiedId === it.id" class="copied-tag">
              <Icon name="check" class="copied-ico" />
              <span class="copied-text">已复制</span>
            </span>
          </Transition>

          <!-- 识别到电话 / 快递单号 / 姓名+电话+地址：
               点这里复制**标准化后**的内容，点条目本身仍是原文 -->
          <button
            v-if="it.quick"
            class="act quick"
            :title="`快捷复制：${it.quickLabel}`"
            @click.stop="copyQuick(it)"
          >
            <Icon name="sparkle" class="act-ico" />
          </button>

          <!-- 识别到网址：一键跳转 -->
          <button v-if="it.url" class="act jump" title="打开链接" @click.stop="openItem(it)">
            <Icon name="external" class="act-ico" />
          </button>

          <button class="act del" title="删除" @click.stop="removeItem(it.id)">
            <Icon name="close" class="act-ico" />
          </button>
        </div>
      </TransitionGroup>
    </div>

    <div v-else class="empty">
      <div class="empty-icon">
        <Icon :name="keyword ? 'search' : 'clipboard'" class="empty-ico" />
      </div>
      <div class="empty-text">{{ keyword ? '没有匹配的记录' : '还没有剪贴板记录' }}</div>
      <div class="empty-hint">复制任意内容（文字或图片）后会自动出现在这里</div>
    </div>

    <div class="foot">
      <div class="foot-label">
        <!-- <Icon name="link" class="foot-ico" />
        <span>复制到链接时提醒我</span> -->
      </div>
      <!-- <button
        class="switch"
        :class="{ on: settings.alertOnLink }"
        :aria-pressed="String(settings.alertOnLink)"
        title="开关链接提醒"
        @click="settings.alertOnLink = !settings.alertOnLink"
      >
        <span class="knob" />
      </button> -->
    </div>

    <!-- 复制提示：整页右下角浮一条，行内的高亮容易被列表本身淹没 -->
    <Transition name="toast">
      <div v-if="toast" class="clip-toast">
        <Icon name="check" class="clip-toast-ico" />
        <span>{{ toast }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import Icon from '../../../../components/Icon.vue'
import { useClipboard } from './useClipboard'
import { sfx } from '../../../../utils/sound'

const { items, settings, copy, open, remove, clear } = useClipboard()

// 最近图片的展示已移除（改在「常用图片」页 Ctrl+V 保存），这里只留常量说明位置

const keyword = ref('')
const copiedId = ref(null)
let copiedTimer = null
const toast = ref(null)
let toastTimer = null

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return items.value
  return items.value.filter((x) => x.text.toLowerCase().includes(k))
})

function fmtTime(t) {
  const d = new Date(t)
  const pad = (x) => String(x).padStart(2, '0')
  const sameDay = d.toDateString() === new Date().toDateString()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return sameDay ? hm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

function flashCopied(id) {
  copiedId.value = id
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copiedId.value = null
  }, 1600)
}

async function copyItem(it) {
  const ok = await copy(it)
  if (!ok) return
  sfx.tick()
  flashCopied(it.id)
  showToast('已复制到剪贴板')
}

// 底部提示条：复制成功 / 打开链接 都给一条明确反馈
function showToast(text) {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 1600)
}

async function openItem(it) {
  const ok = await open(it)
  if (!ok) return
  sfx.tick()
  showToast('已在浏览器打开')
}

// 快捷复制：复制标准化后的内容（标准地址 / 纯号码 / 纯单号），条目原文不动
async function copyQuick(it) {
  const api = typeof window !== 'undefined' ? window.api : null
  if (!api || !api.clipCopy || !it || !it.quick) return
  const ok = await api.clipCopy({ text: it.quick })
  if (!ok) return
  sfx.tick()
  flashCopied(it.id)
  showToast(`已复制${it.quickLabel || '标准格式'}`)
}

// 类型标签与图标：目前识别 链接 / 电话 / 快递单号 / 地址（姓名+电话+地址）
const TYPE_LABEL = { link: '链接', phone: '电话', express: '快递单号', address: '地址' }
const typeLabel = (it) => TYPE_LABEL[it && it.kind] || ''
function kindIcon(it) {
  if (!it) return 'clipboard'
  if (it.kind === 'link') return 'link'
  if (it.kind === 'phone') return 'target'
  if (it.kind === 'express') return 'package'
  if (it.kind === 'address') return 'window'
  return 'clipboard'
}

function removeItem(id) {
  remove(id)
}

function clearAll() {
  clear()
}

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<style scoped>
.clip-app {
  position: relative;
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
  background: #5ac8fa;
  border-radius: 999px;
  padding: 1px 8px;
}
.clear-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: color 0.18s ease, background 0.18s ease;
}
.clear-ico {
  width: 12px;
  height: 12px;
}
.clear-btn:hover {
  color: #ff453a;
  background: rgba(255, 69, 58, 0.12);
}

/* 搜索 */
.search-bar {
  position: relative;
  display: flex;
  align-items: center;
  margin: 0 8px 10px;
  flex-shrink: 0;
}
.search-ico {
  position: absolute;
  left: 11px;
  width: 13px;
  height: 13px;
  color: rgba(255, 255, 255, 0.35);
  pointer-events: none;
}
.search-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: #f5f5f7;
  outline: none;
  padding: 8px 30px 8px 31px;
  font-size: 13px;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.search-input:focus {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
}
.search-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}
.search-clear {
  position: absolute;
  right: 8px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search-clear-ico {
  width: 9px;
  height: 9px;
}

/* 列表 */
.list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.clip-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 0.18s ease;
}
.clip-item:hover {
  background: rgba(255, 255, 255, 0.09);
}
.clip-item.copied {
  background: rgba(90, 200, 250, 0.16);
}
.kind {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.kind.link {
  background: rgba(90, 200, 250, 0.16);
  color: #5ac8fa;
}
.kind-ico {
  width: 14px;
  height: 14px;
}
.body {
  flex: 1;
  min-width: 0;
}
.text {
  font-size: 12.5px;
  line-height: 1.35;
  color: #f5f5f7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.meta {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 3px;
}
.meta-link {
  color: rgba(90, 200, 250, 0.75);
}

/* 行内操作按钮 */
.act {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}
/* 「快捷复制」按钮：复制的是标准化后的内容，用强调色区分开 */
.act.quick {
  color: #bf5af2;
}
.act.quick:hover {
  background: rgba(191, 90, 242, 0.22);
}

.act-ico {
  width: 12px;
  height: 12px;
}
/* 跳转按钮：常驻可见，因为是主要动作 */
.jump {
  background: rgba(90, 200, 250, 0.18);
  color: #5ac8fa;
}
.jump:hover {
  background: #5ac8fa;
  color: #0a0a0a;
  transform: scale(1.12);
}
/* 删除按钮：悬停才出现，避免列表太吵 */
.del {
  color: rgba(255, 255, 255, 0.35);
  opacity: 0;
}
.clip-item:hover .del {
  opacity: 1;
}
.del:hover {
  background: var(--red);
  color: #fff;
}
/* 行内「已复制」：带文字，比只有一个勾更明确 */
.copied-tag {
  position: absolute;
  right: 12px;
  bottom: 6px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px 1px 5px;
  border-radius: 999px;
  background: rgba(90, 200, 250, 0.18);
  font-size: 10px;
  font-weight: 700;
  color: #5ac8fa;
  white-space: nowrap;
}
.copied-text {
  font-size: 10px;
}
.copied-ico {
  width: 10px;
  height: 10px;
  stroke-width: 3;
}

/* 底部浮层提示：整页级别的反馈，不会被列表本身淹没 */
.clip-toast {
  position: absolute;
  left: 50%;
  bottom: 62px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  background: rgba(28, 28, 32, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  color: #f5f5f7;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  z-index: 20;
}
.clip-toast-ico {
  width: 12px;
  height: 12px;
  color: #30d158;
  stroke-width: 3;
}
.toast-enter-active {
  transition: opacity 0.18s ease, transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px) scale(0.94);
}

/* 空态 */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.5);
  padding-bottom: 26px;
}
.empty-icon {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5ac8fa;
  animation: float 3s ease-in-out infinite;
}
.empty-ico {
  width: 26px;
  height: 26px;
  stroke-width: 1.8;
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

/* 底部设置 */
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  background: linear-gradient(to bottom, transparent, #000);
}
.foot-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.foot-ico {
  width: 12px;
  height: 12px;
  color: #5ac8fa;
}
.switch {
  position: relative;
  width: 40px;
  height: 23px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  padding: 0;
  transition: background 0.22s ease;
  flex-shrink: 0;
}
.switch.on {
  background: #5ac8fa;
}
.knob {
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.switch.on .knob {
  transform: translateX(17px);
}

/* 过渡 */
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
.clip-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.clip-leave-active {
  transition: all 0.22s ease;
}
.clip-move {
  transition: transform 0.3s ease;
}
.clip-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.clip-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

</style>
