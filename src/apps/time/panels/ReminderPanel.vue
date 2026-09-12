<template>
  <div class="rem-panel">
    <!-- ---------- 导航行：只在「新建」态出现（列表态的新建入口在下面卡片里） ---------- -->
    <div v-if="tab === 'new'" class="nav">
      <button class="nav-side" @click="tab = 'list'">取消</button>
      <span class="nav-title">新建提醒</span>
      <button class="nav-side strong" :disabled="!canSubmit" @click="submit">创建</button>
    </div>

    <!-- ================= 列表 ================= -->
    <template v-if="tab === 'list'">
      <div class="scroll">
        <!-- 「下一提醒」与「正在催」是同一张卡：
             平时显示下一提醒，催办时整张卡切到催办态、右侧 ＋ 变成「知道了」。
             它同时是唯一的新建入口，所以永远渲染，没有下一提醒时退化成占位文案 -->
        <div class="group group-next" :class="{ blank: !shown, firing: !!firing }">
          <div class="g-row g-row-next">
            <span class="next-ico"><Icon name="bell" class="next-svg" /></span>
            <div class="next-body">
              <template v-if="shown">
                <div class="next-top">
                  <span class="next-time">{{ whenText(shown) }}</span>
                  <span class="next-label">{{ shown.label || '提醒' }}</span>
                </div>
                <div class="next-meta">{{ metaText(shown) }}</div>
              </template>
              <template v-else>
                <div class="next-top"><span class="next-label dim">暂无提醒</span></div>
                <div class="next-meta">点右侧 ＋ 建一个</div>
              </template>
            </div>
            <Transition name="swap" mode="out-in">
              <button v-if="firing" key="know" class="know" @click="ackReminder()">知道了</button>
              <button v-else key="add" class="nav-add" title="新建提醒" @click="openNew">
                <Icon name="plus" class="nav-add-ico" />
              </button>
            </Transition>
          </div>
        </div>

        <!-- 全部提醒 -->
        <template v-if="reminders.length">
          <div class="sec">全部提醒</div>
          <div class="group">
            <TransitionGroup name="rem">
              <div v-for="r in reminders" :key="r.id" class="g-row rem"
                :class="{ off: !r.enabled, done: r.done, firing: isFiring(r.id) }">
                <div class="t">{{ timeOnly(r) }}</div>
                <div class="info">
                  <div class="lb">{{ r.label || '提醒' }}</div>
                  <div class="sub">{{ metaText(r) }}</div>
                </div>
                <button class="sw" :class="{ on: r.enabled }" :title="r.enabled ? '停用' : '启用'"
                  @click.stop="toggleReminder(r.id)">
                  <span class="knob" />
                </button>
                <button class="del" title="删除" @click.stop="removeReminder(r.id)">
                  <Icon name="close" class="del-ico" />
                </button>
              </div>
            </TransitionGroup>
          </div>
        </template>
      </div>
    </template>

    <!-- ================= 新建 ================= -->
    <template v-else>
      <div class="scroll">
        <div class="group">
          <!-- 类型 -->
          <div class="g-row">
            <span class="glabel">类型</span>
            <div class="seg">
              <button class="seg-btn" :class="{ on: newType === 'once' }" @click="newType = 'once'">
                一次性
              </button>
              <button class="seg-btn" :class="{ on: newType === 'daily' }" @click="newType = 'daily'">
                每日
              </button>
            </div>
          </div>

          <!-- 日期（一次性） -->
          <div v-if="newType === 'once'" class="g-row">
            <span class="glabel">日期</span>
            <div class="chips">
              <button class="chip" :class="{ on: onceMode === 'today' }" @click="onceMode = 'today'">
                今天
              </button>
              <button class="chip" :class="{ on: onceMode === 'tomorrow' }" @click="onceMode = 'tomorrow'">
                明天
              </button>
              <button class="chip" :class="{ on: onceMode === 'date' }" @click="onceMode = 'date'">
                指定
              </button>
            </div>
          </div>

          <!-- 具体日期 -->
          <div v-if="newType === 'once' && onceMode === 'date'" class="g-row">
            <span class="glabel">具体</span>
            <input v-model="dateStr" class="input date" type="date" />
          </div>

          <!-- 时间 -->
          <div class="g-row">
            <span class="glabel">时间</span>
            <input v-model="timeStr" class="input time" type="time" />
          </div>

          <!-- 相对时间快捷 -->
          <div v-if="newType === 'once'" class="g-row">
            <span class="glabel">快捷</span>
            <div class="chips">
              <button v-for="p in RELATIVE_PRESETS" :key="p.min" class="chip"
                :class="{ on: onceMode === 'relative' && relMin === p.min }" @click="pickRelative(p.min)">
                {{ p.label }}
              </button>
            </div>
          </div>

          <!-- 内容 -->
          <div class="g-row">
            <span class="glabel">内容</span>
            <input v-model="label" class="input" maxlength="18" placeholder="客户会议" @keydown.enter="submit" />
          </div>

          <!-- 多次提醒 -->
          <div class="g-row">
            <span class="glabel">重复</span>
            <div class="chips">
              <button v-for="c in REPEAT_COUNTS" :key="String(c.id)" class="chip" :class="{ on: repeatCount === c.id }"
                @click="repeatCount = c.id">
                {{ c.label }}
              </button>
            </div>
          </div>

          <!-- 提醒间隔 -->
          <div v-if="repeatCount !== 'off'" class="g-row">
            <span class="glabel">间隔</span>
            <div class="chips">
              <button v-for="iv in REPEAT_INTERVALS" :key="iv.sec" class="chip"
                :class="{ on: repeatInterval === iv.sec }" @click="repeatInterval = iv.sec">
                {{ iv.label }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="newType === 'once'" class="hint">{{ whenPreview }}</div>
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

// 大字号那一列只放 HH:MM；「明天 / 9月12日」这类限定词挪到副行，
// 否则一次性的 `明天 03:34` 会把时间列撑爆、被截成「明天 0…」
function timeOnly(r) {
  const t = reminderWhenText(r)
  const m = /\d{1,2}:\d{2}$/.exec(t)
  return m ? m[0] : t
}
function dayTag(r) {
  const t = reminderWhenText(r)
  const m = /^(.+?)\s+\d{1,2}:\d{2}$/.exec(t)
  return m ? m[1] : ''
}

// 一行副文案讲完「明天 + 一次性/每天 + 催办策略」，不再单独放标签胶囊
function metaText(r) {
  const type = r.type === 'once' ? '一次性' : '每天'
  const rep = reminderRepeatText(r)
  const parts = [dayTag(r), type]
  if (rep !== '仅提醒一次') parts.push(rep)
  return parts.filter(Boolean).join(' · ')
}

const next = computed(() => nextReminder())

const firing = computed(() => {
  const fr = firingReminder.value
  if (!fr) return null
  return reminders.value.find((r) => r.id === fr.id) || null
})
const isFiring = (id) => !!(firingReminder.value && firingReminder.value.id === id)

// 卡片内容：催办中优先显示「正在催的那条」，否则显示「下一提醒」
const shown = computed(() => firing.value || next.value)

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
  gap: 8px;
  padding: 2px 0 0;
}

