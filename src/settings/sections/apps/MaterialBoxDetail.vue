<template>
  <Card title="打包" icon="package">
    <Row label="打包完成后打开文件夹" desc="ZIP 生成后自动在资源管理器中定位">
      <Toggle
        :model-value="s.mboxOpenAfterZip"
        @update:model-value="set({ mboxOpenAfterZip: $event })"
      />
    </Row>
  </Card>

  <Card title="保存位置" icon="folder">
    <Row label="默认保存位置" stack>
      <Radio
        :model-value="s.mboxSaveDir"
        :options="[
          { value: 'auto', label: '第一个文件所在目录' },
          { value: 'desktop', label: '桌面' },
          { value: 'downloads', label: '下载' },
        ]"
        @update:model-value="set({ mboxSaveDir: $event })"
      />
    </Row>
    <Row label="同名文件" stack>
      <Radio
        :model-value="s.mboxSameName"
        :options="[
          { value: 'rename', label: '自动重命名' },
          { value: 'ask', label: '提示确认' },
        ]"
        @update:model-value="set({ mboxSameName: $event })"
      />
    </Row>
  </Card>
</template>

<script setup>
import Card from '../../components/Card.vue'
import Row from '../../components/Row.vue'
import Toggle from '../../components/Toggle.vue'
import Radio from '../../components/Radio.vue'
import { settings, update } from '../../../composables/useSettings'

const s = settings
const set = (patch) => update(patch)
</script>
