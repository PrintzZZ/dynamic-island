<template>
  <Card title="主题" icon="palette">
    <Row label="主题" desc="灵动岛与设置面板的明暗">
      <Radio
        :model-value="s.theme"
        :options="[
          { value: 'dark', label: '深色' },
          { value: 'system', label: '跟随系统' },
        ]"
        @update:model-value="set({ theme: $event })"
      />
    </Row>
  </Card>

  <Card title="动画效果" icon="sparkle">
    <Row label="动画" desc="控制灵动岛展开、收起以及内容切换动画" stack>
      <Radio
        :model-value="s.animation"
        :options="[
          { value: 'full', label: '完整' },
          { value: 'simple', label: '简洁' },
          { value: 'off', label: '关闭' },
        ]"
        @update:model-value="set({ animation: $event })"
      />
    </Row>
  </Card>

  <Card title="视觉效果" icon="eye">
    <Row label="视觉效果" desc="调整投影与发丝边框的柔和程度" stack>
      <Radio
        :model-value="s.visualEffect"
        :options="[
          { value: 'standard', label: '标准' },
          { value: 'soft', label: '柔和' },
        ]"
        @update:model-value="set({ visualEffect: $event })"
      />
    </Row>
  </Card>

  <Card title="展开时默认打开" icon="grid">
    <Row label="默认应用" desc="悬停展开后首先显示哪个应用">
      <Select
        :model-value="s.defaultApp"
        :options="appOptions"
        @update:model-value="set({ defaultApp: $event })"
      />
    </Row>
  </Card>

  <Card title="当前效果预览" icon="eye">
    <div class="st-preview">
      <div class="st-preview-pill" :style="pillStyle">
        <span class="st-preview-ico"><Icon :name="previewApp.icon" /></span>
        <span>
          <span class="st-preview-time">{{ clock }}</span>
          <span class="st-preview-sub">{{ previewApp.name }} · 紧凑胶囊</span>
        </span>
      </div>
      <div class="st-preview-note">这些设置会实时应用到灵动岛</div>
    </div>
  </Card>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Card from '../components/Card.vue'
import Row from '../components/Row.vue'
import Radio from '../components/Radio.vue'
import Select from '../components/Select.vue'
import Icon from '../../components/Icon.vue'
import { settings, update } from '../../composables/useSettings'
import { FLAT_APPS } from '../apps'

const s = settings
const set = (patch) => update(patch)

const appOptions = FLAT_APPS.map((a) => ({ value: a.id, label: a.name }))
const previewApp = computed(() => FLAT_APPS.find((a) => a.id === s.defaultApp) || FLAT_APPS[2])

// 预览跟着真实时钟走
const now = ref(new Date())
let timer = null
onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 1000)
})
onBeforeUnmount(() => clearInterval(timer))
const pad = (x) => String(x).padStart(2, '0')
const clock = computed(() => `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}`)

// 视觉效果是唯一能在预览里立刻看出来的：柔和档把投影收掉、边框更淡
const pillStyle = computed(() => ({
  boxShadow: s.visualEffect === 'soft' ? 'none' : '0 8px 24px rgba(0, 0, 0, 0.55)',
  borderColor: s.visualEffect === 'soft' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.14)',
}))
</script>
