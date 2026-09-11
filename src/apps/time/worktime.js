// 工作时间计算的纯函数集合
//
// 产品定位（见需求第六节）：不是考勤系统，只回答两件事 ——
// 「今天的工作时间已经过去多少」「还剩多少」。
// 午休不计入工作时长；不显示负数时间；非工作日显示休息。

export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 'HH:MM' → 一天中的分钟数；非法输入返回 fallback
export function hm(hhmm, fallback = 0) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  if (!m) return fallback
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return fallback
  return h * 60 + min
}

// 分钟数 → 'HH:MM'
export function hmText(min) {
  const v = Math.max(0, Math.round(Number(min) || 0))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

// 分钟数 → '5h38m' / '38m'
export function durText(min) {
  const v = Math.max(0, Math.round(Number(min) || 0))
  const h = Math.floor(v / 60)
  const m = v % 60
  if (h <= 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h${m}m`
}

export function defaultSchedule() {
  return {
    enabled: true,
    start: '09:00',
    end: '18:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    weekdays: [1, 2, 3, 4, 5], // 周一 ~ 周五
  }
}

// 归一化配置：保证顺序合理，避免用户填出 start > end 之类的组合
export function normalizeSchedule(raw) {
  const base = defaultSchedule()
  const s = { ...base, ...(raw || {}) }
  s.enabled = s.enabled !== false
  s.weekdays = Array.isArray(s.weekdays) && s.weekdays.length
    ? [...new Set(s.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : base.weekdays

  let start = hm(s.start, 540)
  let end = hm(s.end, 1080)
  if (end <= start) end = Math.min(1439, start + 60) // 至少留 1 小时
  let lunchStart = hm(s.lunchStart, 720)
  let lunchEnd = hm(s.lunchEnd, 780)
  // 午休收敛到工作时段内，且必须 end > start
  lunchStart = Math.min(Math.max(lunchStart, start), end)
  lunchEnd = Math.min(Math.max(lunchEnd, lunchStart), end)

  return {
    enabled: s.enabled,
    start: hmText(start),
    end: hmText(end),
    lunchStart: hmText(lunchStart),
    lunchEnd: hmText(lunchEnd),
    weekdays: s.weekdays,
  }
}

// 午休与工作时段的重叠时长（分钟）
function lunchOverlap(scheduleMin, from, to) {
  const { start, end, lunchStart, lunchEnd } = scheduleMin
  const ls = Math.max(lunchStart, start)
  const le = Math.min(lunchEnd, end)
  if (le <= ls) return 0
  return Math.max(0, Math.min(to, le) - Math.max(from, ls))
}

function toMinutesObj(schedule) {
  return {
    start: hm(schedule.start, 540),
    end: hm(schedule.end, 1080),
    lunchStart: hm(schedule.lunchStart, 720),
    lunchEnd: hm(schedule.lunchEnd, 780),
  }
}

/**
 * 计算某一天的工作时间统计
 * @param {object} schedule 作息配置（会先 normalize）
 * @param {Date} [when] 参照时刻，默认当前
 * @returns {{
 *   enabled: boolean, isWorkday: boolean, status: 'off'|'rest'|'before'|'working'|'lunch'|'after',
 *   startMin:number, endMin:number, totalMin:number, workedMin:number, remainMin:number, percent:number,
 *   startText:string, endText:string, lunchStartText:string, lunchEndText:string,
 *   segments: {kind:'work'|'lunch', from:number, to:number, width:number}[],
 *   nextWorkday: { day:number, name:string, startText:string }|null
 * }}
 */
export function workStats(rawSchedule, when = new Date()) {
  const schedule = normalizeSchedule(rawSchedule)
  const m = toMinutesObj(schedule)
  const nowMin = when.getHours() * 60 + when.getMinutes()
  const day = when.getDay()

  const totalMin = Math.max(0, m.end - m.start - lunchOverlap(m, m.start, m.end))
  const isWorkday = schedule.weekdays.includes(day)

  const base = {
    enabled: schedule.enabled,
    isWorkday,
    startMin: m.start,
    endMin: m.end,
    totalMin,
    workedMin: 0,
    remainMin: totalMin,
    percent: 0,
    startText: schedule.start,
    endText: schedule.end,
    lunchStartText: schedule.lunchStart,
    lunchEndText: schedule.lunchEnd,
    hasLunch: lunchOverlap(m, m.start, m.end) > 0,
    segments: buildSegments(m),
    nextWorkday: null,
  }

  if (!schedule.enabled) {
    return { ...base, status: 'off' }
  }

  if (!isWorkday) {
    return { ...base, status: 'rest', nextWorkday: nextWorkdayFrom(when, schedule.weekdays, schedule.start) }
  }

  if (nowMin < m.start) {
    return { ...base, status: 'before', remainMin: totalMin, beforeMin: m.start - nowMin }
  }

  if (nowMin >= m.end) {
    return { ...base, status: 'after', workedMin: totalMin, remainMin: 0, percent: 100 }
  }

  const elapsed = nowMin - m.start
  const worked = Math.max(0, elapsed - lunchOverlap(m, m.start, nowMin))
  const percent = totalMin > 0 ? Math.min(100, Math.round((worked / totalMin) * 100)) : 0
  const inLunch = nowMin >= m.lunchStart && nowMin < m.lunchEnd && lunchOverlap(m, m.start, m.end) > 0

  return {
    ...base,
    status: inLunch ? 'lunch' : 'working',
    workedMin: worked,
    remainMin: Math.max(0, totalMin - worked),
    percent,
  }
}

// 时间轴分段（用于「工作时间详情」里的进度条）
export function buildSegments(m) {
  const segs = []
  const total = Math.max(1, m.end - m.start)
  const push = (kind, from, to) => {
    if (to <= from) return
    segs.push({ kind, from, to, width: ((to - from) / total) * 100 })
  }
  if (m.lunchEnd > m.lunchStart && m.lunchStart >= m.start && m.lunchEnd <= m.end) {
    push('work', m.start, m.lunchStart)
    push('lunch', m.lunchStart, m.lunchEnd)
    push('work', m.lunchEnd, m.end)
  } else {
    push('work', m.start, m.end)
  }
  return segs
}

// 下一个工作日
export function nextWorkdayFrom(when, weekdays, startText) {
  const days = Array.isArray(weekdays) && weekdays.length ? weekdays : [1, 2, 3, 4, 5]
  for (let i = 1; i <= 7; i++) {
    const d = (when.getDay() + i) % 7
    if (days.includes(d)) {
      return { day: d, offset: i, name: i === 1 ? '明天' : WEEKDAY_NAMES[d], startText }
    }
  }
  return null
}

// 时间轴上的刻度（开始 / 午休起 / 午休止 / 结束）
export function timelineMarks(m) {
  const marks = [{ min: m.start, label: hmText(m.start), sub: '上班' }]
  if (m.lunchEnd > m.lunchStart) {
    const lunch = lunchOverlap(m, m.start, m.end)
    if (lunch > 0) {
      marks.push({ min: m.lunchStart, label: hmText(m.lunchStart), sub: `午休 ${durText(lunch)}` })
      marks.push({ min: m.lunchEnd, label: hmText(m.lunchEnd), sub: '' })
    }
  }
  marks.push({ min: m.end, label: hmText(m.end), sub: '下班' })
  return marks
}

// 当前时刻在时间轴上的位置（0..1），不在工作时段内返回 null
export function nowMarker(m, when = new Date()) {
  const nowMin = when.getHours() * 60 + when.getMinutes()
  if (nowMin < m.start || nowMin > m.end) return null
  return (nowMin - m.start) / Math.max(1, m.end - m.start)
}
