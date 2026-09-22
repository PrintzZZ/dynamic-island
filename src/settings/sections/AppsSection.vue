<template>
  <!-- 子设置页 -->
  <AppDetail v-if="sub" :which="sub" @back="sub = ''" />

  <!-- 目录 -->
  <template v-else>
    <div class="st-app-summary">
      已启用 {{ enabledCount }} 个工作空间 · {{ enabledSubTotal }} 个小功能
    </div>

    <div v-for="m in APP_MODULES" :key="m.id" class="st-app-group">
      <div class="st-app-group-head">
        <Icon :name="m.icon" />
        <span class="st-app-group-name">{{ m.name }}</span>
        <span class="st-app-group-count">{{ subCount(m) }}/{{ m.subs.length }}</span>
      </div>
      <Card>
        <Row :label="`启用${m.name}模块`" :desc="m.desc">
          <Toggle :model-value="enabled(m.id)" @update:model-value="toggleModule(m.id, $event)" />
        </Row>
        <!-- 每个小功能都能单独启停；带 › 的还能进详细设置 -->
        <div class="st-subs" :class="{ dim: !enabled(m.id) }">
          <div v-for="item in m.subs" :key="item.id" class="st-sub" :class="{ on: subOn(item.id) }">
            <button
              class="st-sub-box"
              :title="subOn(item.id) ? '点击停用' : '点击启用'"
              :disabled="!enabled(m.id)"
              @click="toggleSub(item.id, !subOn(item.id))"
            >
              <Icon name="check" />
            </button>
            <button
              class="st-sub-name"
              :disabled="!enabled(m.id)"
              @click="toggleSub(item.id, !subOn(item.id))"
            >
              {{ item.name }}
            </button>
            <button
              v-if="item.detail"
              class="st-sub-more"
              title="详细设置"
              :disabled="!enabled(m.id) || !subOn(item.id)"
              @click="openSub(item, m.id)"
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        </div>
      </Card>
    </div>

    <div class="st-card-foot" style="padding: 0 2px">
      关掉的小功能不会出现在灵动岛里；「时间」四个模式关掉几个，模式切换器里就少几个。
    </div>
  </template>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Card from '../components/Card.vue'
import Row from '../components/Row.vue'
import Toggle from '../components/Toggle.vue'
import Icon from '../../components/Icon.vue'
import AppDetail from './AppDetail.vue'
import { settings, update, SUB_ITEMS } from '../../composables/useSettings'
import { APP_MODULES } from '../apps'

const s = settings
const set = (patch) => update(patch)
const sub = ref('')

const enabled = (id) => s.enabledApps?.[id] !== false
const enabledCount = computed(() => APP_MODULES.filter((m) => enabled(m.id)).length)

// 小功能启停
const subOn = (id) => s.enabledSubs?.[id] !== false
const subCount = (m) => m.subs.filter((x) => subOn(x.id)).length
const enabledSubTotal = computed(() =>
  Object.keys(SUB_ITEMS).filter((id) => subOn(id) && enabled(SUB_ITEMS[id].module)).length
)

function toggleSub(id, on) {
  // 至少留一个：把某个模块下的最后一个小功能关掉没有意义（岛上会整块消失）
  const mod = SUB_ITEMS[id]?.module
  if (mod && !on) {
    const left = Object.entries(SUB_ITEMS).filter(
      ([sid, it]) => it.module === mod && sid !== id && subOn(sid)
    ).length
    if (left === 0) return
  }
  set({ enabledSubs: { ...s.enabledSubs, [id]: !!on } })
}

function openSub(item, moduleId) {
  if (!item.detail || !enabled(moduleId) || !subOn(item.id)) return
  sub.value = item.detail
}

function toggleModule(id, on) {
  // 关掉最后一个模块没有意义（标签栏会空掉），直接忽略
  if (!on && enabled(id) && enabledCount.value <= 1) return
  set({ enabledApps: { ...s.enabledApps, [id]: on } })
}

// 子页标题上报给父级：父级据此决定是否让出页面标题
const DETAIL_TITLES = {
  clipboard: '剪贴板设置',
  time: '时间设置',
  materialbox: '材料箱设置',
}
const emit = defineEmits(['detail'])
watch(sub, (v) => emit('detail', DETAIL_TITLES[v] || ''), { immediate: true })

// 切页签时由父级调用，把子页收回目录
defineExpose({ back: () => (sub.value = '') })
</script>

<style scoped>
.st-app-group-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--st-text-3);
  font-variant-numeric: tabular-nums;
}
.st-subs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 14px;
  transition: opacity 0.15s ease;
}
.st-subs.dim {
  opacity: 0.42;
}
.st-sub {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 4px 3px 6px;
  border-radius: 9px;
  border: 1px solid var(--st-line);
  background: var(--st-card);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.st-sub:hover {
  background: var(--st-hover-3);
  border-color: var(--st-line);
}
.st-sub-box {
  width: 15px;
  height: 15px;
  border-radius: 5px;
  flex-shrink: 0;
  border: 1.5px solid var(--st-dot);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.st-sub-box svg {
  width: 8px;
  height: 8px;
  color: #fff;
  opacity: 0;
  transition: opacity 0.13s ease;
}
.st-sub.on .st-sub-box {
  background: var(--st-blue);
  border-color: var(--st-blue);
}
.st-sub.on .st-sub-box svg {
  opacity: 1;
}
.st-sub-name {
  padding: 0 4px;
  font-size: 12px;
  color: var(--st-text-3);
  cursor: pointer;
  white-space: nowrap;
}
.st-sub.on .st-sub-name {
  color: var(--st-text);
}
.st-sub-more {
  display: flex;
  align-items: center;
  padding: 0 2px;
  color: var(--st-text-3);
  cursor: pointer;
}
.st-sub-more svg {
  width: 11px;
  height: 11px;
}
.st-sub-more:hover:not(:disabled) {
  color: var(--st-text);
}
.st-sub-box:disabled,
.st-sub-name:disabled,
.st-sub-more:disabled {
  cursor: not-allowed;
}
</style>
