<template>
  <div class="work-panel">
    <!-- ---------- 顶部 ---------- -->
    <div class="head">
      <button v-if="view === 'settings'" class="back" title="返回" @click="view = 'detail'">
        <Icon name="back" class="back-ico" />
      </button>
      <div class="head-text">
        <div class="head-title">工作时间</div>
        <div class="head-sub">{{ view === 'settings' ? '设置上下班与午休' : '今天的时间去哪了' }}</div>
      </div>
      <button v-if="view === 'detail'" class="link" @click="openSettings">
        <Icon name="settings" class="link-ico" />设置
      </button>
    </div>

    <!-- ---------- 详情 ---------- -->
    <template v-if="view === 'detail'">
      <template v-if="w.status === 'off'">
        <div class="empty">
          <Icon name="clock" class="empty-ico" />
          <div class="empty-text">未启用工作时间统计</div>
          <button class="primary" @click="openSettings">去设置</button>
        </div>
      </template>

      <template v-else-if="w.status === 'rest'">
        <div class="empty">
          <Icon name="sun" class="empty-ico rest" />
          <div class="empty-text">今天休息</div>
          <div class="empty-hint" v-if="w.nextWorkday">
            下一个工作日：{{ w.nextWorkday.name }} {{ w.nextWorkday.startText }}
          </div>
        </div>
      </template>

      <template v-else>
        <div class="range">{{ w.startText }} — {{ w.endText }}</div>

        <div class="cols">
          <div class="col">
            <div class="col-num" :class="{ done: w.percent >= 100 }">{{ w.percent }}%</div>
            <div class="col-label">进度</div>
          </div>
          <div class="col">
            <div class="col-num">{{ durText(w.workedMin) }}</div>
            <div class="col-label">已工作</div>
          </div>
          <div class="col">
            <div class="col-num">{{ durText(w.remainMin) }}</div>
            <div class="col-label">剩余</div>
          </div>
        </div>

        <!-- 时间轴：工作 / 午休 / 工作 按比例分段 -->
        <div class="timeline">
          <div class="tl-bar">
            <div
              v-for="(s, i) in w.segments"
              :key="i"
              class="tl-seg"
              :class="[s.kind, { past: s.to <= nowMin }]"
              :style="{ width: `${s.width}%` }"
            >
              <span class="tl-seg-text">{{ s.kind === 'lunch' ? '午休' : '工作' }}</span>
            </div>
            <span v-if="nowPos !== null" class="tl-now" :style="{ left: `${nowPos * 100}%` }" />
          </div>
          <div class="tl-axis">
            <span
              v-for="(t, i) in axis"
              :key="i"
              class="tl-tick"
              :style="tickStyle(t)"
            >{{ t.label }}</span>
          </div>
        </div>

        <div class="note" :class="w.status">
          <template v-if="w.status === 'before'">距开始还有 {{ durText(w.beforeMin) }}</template>
          <template v-else-if="w.status === 'lunch'">午休中 · 已工作 {{ durText(w.workedMin) }}</template>
          <template v-else-if="w.status === 'after'">今日工作时间已结束</template>
          <template v-else>还剩 {{ durText(w.remainMin) }} 下班</template>
        </div>
      </template>
    </template>

    <!-- ---------- 设置 ---------- -->
    <template v-else>
      <div class="form">
        <div class="row">
          <span class="label">上班</span>
          <input v-model="draft.start" class="time" type="time" />
          <span class="label">下班</span>
          <input v-model="draft.end" class="time" type="time" />
        </div>
        <div class="row">
          <span class="label">午休</span>
          <input v-model="draft.lunchStart" class="time" type="time" />
          <span class="dash">—</span>
          <input v-model="draft.lunchEnd" class="time" type="time" />
        </div>

        <div class="field">
          <span class="label">工作日</span>
          <div class="days">
            <button
              v-for="d in DAYS"
              :key="d.v"
              class="day"
              :class="{ on: draft.weekdays.includes(d.v) }"
              @click="toggleDay(d.v)"
            >
              {{ d.label }}
            </button>
          </div>
        </div>

        <div class="field switch-row">
          <span class="label">启用工作时间统计</span>
          <button class="sw" :class="{ on: draft.enabled }" @click="draft.enabled = !draft.enabled">
            <span class="knob" />
          </button>
        </div>

        <div class="preview">
          每天工作 <b>{{ durText(previewTotal) }}</b>
          <template v-if="previewLunch > 0">（已扣除午休 {{ durText(previewLunch) }}）</template>
        </div>
      </div>

      <div class="foot">
        <button class="ghost" @click="view = 'detail'">取消</button>
        <button class="primary" @click="apply">保存</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import Icon from '../../../components/Icon.vue'
import { durText, hm, hmText, timelineMarks, defaultSchedule } from '../worktime'
import { now, useTimeApp } from '../useTimeApp'

const { state, work, setWorkSchedule } = useTimeApp()
const w = work

const view = ref('detail')
const DAYS = [
  { v: 1, label: '一' },
  { v: 2, label: '二' },
  { v: 3, label: '三' },
  { v: 4, label: '四' },
  { v: 5, label: '五' },
  { v: 6, label: '六' },
  { v: 0, label: '日' },
]

const draft = reactive({ ...defaultSchedule(), weekdays: [...defaultSchedule().weekdays] })

function openSettings() {
  Object.assign(draft, state.workSchedule, { weekdays: [...state.workSchedule.weekdays] })
  view.value = 'settings'
}

function toggleDay(v) {
  const i = draft.weekdays.indexOf(v)
  if (i === -1) draft.weekdays.push(v)
  else if (draft.weekdays.length > 1) draft.weekdays.splice(i, 1)
}

