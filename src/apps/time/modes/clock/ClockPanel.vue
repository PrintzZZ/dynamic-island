<template>
  <div class="clock-panel">
    <!-- ---------- 当前时间 + 轻量表盘 ---------- -->
    <div class="now-row">
      <div class="now-text">
        <div class="big-time">{{ timeText }}</div>
        <div class="date">{{ dateText }}</div>
      </div>
      <div class="mini-face" aria-hidden="true">
        <!-- 刻度 -->
        <div class="marks">
          <span style="--i: 0"></span>
          <span style="--i: 1"></span>
          <span style="--i: 2"></span>
          <span style="--i: 3"></span>
          <span style="--i: 4"></span>
          <span style="--i: 5"></span>
          <span style="--i: 6"></span>
          <span style="--i: 7"></span>
          <span style="--i: 8"></span>
          <span style="--i: 9"></span>
          <span style="--i: 10"></span>
          <span style="--i: 11"></span>
        </div>

        <!-- 指针（保留你提供的 Vue 语法） -->
        <span class="hand hour" :style="{ transform: `rotate(${hourDeg}deg)` }"></span>
        <span class="hand minute" :style="{ transform: `rotate(${minuteDeg}deg)` }"></span>
        <!-- 图片中没有秒针，这里保留结构，可通过 CSS 隐藏 -->
        <span class="hand second" :style="{ transform: `rotate(${secondDeg}deg)` }"></span>

        <!-- 表盘中心点 -->
        <span class="pivot"></span>
      </div>
    </div>

    <!-- ---------- 工作时间 ---------- -->
    <button class="section work" :class="`is-${w.status}`" @click="$emit('open-work')">
      <div class="sec-head">
        <span class="sec-title">工作时间</span>
        <span class="sec-action">
          <Icon name="settings" class="sec-ico" />设置
        </span>
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
        <div class="track">
          <div class="fill" :style="{ width: `${w.percent}%` }" />
        </div>
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
            <span class="stat"><b>剩余</b>{{  durText(w.remainMin) }}</span>
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
          <b>{{ whenText(next) + " ·" }}  </b>
          <span v-if="next.label" class="next-label"> {{ next.label }}</span>
        </span>
        <span v-else class="next-line muted">暂无提醒</span>
      </span>
      <Icon name="chevron-right" class="chev" />
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '../../../../components/Icon.vue'
import { durText } from '../../worktime'
import { nextReminder, now, reminderWhenText, useTime } from '../../useTime'

defineEmits(['open-work', 'open-reminder'])

const { work } = useTime()
const w = work

const d = computed(() => new Date(now.value))
const pad = (x) => String(x).padStart(2, '0')

const timeText = computed(() => `${pad(d.value.getHours())}:${pad(d.value.getMinutes())}`)


const dateText = computed(() => {
  const t = d.value;
  const week = ['星期天', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][t.getDay()];
  
  // 转换月份和日期
  const monthStr = numToChinese(t.getMonth() + 1);
  const dayStr = numToChinese(t.getDate());
  
  // 拼接结果：例如 "星期五 · 九月十二日"
  return `${week} · ${monthStr}月${dayStr}日`;
});

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


// 数字转汉字（支持 1-31）
const numToChinese = (num) => {
  const chars = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  
  if (num <= 10) {
    return chars[num]; // 1-10 直接返回
  }
  if (num < 20) {
    // 11-19
    const unit = num % 10;
    return '十' + (unit === 0 ? '' : chars[unit]); // 10是'十'，12是'十二'
  }
  if (num < 100) {
    // 20-31
    const ten = Math.floor(num / 10);
    const unit = num % 10;
    return chars[ten] + '十' + (unit === 0 ? '' : chars[unit]); // 20是'二十'，22是'二十二'
  }
  return num.toString(); // 兜底
};

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
  padding: 10px 4px;
  flex-shrink: 0;
}

.now-text {
  flex: 1;
  min-width: 0;
  height: 100px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
}

.big-time {
  font-size: 60px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 1px;
  color: #f5f5f7;
  font-variant-numeric: tabular-nums;
  font-family: 'SF Pro Display', 'SF Pro Icons', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
}

.date {
  margin-top: 8px;
  padding-left: 4px;
  font-size: 16px;
  color: #8F8E93;
}

/* 容器基础样式 */
.mini-face {
  /* 核心：只需要修改这一个变量，就能整体缩放 */
  --clock-size: 100px;
  --u: calc(var(--clock-size) / 160);
  /* 1u 对应原尺寸的 1px */

  position: relative;
  right: 10px;
  width: var(--clock-size);
  height: var(--clock-size);
  border-radius: 50%;
  background: radial-gradient(circle at center, #111a2b 0%, #060911 100%);
  border: calc(1 * var(--u)) solid rgba(120, 150, 190, 0.2);
  box-shadow:
    0 calc(8 * var(--u)) calc(20 * var(--u)) rgba(0, 0, 0, 0.8),
    inset 0 0 calc(15 * var(--u)) rgba(0, 0, 0, 0.9),
    0 0 calc(10 * var(--u)) rgba(80, 120, 200, 0.1);
  box-sizing: border-box;
}

/* --- 表盘刻度 --- */
.marks {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.marks span {
  position: absolute;
  top: calc(12 * var(--u));
  left: 50%;
  width: calc(2 * var(--u));
  height: calc(6 * var(--u));
  background-color: #8b9db4;
  border-radius: calc(2 * var(--u));
  /* 换算 transform-origin: 68u = 80u(半径) - 12u(top) */
  transform-origin: 50% calc(68 * var(--u));
  transform: translateX(-50%) rotate(calc(var(--i) * 30deg));
}

/* 主刻度 */
.marks span:nth-child(3n + 1) {
  top: calc(10 * var(--u));
  width: calc(3 * var(--u));
  height: calc(10 * var(--u));
  background-color: #cfd9e6;
  transform-origin: 50% calc(70 * var(--u));
  /* 80u - 10u */
}

/* --- 尖头指针 --- */
.hand {
  position: absolute;
  bottom: 50%;
  left: 50%;
  transform-origin: bottom center;
  background: linear-gradient(to right, #7a8ba3 0%, #ffffff 50%, #7a8ba3 100%);
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  z-index: 5;
}

.hand.hour {
  width: calc(6 * var(--u));
  height: calc(38 * var(--u));
  margin-left: calc(-3 * var(--u));
}

.hand.minute {
  width: calc(6 * var(--u));
  height: calc(52 * var(--u));
  margin-left: calc(-2.5 * var(--u));
}

.hand.second {
  width: calc(2 * var(--u));
  height: calc(60 * var(--u));
  margin-left: calc(-1 * var(--u));
  background: #ff9f0a;
  clip-path: none;
}

/* --- 中心枢纽 --- */
.pivot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(8 * var(--u));
  height: calc(8 * var(--u));
  background: radial-gradient(circle, #ffe6cc 0%, #d4a373 100%);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  box-shadow: 0 0 calc(6 * var(--u)) rgba(255, 200, 150, 0.6);
}

/* 通用区块 */
.section {
  width: 100%;
  text-align: left;
  border: none;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.045);
  padding: 20px 20px;
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
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
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
  margin-bottom: 10px;
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
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  margin: 15px 0;
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
      margin-top: 5px;
}

.bell {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: #161F2E;
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
  width: 28px;
  height: 28px;
}

.next-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.next-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
  color: #f5f5f785;
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
