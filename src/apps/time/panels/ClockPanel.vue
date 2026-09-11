<template>
  <div class="clock-panel">
    <!-- ---------- 当前时间 + 轻量表盘 ---------- -->
    <div class="now-row">
      <div class="now-text">
        <div class="big-time">{{ timeText }}</div>
        <div class="date">{{ dateText }}</div>
      </div>
      <div class="mini-face" aria-hidden="true">
        <span class="hand hour" :style="{ transform: `rotate(${hourDeg}deg)` }" />
        <span class="hand minute" :style="{ transform: `rotate(${minuteDeg}deg)` }" />
        <span class="hand second" :style="{ transform: `rotate(${secondDeg}deg)` }" />
        <span class="pivot" />
      </div>
    </div>

    <!-- ---------- 工作时间 ---------- -->
    <button class="section work" :class="`is-${w.status}`" @click="$emit('open-work')">
      <div class="sec-head">
        <span class="sec-title">工作时间</span>
        <span class="sec-action"><Icon name="settings" class="sec-ico" />设置</span>
      </div>

      <template v-if="w.status === 'off'">
        <div class="sec-main">未启用工作时间统计</div>
        <div class="sec-sub">点「设置」开启并填写上下班时间</div>
      </template>

      <template v-else-if="w.status === 'rest'">
        <div class="sec-main">今天休息</div>
        <div class="sec-sub">
          <template v-if="w.nextWorkday">下一个工作日：{{ w.nextWorkday.name }} {{ w.nextWorkday.startText }}</template>
          <template v-else>好好休息一下</template>
        </div>
      </template>

      <template v-else>
        <div class="range-row">
          <span class="range">{{ w.startText }} — {{ w.endText }}</span>
          <span class="pct" :class="{ done: w.percent >= 100 }">{{ w.percent }}%</span>
        </div>
        <div class="track"><div class="fill" :style="{ width: `${w.percent}%` }" /></div>
        <div class="stat-row">
          <template v-if="w.status === 'before'">
            <span class="stat"><b>距开始</b>{{ durText(w.beforeMin) }}</span>
          </template>
          <template v-else-if="w.status === 'after'">
            <span class="stat"><b>已工作</b>{{ durText(w.workedMin) }}</span>
            <span class="stat muted">今日工作时间已结束</span>
          </template>
          <template v-else>
            <span class="stat">
              <b>{{ w.status === 'lunch' ? '午休中 · 已工作' : '已工作' }}</b>{{ durText(w.workedMin) }}
            </span>
            <span class="stat"><b>剩余</b>{{ durText(w.remainMin) }}</span>
          </template>
        </div>
      </template>
    </button>

    <!-- ---------- 下一提醒 ---------- -->
    <button class="section next" @click="$emit('open-reminder')">
      <span class="bell" :class="{ soon: soonLevel > 0, imminent: soonLevel > 1 }">
        <Icon name="bell" class="bell-ico" />
      </span>
      <span class="next-body">
        <span class="sec-title">下一提醒</span>
        <span v-if="next" class="next-line">
          <b>{{ whenText(next) }}</b>
          <span v-if="next.label" class="next-label">{{ next.label }}</span>
        </span>
        <span v-else class="next-line muted">暂无提醒</span>
      </span>
      <Icon name="chevron-right" class="chev" />
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../../components/Icon.vue'
import { durText } from '../worktime'
import { nextReminder, now, reminderWhenText, useTimeApp } from '../useTimeApp'

defineEmits(['open-work', 'open-reminder'])

const { work } = useTimeApp()
const w = work

const d = computed(() => new Date(now.value))
const pad = (x) => String(x).padStart(2, '0')

const timeText = computed(() => `${pad(d.value.getHours())}:${pad(d.value.getMinutes())}`)

const dateText = computed(() => {
  const t = d.value
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][t.getDay()]
  return `${week} · ${t.getMonth() + 1}月${t.getDate()}日`
})

