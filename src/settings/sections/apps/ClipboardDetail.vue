<template>
  <Card title="历史记录" icon="clipboard">
    <Row label="记录复制内容" desc="后台监听系统剪贴板并自动去重">
      <Toggle
        :model-value="s.clipboardEnabled"
        @update:model-value="set({ clipboardEnabled: $event })"
      />
    </Row>
    <Row label="历史记录上限" desc="超出后自动丢弃最旧的记录">
      <Select
        :model-value="s.clipboardLimit"
        :options="limitOptions"
        :disabled="!s.clipboardEnabled"
        @update:model-value="set({ clipboardLimit: $event })"
      />
    </Row>
    <Row label="重复内容" stack>
      <Radio
        :model-value="s.clipDedupe"
        :options="[
          { value: 'move-top', label: '提到最前' },
          { value: 'ignore', label: '忽略重复' },
        ]"
        @update:model-value="set({ clipDedupe: $event })"
      />
    </Row>
  </Card>

  <Card title="链接提醒" icon="link">
    <Row label="复制链接时提醒" desc="识别到网址时让灵动岛弹出通知条，可一键打开">
      <Toggle
        :model-value="s.clipRemindLink"
        @update:model-value="set({ clipRemindLink: $event })"
      />
    </Row>
  </Card>
</template>

<script setup>
import Card from '../../components/Card.vue'
import Row from '../../components/Row.vue'
import Toggle from '../../components/Toggle.vue'
import Radio from '../../components/Radio.vue'
import Select from '../../components/Select.vue'
import { settings, update } from '../../../composables/useSettings'

const s = settings
const set = (patch) => update(patch)
const limitOptions = [20, 40, 60, 100, 200].map((n) => ({ value: n, label: `${n} 条` }))
</script>