function apply() {
  setWorkSchedule({ ...draft })
  view.value = 'detail'
}

// 设置页的实时预览：总时长与午休时长
const previewTotal = computed(() => {
  const start = hm(draft.start, 540)
  const end = Math.max(start + 1, hm(draft.end, 1080))
  const ls = Math.min(Math.max(hm(draft.lunchStart, 720), start), end)
  const le = Math.min(Math.max(hm(draft.lunchEnd, 780), ls), end)
  return end - start - Math.max(0, le - ls)
})
const previewLunch = computed(() => {
  const start = hm(draft.start, 540)
  const end = Math.max(start + 1, hm(draft.end, 1080))
  const ls = Math.min(Math.max(hm(draft.lunchStart, 720), start), end)
  const le = Math.min(Math.max(hm(draft.lunchEnd, 780), ls), end)
  return Math.max(0, le - ls)
})

// ---- 时间轴 ----
const nowMin = computed(() => {
  const d = new Date(now.value)
  return d.getHours() * 60 + d.getMinutes()
})

const axis = computed(() => {
  const m = { start: w.value.startMin, end: w.value.endMin, lunchStart: hm(w.value.lunchStartText, 720), lunchEnd: hm(w.value.lunchEndText, 780) }
  const list = timelineMarks(m).map((x) => ({ min: x.min, label: x.label }))
  // 去掉重叠刻度
  return list.filter((x, i) => i === 0 || x.min !== list[i - 1].min)
})

function tickStyle(t) {
  const span = Math.max(1, w.value.endMin - w.value.startMin)
  const p = ((t.min - w.value.startMin) / span) * 100
  if (p <= 0) return { left: '0%' }
  if (p >= 100) return { right: '0%' }
  return { left: `${p}%`, transform: 'translateX(-50%)' }
}

const nowPos = computed(() => {
  if (nowMin.value < w.value.startMin || nowMin.value > w.value.endMin) return null
  if (w.value.status === 'rest' || w.value.status === 'off') return null
  const span = Math.max(1, w.value.endMin - w.value.startMin)
  return (nowMin.value - w.value.startMin) / span
})

void hmText
</script>

<style scoped>
.work-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 0 10px;
  flex-shrink: 0;
}
.back {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.back:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #f5f5f7;
}
.back-ico {
  width: 14px;
  height: 14px;
}
.head-text {
  flex: 1;
  min-width: 0;
}
.head-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #f5f5f7;
}
.head-sub {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
}
.link:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f5f5f7;
}
.link-ico {
  width: 11px;
  height: 11px;
}

/* 详情 */
.range {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.cols {
  display: flex;
  gap: 8px;
  margin: 10px 0 14px;
  flex-shrink: 0;
}
.col {
  flex: 1;
  background: rgba(255, 255, 255, 0.045);
  border-radius: 12px;
  padding: 9px 10px 10px;
  text-align: center;
}
.col-num {
  font-size: 16px;
  font-weight: 700;
  color: #0a84ff;
  font-variant-numeric: tabular-nums;
}
.col-num.done {
  color: #30d158;
}
.col-label {
  margin-top: 3px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

/* 时间轴 */
.timeline {
  flex-shrink: 0;
}
.tl-bar {
  position: relative;
  display: flex;
  height: 26px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
}
.tl-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.tl-seg.work {
  background: rgba(10, 132, 255, 0.55);
}
.tl-seg.lunch {
  background: rgba(255, 255, 255, 0.1);
}
.tl-seg-text {
  font-size: 9.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
}
.tl-seg.lunch .tl-seg-text {
  color: rgba(255, 255, 255, 0.45);
}
.tl-now {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  margin-left: -1px;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.7);
}
.tl-axis {
  position: relative;
  height: 16px;
  margin-top: 5px;
}
.tl-tick {
  position: absolute;
  top: 0;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.38);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.note {
  margin-top: 14px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}
.note.after {
  color: #30d158;
}
.note.lunch {
  color: rgba(255, 255, 255, 0.6);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.empty-ico {
  width: 30px;
  height: 30px;
  color: rgba(255, 255, 255, 0.25);
}
.empty-ico.rest {
  color: rgba(48, 209, 88, 0.7);
}
.empty-text {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
}
.empty-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

/* 设置 */
.form {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}
.dash {
  color: rgba(255, 255, 255, 0.3);
}
.time {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #f5f5f7;
  outline: none;
  padding: 7px 9px;
  font-size: 12.5px;
  color-scheme: dark;
  font-variant-numeric: tabular-nums;
}
.time:focus {
  border-color: rgba(10, 132, 255, 0.7);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.days {
  display: flex;
  gap: 5px;
}
.day {
  flex: 1;
  padding: 7px 0;
  border-radius: 9px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}
.day:hover {
  background: rgba(255, 255, 255, 0.12);
}
.day.on {
  background: rgba(10, 132, 255, 0.24);
  color: #7cb8ff;
}
.switch-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.sw {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.22s ease;
}
.sw.on {
  background: #0a84ff;
}
.knob {
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.sw.on .knob {
  transform: translateX(16px);
}
.preview {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}
.preview b {
  color: #7cb8ff;
}

.foot {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  flex-shrink: 0;
}
.ghost,
.primary {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.16s ease;
}
.ghost {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}
.ghost:hover {
  background: rgba(255, 255, 255, 0.15);
}
.primary {
  background: #0a84ff;
  color: #fff;
}
.primary:hover {
  background: #2f95ff;
}
</style>
