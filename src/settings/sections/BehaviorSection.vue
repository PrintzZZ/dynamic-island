<template>
  <Card title="展开与收起" icon="cursor">
    <Row label="鼠标悬停自动展开" desc="指针移到胶囊上时展开完整界面">
      <Toggle :model-value="s.hoverExpand" @update:model-value="set({ hoverExpand: $event })" />
    </Row>
    <Row label="鼠标离开自动收起" desc="指针离开后缩回胶囊">
      <Toggle :model-value="s.autoCollapse" @update:model-value="set({ autoCollapse: $event })" />
    </Row>
    <Row label="Esc 快速收起" desc="展开状态下按 Esc 缩回">
      <Toggle :model-value="s.escCollapse" @update:model-value="set({ escCollapse: $event })" />
    </Row>
    <Row label="顶部吸附" desc="拖动到屏幕顶部附近时贴边，形如「刘海」">
      <Toggle :model-value="s.docked" @update:model-value="set({ docked: $event })" />
    </Row>
  </Card>

  <Card title="交互提示" icon="cursor">
    <Row label="不再提示卡片可以滑动" :desc="hintDesc">
      <Toggle
        :model-value="s.cardHintOff === true"
        @update:model-value="set({ cardHintOff: $event })"
      />
    </Row>
    <Row label="恢复提示" desc="把滑动次数清零，下次展开灵动岛时重新提示一遍">
      <button class="st-btn ghost" :disabled="hintFresh" @click="resetHint">恢复提示</button>
    </Row>
  </Card>

  <Card title="通知" icon="bell">
    <Row label="通知显示时间" desc="通知条自动消失前停留的时间">
      <Select
        :model-value="s.notifySeconds"
        :options="noticeOptions"
        @update:model-value="set({ notifySeconds: $event })"
      />
    </Row>
    <Row label="通知选项" desc="关掉后仍会播放提示音，只是不再弹出通知条" stack>
      <div class="st-checks">
        <Check
          :model-value="s.notifyLink"
          label="复制链接时提醒"
          @update:model-value="set({ notifyLink: $event })"
        />
        <Check
          :model-value="s.notifyTimer"
          label="计时结束时提醒"
          @update:model-value="set({ notifyTimer: $event })"
        />
        <Check
          :model-value="s.notifyReminder"
          label="提醒到点时提醒"
          @update:model-value="set({ notifyReminder: $event })"
        />
      </div>
    </Row>
  </Card>

  <Card title="音效" icon="volume">
    <Row label="开启音效" desc="界面操作的提示音">
      <Toggle
        :model-value="s.soundEnabled !== false"
        @update:model-value="set({ soundEnabled: $event })"
      />
    </Row>
    <Row label="音量">
      <div class="st-volume">
        <Icon :name="s.soundEnabled !== false && s.volume > 0 ? 'volume' : 'volume-mute'" />
        <Slider
          :model-value="s.volume"
          :min="0"
          :max="100"
          :disabled="s.soundEnabled === false"
          @update:model-value="set({ volume: $event })"
        />
        <span class="st-volume-val">{{ s.volume }}%</span>
      </div>
    </Row>
    <Row label="提示音" stack>
      <div class="st-checks">
        <Check
          :model-value="s.sfxExpand"
          label="展开 / 收起"
          @update:model-value="set({ sfxExpand: $event })"
        />
        <Check
          :model-value="s.sfxStart"
          label="计时开始"
          @update:model-value="set({ sfxStart: $event })"
        />
        <Check
          :model-value="s.sfxDone"
          label="计时完成"
          @update:model-value="set({ sfxDone: $event })"
        />
        <Check
          :model-value="s.sfxRemind"
          label="提醒"
          @update:model-value="set({ sfxRemind: $event })"
        />
      </div>
    </Row>
  </Card>
</template>

<script setup>
import { computed } from 'vue'
import Card from '../components/Card.vue'
import Row from '../components/Row.vue'
import Toggle from '../components/Toggle.vue'
import Select from '../components/Select.vue'
import Check from '../components/Check.vue'
import Slider from '../components/Slider.vue'
import Icon from '../../components/Icon.vue'
import { settings, update, CARD_HINT_LIMIT } from '../../composables/useSettings'

const s = settings
const set = (patch) => update(patch)

const noticeOptions = [5, 6, 7, 10].map((n) => ({ value: n, label: `${n} 秒` }))

// ---------- 卡片滑动提示 ----------
const hintSwipes = computed(() => Number(s.cardHintSwipes) || 0)
// 已经处于「新鲜」状态（没关掉也没滑过）时，恢复按钮没有意义
const hintFresh = computed(() => s.cardHintOff !== true && hintSwipes.value === 0)
const hintDesc = computed(() => {
  if (s.cardHintOff === true) return '已设为不再提示。打开上面的开关即可恢复。'
  if (hintSwipes.value >= CARD_HINT_LIMIT) {
    return `已经滑动 ${hintSwipes.value} 次，提示已自动关闭。`
  }
  return `展开时会提示卡片可以左右滑动；自己滑动满 ${CARD_HINT_LIMIT} 次后自动关闭（已滑动 ${hintSwipes.value} 次）。`
})
function resetHint() {
  set({ cardHintOff: false, cardHintSwipes: 0 })
}
</script>
