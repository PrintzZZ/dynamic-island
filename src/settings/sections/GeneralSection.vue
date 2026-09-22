<template>
  <Card title="启动设置" icon="power">
    <Row label="开机自动启动" desc="系统启动后自动运行灵动岛">
      <Toggle :model-value="s.autostart" @update:model-value="set({ autostart: $event })" />
    </Row>
  </Card>

  <Card title="灵动岛" icon="sparkle">
    <Row label="启动后显示灵动岛" desc="启动软件后自动显示灵动岛">
      <Toggle :model-value="s.showOnStart" @update:model-value="set({ showOnStart: $event })" />
    </Row>
    <Row label="启动位置" stack>
      <Radio
        :model-value="s.startPosition"
        :options="[
          { value: 'last', label: '上次位置' },
          { value: 'center', label: '当前屏幕顶部居中' },
        ]"
        @update:model-value="set({ startPosition: $event })"
      />
    </Row>
    <Row v-if="displays.length > 1" label="当前显示器" desc="自动选择与灵动岛最近的显示器">
      <Select
        :model-value="s.displayId"
        :options="displayOptions"
        @update:model-value="set({ displayId: $event })"
      />
    </Row>
  </Card>

  <Card title="基本行为" icon="cursor">
    <Row label="鼠标悬停时展开" desc="指针移到胶囊上时展开完整界面">
      <Toggle :model-value="s.hoverExpand" @update:model-value="set({ hoverExpand: $event })" />
    </Row>
    <Row label="鼠标移出后自动收起" desc="指针离开后缩回胶囊">
      <Toggle :model-value="s.autoCollapse" @update:model-value="set({ autoCollapse: $event })" />
    </Row>
    <Row label="按 Esc 收起" desc="展开状态下按 Esc 快速缩回">
      <Toggle :model-value="s.escCollapse" @update:model-value="set({ escCollapse: $event })" />
    </Row>
  </Card>

  <Card title="窗口" icon="window">
    <Row label="关闭主面板时" desc="点展开态右上角 ✕ 之后做什么">
      <Radio
        :model-value="s.closeAction"
        :options="[
          { value: 'tray', label: '隐藏到托盘' },
          { value: 'quit', label: '直接退出' },
        ]"
        @update:model-value="set({ closeAction: $event })"
      />
    </Row>
  </Card>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import Card from '../components/Card.vue'
import Row from '../components/Row.vue'
import Toggle from '../components/Toggle.vue'
import Radio from '../components/Radio.vue'
import Select from '../components/Select.vue'
import { settings, update, listDisplays } from '../../composables/useSettings'

const s = settings
const set = (patch) => update(patch)

const displays = ref([])
onMounted(async () => {
  displays.value = await listDisplays()
})

// 「自动」始终在最前，其余按显示器列出
const displayOptions = computed(() => [
  { value: 'auto', label: '自动' },
  ...displays.value.map((d) => ({ value: d.id, label: d.label })),
])
</script>
