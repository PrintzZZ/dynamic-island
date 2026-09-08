<template>
  <div class="phrases-app">
    <div class="toolbar">
      <div class="title">
        常用语
        <span v-if="phrases.length" class="count">{{ phrases.length }}</span>
      </div>
    </div>

    <!-- 快捷添加 -->
    <div class="add-bar">
      <input
        v-model="draft"
        class="add-input"
        placeholder="输入常用语，回车添加…"
        @keydown.enter="submit"
      />
      <button class="add-btn" title="添加" @click="submit">
        <Icon name="plus" class="add-ico" />
      </button>
    </div>

    <div v-if="phrases.length" class="list">
      <TransitionGroup name="phrase">
        <div
          v-for="p in phrases"
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
          <button class="del" title="删除" @click.stop="removePhrase(p.id)">
            <Icon name="close" class="del-ico" />
          </button>
        </div>
      </TransitionGroup>
    </div>

    <div v-else class="empty">
      <div class="empty-icon">
        <Icon name="quote" class="empty-ico" />
      </div>
      <div class="empty-text">还没有常用语</div>
      <div class="empty-hint">在上方输入框添加，点击条目即可复制</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import Icon from '../../components/Icon.vue'
import { usePhrases } from './usePhrases'
import { sfx } from '../../utils/sound'

const { phrases, addPhrase, removePhrase } = usePhrases()

const draft = ref('')
const copiedId = ref(null)
let copiedTimer = null

function submit() {
  if (!draft.value.trim()) return
  addPhrase(draft.value)
  draft.value = ''
}

async function copy(p) {
  try {
    if (window.api && window.api.copyText) {
      await window.api.copyText(p.text)
    } else {
      await navigator.clipboard.writeText(p.text)
    }
    sfx.tick()
    copiedId.value = p.id
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedId.value = null
    }, 1200)
  } catch {
    // 复制失败时静默忽略
  }
}

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
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
  background: #bf5af2;
  border-radius: 999px;
  padding: 1px 8px;
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
  font-size: 13px;
  color: #f5f5f7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