/* ---------- 导航行 ---------- */
.nav {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  flex-shrink: 0;
  min-height: 28px;
  padding: 0 2px;
}

.nav-title {
  font-size: 13px;
  font-weight: 600;
  color: #f5f5f7;
  letter-spacing: 0.2px;
}

.nav-side {
  justify-self: start;
  border: none;
  background: none;
  padding: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  /* cursor: pointer; */
  transition: color 0.16s ease;
}

/* .nav-side:hover {
  color: #f5f5f7;
} */
.nav-side.strong {
  justify-self: end;
  font-weight: 600;
  color: #ff9f0a;
}

.nav-side.strong:hover {
  color: #ffb340;
}

.nav-side.strong:disabled {
  color: rgba(255, 255, 255, 0.22);
  cursor: not-allowed;
}



/* ---------- 滚动区 ---------- */
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}

/* iOS 分组：小标题在组外，组内用发丝线分行 */
.sec {
  font-size: 10.5px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.3px;
  padding: 4px 4px 0;
}

.group {
  position: relative;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.055);
  overflow: hidden;
  flex-shrink: 0;
}

.g-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 19px 12px;
}

/* 发丝分隔线：左侧内缩，对齐 iOS */
.g-row+.g-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12px;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
}

/* ---------- 催办态：整张「下一提醒」卡切过去，不另起一条 ---------- */
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