const hourDeg = computed(() => (d.value.getHours() % 12) * 30 + d.value.getMinutes() * 0.5)
const minuteDeg = computed(() => d.value.getMinutes() * 6 + d.value.getSeconds() * 0.1)
const secondDeg = computed(() => d.value.getSeconds() * 6)

const next = computed(() => nextReminder())
const whenText = (r) => reminderWhenText(r)

// 快到点时轻微强调，不做持续高亮
const soonLevel = computed(() => {
  const r = next.value
  if (!r) return 0
  const t = now.value
  let at
  if (r.type === 'once') {
    at = r.at
  } else {
    const dd = new Date(t)
    dd.setHours(Number(String(r.time).slice(0, 2)), Number(String(r.time).slice(3, 5)), 0, 0)
    if (dd.getTime() < t) dd.setDate(dd.getDate() + 1)
    at = dd.getTime()
  }
  const diff = at - t
  if (diff <= 5 * 60000) return 2
  if (diff <= 30 * 60000) return 1
  return 0
})
</script>

<style scoped>
.clock-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 2px 0 0;
  overflow-y: auto;
}

/* 时间 */
.now-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 4px;
  flex-shrink: 0;
}
.now-text {
  flex: 1;
  min-width: 0;
}
.big-time {
  font-size: 46px;
  font-weight: 300;
  line-height: 1;
  letter-spacing: 1px;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
}
.date {
  margin-top: 6px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.5);
}
.mini-face {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  flex-shrink: 0;
}
.hand {
  position: absolute;
  left: 50%;
  bottom: 50%;
  width: 1.5px;
  border-radius: 2px;
  background: #f5f5f7;
  transform-origin: 50% 100%;
}
.hour {
  height: 13px;
  width: 2px;
  margin-left: -1px;
}
.minute {
  height: 19px;
  margin-left: -0.75px;
}
.second {
  height: 22px;
  background: #0a84ff;
}
.pivot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  border-radius: 50%;
  background: #0a84ff;
}

/* 通用区块 */
.section {
  width: 100%;
  text-align: left;
  border: none;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.045);
  padding: 11px 12px 12px;
  cursor: pointer;
  color: inherit;
  flex-shrink: 0;
  transition: background 0.16s ease;
}
.section:hover {
  background: rgba(255, 255, 255, 0.085);
}
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.sec-title {
  font-size: 11.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.3px;
}
.sec-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.38);
}
.sec-ico {
  width: 10px;
  height: 10px;
}
.sec-main {
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;
}
.sec-sub {
  margin-top: 4px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.45);
}

/* 工作时间 */
.range-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.range {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
}
.pct {
  font-size: 12.5px;
  font-weight: 700;
  color: #0a84ff;
  font-variant-numeric: tabular-nums;
}
.pct.done {
  color: #30d158;
}
.track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 999px;
  background: #0a84ff;
  transition: width 1s linear, background 0.3s ease;
}
.is-after .fill,
.is-rest .fill {
  background: #30d158;
}
.stat-row {
  display: flex;
  gap: 14px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.stat {
  font-size: 11.5px;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
}
.stat b {
  font-weight: 500;
  color: rgba(255, 255, 255, 0.42);
  margin-right: 5px;
}
.stat.muted {
  color: rgba(255, 255, 255, 0.45);
}

/* 下一提醒 */
.next {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 11px;
}
.bell {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(255, 159, 10, 0.16);
  color: #ff9f0a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.3s ease, box-shadow 0.3s ease;
}
.bell.soon {
  background: rgba(255, 159, 10, 0.26);
}
.bell.imminent {
  background: rgba(255, 159, 10, 0.4);
  box-shadow: 0 0 0 3px rgba(255, 159, 10, 0.12);
}
.bell-ico {
  width: 14px;
  height: 14px;
}
.next-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
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
.next-label {
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.next-line.muted {
  color: rgba(255, 255, 255, 0.4);
}
.chev {
  width: 13px;
  height: 13px;
  color: rgba(255, 255, 255, 0.28);
  flex-shrink: 0;
}
</style>
