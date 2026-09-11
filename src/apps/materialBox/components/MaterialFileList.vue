<template>
  <div class="file-list">
    <TransitionGroup name="row">
      <div
        v-for="row in rows"
        :key="row.key"
        class="row"
        :class="{ pending: row.kind === 'pending', missing: row.file && row.file.missing }"
      >
        <!-- 待收集的清单项 -->
        <template v-if="row.kind === 'pending'">
          <span class="tile pending-tile"><span class="ring" /></span>
          <div class="body">
            <div class="name">{{ row.label }}</div>
            <div class="meta">待收集</div>
          </div>
        </template>

        <!-- 已收集的文件 -->
        <template v-else>
          <MaterialTypeIcon :ext="row.file.ext" />
          <div class="body">
            <div class="name">{{ row.file.name }}</div>
            <div class="meta">
              <template v-if="row.file.missing">
                <Icon name="warning" class="warn-ico" />
                <span class="warn-text">文件不存在</span>
              </template>
              <template v-else>{{ fmtSize(row.file.size) }}</template>
            </div>
          </div>

          <div v-if="row.file.missing" class="actions">
            <button class="mini" title="重新定位" @click.stop="$emit('relocate', row.file.id)">
              <Icon name="folder-open" class="mini-ico" />
            </button>
            <button class="mini danger" title="移除" @click.stop="$emit('remove', row.file.id)">
              <Icon name="close" class="mini-ico" />
            </button>
          </div>

          <template v-else>
            <button class="mini ghost" title="打开所在位置" @click.stop="$emit('reveal', row.file.path)">
              <Icon name="folder-open" class="mini-ico" />
            </button>
            <button class="mini ghost danger" title="移除" @click.stop="$emit('remove', row.file.id)">
              <Icon name="close" class="mini-ico" />
            </button>
            <span class="check"><Icon name="check" class="check-ico" /></span>
          </template>
        </template>
      </div>
    </TransitionGroup>

    <div v-if="!rows.length" class="empty">
      <Icon name="drop-in" class="empty-ico" />
      <div class="empty-text">把文件拖到灵动岛上</div>
      <div class="empty-hint">也可以点下面的「继续添加」</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../../components/Icon.vue'
import MaterialTypeIcon from './MaterialTypeIcon.vue'

const props = defineProps({
  task: { type: Object, default: null },
})

defineEmits(['remove', 'reveal', 'relocate'])

// 列表 = 清单项（已收集的显示为文件，未收集的显示为待收集）+ 清单外的额外文件
const rows = computed(() => {
  const t = props.task
  if (!t) return []
  const out = []
  const used = new Set()
  for (const r of t.required || []) {
    const f = r.fileId ? t.files.find((x) => x.id === r.fileId) : null
    if (f) {
      used.add(f.id)
      out.push({ key: `r-${r.id}`, kind: 'file', file: f })
    } else {
      out.push({ key: `r-${r.id}`, kind: 'pending', label: r.name })
    }
  }
  for (const f of t.files || []) {
    if (!used.has(f.id)) out.push({ key: `f-${f.id}`, kind: 'file', file: f })
  }
  return out
})

function fmtSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}
</script>

<style scoped>
.file-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 12px;
  transition: background 0.16s ease;
}
.row:hover {
  background: rgba(255, 255, 255, 0.06);
}
.row.missing {
  background: rgba(255, 159, 10, 0.08);
}

.body {
  flex: 1;
  min-width: 0;
}
.name {
  font-size: 12.5px;
  color: #f5f5f7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row.pending .name {
  color: rgba(255, 255, 255, 0.55);
}
.meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.warn-ico {
  width: 10px;
  height: 10px;
}
.warn-text {
  color: #ff9f0a;
}

/* 待收集：虚线圆环 */
.tile {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  flex-shrink: 0;
}
.pending-tile {
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ring {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px dashed rgba(255, 255, 255, 0.35);
}

.check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #30d158;
  color: #0a0a0a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  animation: pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.check-ico {
  width: 12px;
  height: 12px;
  stroke-width: 3;
}
@keyframes pop {
  from {
    transform: scale(0);
  }
  to {
    transform: scale(1);
  }
}

.actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.mini {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.16s ease, color 0.16s ease, opacity 0.16s ease;
}
.mini-ico {
  width: 12px;
  height: 12px;
}
.mini.ghost {
  opacity: 0;
}
.row:hover .mini.ghost {
  opacity: 1;
}
.mini:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
}
.mini.danger:hover {
  background: var(--red);
  color: #fff;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: rgba(255, 255, 255, 0.4);
}
.empty-ico {
  width: 26px;
  height: 26px;
  color: rgba(255, 255, 255, 0.25);
}
.empty-text {
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
}
.empty-hint {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.3);
}

/* 条目入场：fade + slide + scale，克制不夸张 */
.row-enter-active {
  transition: opacity 0.24s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}
.row-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
  position: absolute;
  width: calc(100% - 4px);
}
.row-move {
  transition: transform 0.24s ease;
}
.row-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
.row-leave-to {
  opacity: 0;
  transform: translateX(18px);
}
</style>
