<template>
  <div class="rem-panel">
    <!-- 正在催的提醒：给一个明确的"知道了"出口 -->
    <Transition name="firing">
      <div v-if="firing" class="firing">
        <span class="firing-ico"><Icon name="bell" class="firing-ico-svg" /></span>
        <div class="firing-body">
          <div class="firing-title">{{ firing.label || '提醒' }}</div>
          <div class="firing-sub">
            {{ firing.time }} · 未确认，每 {{ repeatSec }} 秒再提醒一次
          </div>
        </div>
        <button class="firing-btn" @click="ackReminder()">知道了</button>
      </div>
    </Transition>

    <div class="add-bar">
      <input v-model="time" class="time-input" type="time" />
      <input
        v-model="label"
        class="label-input"
        maxlength="12"
        placeholder="提醒内容（可选）"
        @keydown.enter="submit"
      />
      <button class="add-btn" title="添加提醒" @click="submit">
        <Icon name="plus" class="add-ico" />
      </button>
    </div>

    <div v-if="reminders.length" class="list">
      <TransitionGroup name="rem">
        <div
          v-for="r in reminders"
          :key="r.id"
          class="rem-item"
          :class="{
            off: !r.enabled,
            next: nextId === r.id && r.enabled && !isFiring(r.id),
            firing: isFiring(r.id),
          }"
        >
          <div class="t">{{ r.time }}</div>
          <div class="info">
            <div class="lb">{{ r.label || '提醒' }}</div>
            <div class="sub">
              <template v-if="!r.enabled">已停用</template>
              <template v-else-if="isFiring(r.id)">提醒中…</template>
              <template v-else-if="nextId === r.id">下一次提醒</template>
              <template v-else>每天</template>
              <span v-if="r.repeat && r.enabled" class="tag">多次</span>
            </div>
          </div>

          <button
            class="rep"
            :class="{ on: r.repeat }"
            :title="r.repeat ? '已开启多次提醒（点击关闭）' : '开启多次提醒：未确认则 30 秒后再提醒'"
            @click.stop="toggleReminderRepeat(r.id)"
          >
            <Icon name="repeat" class="rep-ico" />
          </button>

          <button
            class="sw"
            :class="{ on: r.enabled }"
            :title="r.enabled ? '停用' : '启用'"
            @click.stop="toggleReminder(r.id)"
          >
            <span class="knob" />
          </button>

          <button class="del" title="删除" @click.stop="removeReminder(r.id)">
            <Icon name="close" class="del-ico" />
          </button>
        </div>
      </TransitionGroup>
    </div>

    <div v-else class="empty">
      <div class="empty-icon"><Icon name="bell" class="empty-ico" /></div>
      <div class="empty-text">还没有提醒</div>
      <div class="empty-hint">设定时间后，到点岛内会弹出提醒</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '../../../components/Icon.vue'
import { REPEAT_MS, useTimeApp } from '../useTimeApp'
import { sfx } from '../../../utils/sound'

const {
  state,
  addReminder,
  removeReminder,
  toggleReminder,
  toggleReminderRepeat,
  ackReminder,
  firingReminder,
  nextReminder,
} = useTimeApp()

const reminders = computed(() => state.reminders)
const repeatSec = Math.round(REPEAT_MS / 1000)

const nextId = computed(() => {
  const r = nextReminder()
  return r ? r.id : null
})

// 正在被催的那条提醒（拿它的 label / time 显示在顶部横幅）
const firing = computed(() => {
  const fr = firingReminder.value
  if (!fr) return null
  return state.reminders.find((r) => r.id === fr.id) || null
})

function isFiring(id) {
  return !!(firingReminder.value && firingReminder.value.id === id)
}

const pad = (x) => String(x).padStart(2, '0')

// 默认给一个 10 分钟后的时间，省得每次都要拨表
const seed = new Date(Date.now() + 10 * 60000)
const time = ref(`${pad(seed.getHours())}:${pad(seed.getMinutes())}`)
const label = ref('')

function submit() {
  const r = addReminder(time.value, label.value)
  if (!r) return
  sfx.tick()
  label.value = ''
}
</script>

<style scoped>
.rem-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 2px;
}

/* 提醒中横幅 */
.firing {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 12px;
  background: rgba(48, 209, 88, 0.14);
  border: 1px solid rgba(48, 209, 88, 0.38);
  flex-shrink: 0;
}
.firing-ico {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(48, 209, 88, 0.2);
  color: #30d158;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  animation: ring 1.4s ease-in-out infinite;
}
.firing-ico-svg {
  width: 14px;
  height: 14px;
}
@keyframes ring {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
  }
  20% {
    transform: scale(1.08) rotate(-12deg);
  }
  40% {
    transform: scale(1.08) rotate(12deg);
  }
  60% {
    transform: scale(1) rotate(0deg);
  }
}
.firing-body {
  flex: 1;
  min-width: 0;
}
.firing-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #f5f5f7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.firing-sub {
  font-size: 10px;
  color: rgba(48, 209, 88, 0.85);
  margin-top: 2px;
}
.firing-btn {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  background: #30d158;
  color: #0a0a0a;
  cursor: pointer;
  transition: transform 0.18s ease;
}
.firing-btn:hover {
  transform: scale(1.06);
}
.firing-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.firing-leave-active {
  transition: all 0.2s ease;
}
.firing-enter-from,
.firing-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.add-bar {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.time-input,
.label-input {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: #f5f5f7;
  outline: none;
  padding: 8px 10px;
  font-size: 13px;
  color-scheme: dark; /* 让原生时间选择器跟随深色 */
  transition: border-color 0.18s ease, background 0.18s ease;
}
.time-input {
  width: 96px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.label-input {
  flex: 1;
  min-width: 0;
}
.time-input:focus,
.label-input:focus {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
}
.label-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}
.add-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: none;
  background: #30d158;
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
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}
.rem-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 8px 9px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  transition: background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}
.rem-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.rem-item.next {
  border-color: rgba(48, 209, 88, 0.35);
  background: rgba(48, 209, 88, 0.08);
}
.rem-item.firing {
  border-color: rgba(48, 209, 88, 0.55);
  background: rgba(48, 209, 88, 0.16);
}
.rem-item.off {
  opacity: 0.45;
}
.t {
  width: 48px;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
}
.info {
  flex: 1;
  min-width: 0;
}
.lb {
  font-size: 12.5px;
  color: #f5f5f7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 2px;
}
.rem-item.next .sub,
.rem-item.firing .sub {
  color: #30d158;
}
.tag {
  font-size: 9px;
  font-weight: 700;
  color: #30d158;
  background: rgba(48, 209, 88, 0.16);
  border-radius: 999px;
  padding: 1px 5px;
}

/* 多次提醒开关 */
.rep {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.25);
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s ease, color 0.18s ease;
}
.rep-ico {
  width: 13px;
  height: 13px;
}
.rep:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}
.rep.on {
  color: #30d158;
  background: rgba(48, 209, 88, 0.16);
}

.sw {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.22s ease;
}
.sw.on {
  background: #30d158;
}
.knob {
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.sw.on .knob {
  transform: translateX(14px);
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}
.del-ico {
  width: 10px;
  height: 10px;
}
.rem-item:hover .del {
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
  padding-bottom: 24px;
}
.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #30d158;
  animation: float 3s ease-in-out infinite;
}
.empty-ico {
  width: 24px;
  height: 24px;
  stroke-width: 1.8;
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

.rem-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.rem-leave-active {
  transition: all 0.22s ease;
}
.rem-move {
  transition: transform 0.3s ease;
}
.rem-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.rem-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