.group-next.firing {
  background: rgba(255, 159, 10, 0.14);
}
/* 催办时铃铛变成实心橙并摇铃，和列表里那条 .rem.firing 呼应 */
.group-next.firing .next-ico {
  background: #ff9f0a;
  color: #1a0f00;
  animation: ring 1.4s ease-in-out infinite;
}
.group-next.firing .next-meta {
  color: rgba(255, 179, 64, 0.85);
}

/* 催办时右侧的 ＋ 换成「知道了」 */
.know {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 13px;
  font-size: 12px;
  font-weight: 600;
  background: #ff9f0a;
  color: #1a0f00;
  cursor: pointer;
  white-space: nowrap;
  transition: filter 0.16s ease;
}
.know:hover {
  filter: brightness(1.08);
}

/* ＋ ↔ 知道了 的切换 */
.swap-enter-active {
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease;
}
.swap-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.swap-enter-from {
  opacity: 0;
  transform: scale(0.6);
}
.swap-leave-to {
  opacity: 0;
  transform: scale(0.6);
}

/* ---------- 下一提醒（胶囊卡，同时是新建入口） ---------- */
.group-next {
  border-radius: 50px;
  margin: 10px 0;
}
/* 内层行负责实际内边距，避免和外层重复叠加 */
.g-row-next {
  width: 100%;
  min-height: 0;
  padding: 16px;
  gap: 11px;
}
/* 没有下一提醒时整体降温，但 ＋ 依然可点 */
.group-next.blank .next-ico {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.4);
}
.next-label.dim {
  color: rgba(255, 255, 255, 0.5);
}

.next-ico {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 159, 10, 0.16);
  color: #ff9f0a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.2s ease, color 0.2s ease;
}

.next-svg {
  width: 20px;
  height: 20px;
}

.next-body {
  flex: 1;
  min-width: 0;
}

.next-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.next-time {
  font-size: 16px;
  font-weight: 600;
  color: #ff9f0a;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  flex-shrink: 0;
}

.next-label {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.next-meta {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.38);
  margin-top: 2px;
}

.nav-add {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  padding: 0;
  background: rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.nav-add:hover {
  background: #ff9f0a;
  color: #1a0f00;
  transform: scale(1.08);
}

.nav-add-ico {
  width: 13px;
  height: 13px;
}

/* ---------- 列表行 ---------- */
.rem.off {
  opacity: 0.42;
}

.rem.firing {
  background: rgba(255, 159, 10, 0.12);
}

.rem.done .t {
  color: rgba(255, 255, 255, 0.4);
  text-decoration: line-through;
}

.t {
  width: 56px;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
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
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.38);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sw {
  position: relative;
  width: 32px;
  height: 19px;
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
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform 0.24s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.sw.on .knob {
  transform: translateX(13px);
}

.del {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  opacity: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.16s ease, color 0.16s ease, opacity 0.16s ease;
}

.del-ico {
  width: 9px;
  height: 9px;
}

.rem:hover .del {
  opacity: 1;
}

.del:hover {
  background: var(--red);
  color: #fff;
}

/* ---------- 表单 ---------- */
.glabel {
  flex: 0 0 34px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);
}

/* iOS 分段控件：中性轨道 + 浅色滑块 */
.seg {
  flex: 1;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
}

.seg-btn {
  flex: 1;
  padding: 5px 4px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.seg-btn:hover {
  color: rgba(255, 255, 255, 0.78);
}

.seg-btn.on {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-weight: 600;
}

.chips {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 5px 10px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.58);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.16s ease, color 0.16s ease;
}

.chip:hover {
  background: rgba(255, 255, 255, 0.13);
  color: #f5f5f7;
}

.chip.on {
  background: rgba(255, 159, 10, 0.2);
  color: #ffb340;
  font-weight: 600;
}

.input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: #f5f5f7;
  outline: none;
  padding: 0;
  font-size: 12.5px;
  color-scheme: dark;
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.26);
}

.input.time {
  flex: 0 0 auto;
  width: 92px;
  margin-left: auto;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
}

.input.date {
  flex: 0 0 auto;
  margin-left: auto;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.hint {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.32);
  padding: 0 6px;
}

/* ---------- 列表过渡 ---------- */
.rem-enter-active {
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.rem-leave-active {
  transition: all 0.2s ease;
  position: absolute;
  left: 0;
  width: 100%;
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
