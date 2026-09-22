<template>
  <!-- 子设置页：顶部返回条 -->
  <button class="st-back" @click="emit('back')">
    <Icon name="back" />
    <span>应用</span>
  </button>

  <div class="st-page-head">
    <h1 class="st-page-title">{{ detail.name }}</h1>
    <div class="st-page-sub">{{ detail.desc }}</div>
  </div>

  <component :is="detail.comp" />
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import ClipboardDetail from './apps/ClipboardDetail.vue'
import TimeDetail from './apps/TimeDetail.vue'
import MaterialBoxDetail from './apps/MaterialBoxDetail.vue'

const props = defineProps({
  which: { type: String, required: true },
})
const emit = defineEmits(['back'])

const DETAILS = {
  clipboard: {
    name: '剪贴板设置',
    desc: '历史记录、去重方式与链接提醒',
    comp: ClipboardDetail,
  },
  time: {
    name: '时间设置',
    desc: '默认视图、工作时间与提醒默认值',
    comp: TimeDetail,
  },
  materialbox: {
    name: '材料箱设置',
    desc: '打包行为、保存位置与同名处理',
    comp: MaterialBoxDetail,
  },
}

const detail = computed(() => DETAILS[props.which] || DETAILS.clipboard)
</script>
