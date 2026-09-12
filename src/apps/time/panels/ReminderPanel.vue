<template>
  <div class="rem-panel">
    <!-- ---------- 分段：列表 / 新建 ---------- -->
    <div class="seg">
      <button class="seg-btn" :class="{ on: tab === 'list' }" @click="tab = 'list'">提醒列表</button>
      <button class="seg-btn" :class="{ on: tab === 'new' }" @click="openNew">新建提醒</button>
    </div>

    <!-- ---------- 正在催 ---------- -->
    <Transition name="firing">
      <div v-if="firing" class="firing">
        <span class="firing-ico"><Icon name="bell" class="firing-svg" /></span>
        <div class="firing-body">
          <div class="firing-title">{{ firing.label || '提醒' }}</div>
          <div class="firing-sub">{{ whenText(firing) }} · {{ repeatText(firing) }}</div>
        </div>
        <button class="firing-btn" @click="ackReminder()">知道了</button>
      </div>
    </Transition>

    <!-- ================= 列表 ================= -->
    <template v-if="tab === 'list'">
      <!-- 下一提醒 -->
      <div v-if="next" class="next-card">
        <div class="sec-title">下一提醒</div>
        <div class="next-row">
          <span class="next-ico"><Icon name="bell" class="next-svg" /></span>
          <div class="next-text">
            <div class="next-line"><b>{{ whenText(next) }}</b><span>{{ next.label || '提醒' }}</span></div>
            <div class="next-sub">{{ repeatText(next) }}</div>
          </div>
        </div>
      </div>

      <!-- 全部提醒 -->
      <div class="list-head">全部提醒</div>
      <div v-if="reminders.length" class="list">
        <TransitionGroup name="rem">
          <div
            v-for="r in reminders"
            :key="r.id"
            class="rem-item"
            :class="{ off: !r.enabled, done: r.done, firing: isFiring(r.id) }"
          >
            <div class="t">{{ whenText(r) }}</div>
            <div class="info">
              <div class="lb">{{ r.label || '提醒' }}</div>
              <div class="sub">
                <span class="tag" :class="r.type">{{ r.type === 'once' ? '一次性' : '每天' }}</span>
                <span>{{ repeatText(r) }}</span>
              </div>
            </div>
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
        <div class="empty-hint">到点后灵动岛会弹出提醒条</div>
      </div>
    </template>

    <!-- ================= 新建 ================= -->
    <template v-else>
      <div class="form">
        <!-- 一次性 / 每日 -->
        <div class="seg small">
          <button class="seg-btn" :class="{ on: newType === 'once' }" @click="newType = 'once'">一次性</button>
          <button class="seg-btn" :class="{ on: newType === 'daily' }" @click="newType = 'daily'">每日</button>
        </div>

        <!-- 时间 -->
        <div class="field">
          <span class="flabel">时间</span>
          <div class="row">
            <input v-model="timeStr" class="input time" type="time" />
            <template v-if="newType === 'once'">
              <button
                v-for="p in RELATIVE_PRESETS"
                :key="p.min"
                class="mini-chip"
                :class="{ on: onceMode === 'relative' && relMin === p.min }"
                @click="pickRelative(p.min)"
              >
                {{ p.label }}
              </button>
            </template>
          </div>
        </div>

        <!-- 一次性：今天 / 明天 / 指定日期 -->
        <div v-if="newType === 'once'" class="field">
          <span class="flabel">日期</span>
          <div class="row">
            <button class="mini-chip" :class="{ on: onceMode === 'today' }" @click="onceMode = 'today'">今天</button>
            <button class="mini-chip" :class="{ on: onceMode === 'tomorrow' }" @click="onceMode = 'tomorrow'">明天</button>
            <button class="mini-chip" :class="{ on: onceMode === 'date' }" @click="onceMode = 'date'">指定日期</button>
            <input v-if="onceMode === 'date'" v-model="dateStr" class="input date" type="date" />
          </div>
          <div class="hint">{{ whenPreview }}</div>
        </div>

        <!-- 内容 -->
        <div class="field">
          <span class="flabel">提醒内容</span>
          <input v-model="label" class="input" maxlength="18" placeholder="客户会议" @keydown.enter="submit" />
        </div>

        <!-- 多次提醒 -->
        <div class="field">
          <span class="flabel">多次提醒</span>
          <div class="row wrap">
            <button
              v-for="c in REPEAT_COUNTS"
              :key="String(c.id)"
              class="mini-chip"
              :class="{ on: repeatCount === c.id }"
              @click="repeatCount = c.id"
            >
              {{ c.label }}
            </button>
          </div>
        </div>

        <div v-if="repeatCount !== 'off'" class="field">
          <span class="flabel">提醒间隔</span>
          <div class="row">
            <button
              v-for="iv in REPEAT_INTERVALS"
              :key="iv.sec"
              class="mini-chip"
              :class="{ on: repeatInterval === iv.sec }"
              @click="repeatInterval = iv.sec"
            >
              {{ iv.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="foot">
        <button class="btn ghost" @click="tab = 'list'">取消</button>
        <button class="btn primary" :disabled="!canSubmit" @click="submit">创建</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '../../../components/Icon.vue'
import {
  RELATIVE_PRESETS,
  REPEAT_COUNTS,
  REPEAT_INTERVALS,
  reminderRepeatText,
  reminderWhenText,
  now,
  useTimeApp,
} from '../useTimeApp'
import { sfx } from '../../../utils/sound'

const {
  state,
  addReminder,
  removeReminder,
  toggleReminder,
  ackReminder,
  firingReminder,
  nextReminder,
} = useTimeApp()

const reminders = computed(() => state.reminders)
const whenText = (r) => reminderWhenText(r)
const repeatText = (r) => reminderRepeatText(r)

const next = computed(() => nextReminder())

const firing = computed(() => {
  const fr = firingReminder.value
  if (!fr) return null
  return reminders.value.find((r) => r.id === fr.id) || null
})
const isFiring = (id) => !!(firingReminder.value && firingReminder.value.id === id)

// ---------- 新建 ----------
const tab = ref('list')
const newType = ref('daily')
const onceMode = ref('today')
const relMin = ref(30)
const label = ref('')
const repeatCount = ref('unlimited')
const repeatInterval = ref(30)

const pad = (x) => String(x).padStart(2, '0')

function defaultTime() {
  const d = new Date(Date.now() + 10 * 60000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const timeStr = ref(defaultTime())
const dateStr = ref(toDateInput(new Date()))

function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function openNew() {
  tab.value = 'new'
  newType.value = 'daily'
  onceMode.value = 'today'
  relMin.value = 30
  label.value = ''
  timeStr.value = defaultTime()
  dateStr.value = toDateInput(new Date())
  repeatCount.value = 'unlimited'
  repeatInterval.value = 30
}

// 相对时间：直接算出绝对时刻，并回填到时间框
function pickRelative(min) {
  onceMode.value = 'relative'
  relMin.value = min
  const d = new Date(Date.now() + min * 60000)
  timeStr.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  dateStr.value = toDateInput(d)
}

// 一次性提醒的目标时间戳
const onceAt = computed(() => {
  if (onceMode.value === 'relative') return Date.now() + relMin.value * 60000
  const [hh, mm] = String(timeStr.value || '09:00').split(':').map(Number)
  let base
  if (onceMode.value === 'tomorrow') {
    base = new Date()
    base.setDate(base.getDate() + 1)
  } else if (onceMode.value === 'date') {
    const [y, m, d] = String(dateStr.value || '').split('-').map(Number)
    base = y && m && d ? new Date(y, m - 1, d) : new Date()
  } else {
    base = new Date()
  }
  base.setHours(hh || 0, mm || 0, 0, 0)
  // 「今天」但已经过了 → 顺延到明天，不创建一条永远不响的提醒
  if (onceMode.value === 'today' && base.getTime() <= Date.now()) base.setDate(base.getDate() + 1)
  return base.getTime()
})

const whenPreview = computed(() => {
  const d = new Date(onceAt.value)
  return `将于 ${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())} 提醒一次`
})

const canSubmit = computed(() =>
  newType.value === 'daily' ? /^\d{1,2}:\d{2}$/.test(timeStr.value) : onceAt.value > Date.now()
)

function submit() {
  if (!canSubmit.value) return
  const payload =
    newType.value === 'once'
      ? {
          type: 'once',
          at: onceAt.value,
          time: `${pad(new Date(onceAt.value).getHours())}:${pad(new Date(onceAt.value).getMinutes())}`,
          label: label.value,
          repeatCount: repeatCount.value,
          repeatInterval: repeatInterval.value,
        }
      : {
          type: 'daily',
          time: timeStr.value,
          label: label.value,
          repeatCount: repeatCount.value,
          repeatInterval: repeatInterval.value,
        }
  const r = addReminder(payload)
  if (!r) return
  sfx.tick()
  tab.value = 'list'
}

void now
</script>

<style scoped>
.rem-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 2px 0 0;
}

/* 分段控件 */
.seg {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.seg.small {
  padding: 2px;
}
.seg-btn {
  flex: 1;
  padding: 6px 4px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}
.seg-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}
.seg-btn.on {
  background: #101E34;
  color: #ffb340;
}

/* 正在催 */
.firing {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 12px;
  background: rgba(255, 159, 10, 0.14);
  border: 1px solid rgba(255, 159, 10, 0.38);
  flex-shrink: 0;
}
.firing-ico {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(255, 159, 10, 0.2);
  color: #ff9f0a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  animation: ring 1.4s ease-in-out infinite;
}
.firing-svg {
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
  color: rgba(255, 179, 64, 0.9);
  margin-top: 2px;
}
.firing-btn {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  background: #ff9f0a;
  color: #241300;
  cursor: pointer;
}
.firing-btn:hover {
  filter: brightness(1.08);
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

/* 下一提醒卡片 */
.next-card {
  border-radius: 12px;
  background: rgba(255, 159, 10, 0.1);
  border: 1px solid rgba(255, 159, 10, 0.22);
  padding: 9px 11px 10px;
  flex-shrink: 0;
}
.sec-title {
  font-size: 10.5px;
  font-weight: 700;
  color: rgba(255, 179, 64, 0.85);
  letter-spacing: 0.3px;
}
.next-row {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 7px;
}
.next-ico {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 159, 10, 0.6);
  color: #ff9f0a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.next-svg {
  width: 12px;
  height: 12px;
}
.next-text {
  flex: 1;
  min-width: 0;
}
.next-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
  color: #f5f5f7;
  min-width: 0;
}
.next-line b {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.next-line span {
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.next-sub {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

/* 列表 */
.list-head {
  font-size: 10.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.4);
  padding: 2px 2px 0;
  flex-shrink: 0;
}
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-right: 2px;
}
.rem-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  transition: background 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
}
.rem-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.rem-item.firing {
  border-color: rgba(255, 159, 10, 0.5);
  background: rgba(255, 159, 10, 0.12);
}
.rem-item.off {
  opacity: 0.42;
}
.rem-item.done .t {
  color: rgba(255, 255, 255, 0.45);
  text-decoration: line-through;
}
.t {
  width: 62px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
.tag {
  font-size: 9px;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 5px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
}
.tag.once {
  background: rgba(255, 159, 10, 0.2);
  color: #ffb340;
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
  background: #ff9f0a;
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
  transition: all 0.16s ease;
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
  padding-bottom: 20px;
}
.empty-icon {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  background: rgba(255, 159, 10, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff9f0a;
}
.empty-ico {
  width: 22px;
  height: 22px;
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

/* 新建表单 */
.form {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.flabel {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.45);
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.row.wrap {
  flex-wrap: wrap;
}
.input {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #f5f5f7;
  outline: none;
  padding: 8px 10px;
  font-size: 12.5px;
  color-scheme: dark;
  transition: border-color 0.16s ease;
}
.input:focus {
  border-color: rgba(255, 159, 10, 0.7);
}
.input::placeholder {
  color: rgba(255, 255, 255, 0.28);
}
.input.time {
  flex: 0 0 92px;
  font-variant-numeric: tabular-nums;
}
.input.date {
  flex: 1;
  font-variant-numeric: tabular-nums;
}
.mini-chip {
  padding: 6px 10px;
  border-radius: 9px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.16s ease, color 0.16s ease;
}
.mini-chip:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f5f5f7;
}
.mini-chip.on {
  background: rgba(255, 159, 10, 0.22);
  color: #ffb340;
}
.hint {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.35);
}

.foot {
  display: flex;
  gap: 8px;
  padding-top: 10px;
  flex-shrink: 0;
}
.btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.16s ease, opacity 0.16s ease;
}
.btn.ghost {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}
.btn.ghost:hover {
  background: rgba(255, 255, 255, 0.15);
}
.btn.primary {
  background: #ff9f0a;
  color: #241300;
}
.btn.primary:hover:not(:disabled) {
  filter: brightness(1.08);
}
.btn.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 列表过渡 */
.rem-enter-active {
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.rem-leave-active {
  transition: all 0.2s ease;
  position: absolute;
  width: calc(100% - 4px);
}
.rem-move {
  transition: transform 0.28s ease;
}
.rem-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
.rem-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
