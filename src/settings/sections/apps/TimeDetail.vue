<template>
  <Card title="默认视图" icon="clock">
    <Row label="默认时间模式" desc="打开时间应用时先显示哪一页">
      <Select
        :model-value="s.timeDefaultMode"
        :options="[
          { value: 'clock', label: '日常时间' },
          { value: 'countdown', label: '倒计时' },
          { value: 'reminder', label: '提醒' },
          { value: 'focus', label: '专注' },
        ]"
        @update:model-value="set({ timeDefaultMode: $event })"
      />
    </Row>
  </Card>

  <Card title="工作时间" icon="sun">
    <Row label="上下班时间" desc="午休区间不计入工作时长">
      <div class="st-time-row">
        <input class="st-time" type="time" :value="s.timeWorkStart" @change="set({ timeWorkStart: $event.target.value })" />
        <span class="st-time-sep">—</span>
        <input class="st-time" type="time" :value="s.timeWorkEnd" @change="set({ timeWorkEnd: $event.target.value })" />
      </div>
    </Row>
    <Row label="午休">
      <div class="st-time-row">
        <input class="st-time" type="time" :value="s.timeLunchStart" @change="set({ timeLunchStart: $event.target.value })" />
        <span class="st-time-sep">—</span>
        <input class="st-time" type="time" :value="s.timeLunchEnd" @change="set({ timeLunchEnd: $event.target.value })" />
      </div>
    </Row>
  </Card>

  <Card title="提醒默认值" icon="bell">
    <Row label="默认催办次数" desc="新建提醒时的初始值">
      <Select
        :model-value="s.timeRepeatCount"
        :options="countOptions"
        @update:model-value="set({ timeRepeatCount: $event })"
      />
    </Row>
    <Row label="提醒间隔" desc="未确认时两次提醒之间的间隔">
      <Select
        :model-value="s.timeRepeatInterval"
        :options="intervalOptions"
        @update:model-value="set({ timeRepeatInterval: $event })"
      />
    </Row>
  </Card>

  <Card title="专注" icon="target">
    <Row label="默认专注时长" desc="番茄钟一轮的长度">
      <Select
        :model-value="s.timeFocusMinutes"
        :options="focusOptions"
        @update:model-value="set({ timeFocusMinutes: $event })"
      />
    </Row>
  </Card>
</template>

<script setup>
import Card from '../../components/Card.vue'
import Row from '../../components/Row.vue'
import Select from '../../components/Select.vue'
import { settings, update } from '../../../composables/useSettings'

const s = settings
const set = (patch) => update(patch)

const countOptions = [
  { value: 'off', label: '仅提醒一次' },
  { value: 1, label: '1 次' },
  { value: 3, label: '3 次' },
  { value: 'unlimited', label: '直到确认' },
]
const intervalOptions = [
  { value: 30, label: '30 秒' },
  { value: 60, label: '1 分钟' },
  { value: 300, label: '5 分钟' },
]
const focusOptions = [15, 20, 25, 30, 45, 60].map((n) => ({ value: n, label: `${n} 分钟` }))
</script>
