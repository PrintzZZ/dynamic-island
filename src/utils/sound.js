// 轻量音效引擎：用 Web Audio API 现场合成，无需外部音频文件
let ctx = null
let muted = false
try {
  muted = localStorage.getItem('island.sound') === '0'
} catch {
  /* ignore */
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// 合成一个带包络的单音
function tone(freq, dur = 0.08, { type = 'sine', gain = 0.12, when = 0 } = {}) {
  if (muted) return
  const ac = ensureCtx()
  if (!ac) return
  const t = ac.currentTime + when
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

// 语义化音效集合
export const sfx = {
  // 展开：上扬双音
  expand() {
    tone(660, 0.09, { gain: 0.1 })
    tone(990, 0.1, { when: 0.05, gain: 0.1 })
  },
  // 收起：下扬双音
  collapse() {
    tone(900, 0.08, { gain: 0.09, when: 0.02 })
    tone(560, 0.1, { gain: 0.09 })
  },
  // 吸附：低沉咔哒
  dock() {
    tone(480, 0.05, { type: 'triangle', gain: 0.15 })
  },
  // 解除吸附：清脆上扬
  undock() {
    tone(760, 0.05, { type: 'triangle', gain: 0.13 })
  },
  // 切换应用：短促 tick
  switchApp() {
    tone(1250, 0.04, { gain: 0.07 })
  },
  // 通知触达：清亮的上行三音，比 switchApp 更"有存在感"
  notice() {
    tone(784, 0.1, { gain: 0.09 })
    tone(1046, 0.1, { when: 0.08, gain: 0.09 })
    tone(1568, 0.16, { when: 0.16, gain: 0.08 })
  },
  // 计时开始：短促上扬，和"结束"的警报音形成对比
  start() {
    tone(523, 0.07, { gain: 0.09 })
    tone(784, 0.12, { when: 0.06, gain: 0.1 })
  },
  // 勾选待办：极轻 tick
  tick() {
    tone(1650, 0.03, { gain: 0.06 })
  },
  // 倒计时完成：四声提示
  alarm() {
    ;[0, 0.18, 0.36, 0.54].forEach((t) => tone(1470, 0.14, { when: t, gain: 0.13 }))
  },
}

export function isMuted() {
  return muted
}

export function setMuted(v) {
  muted = !!v
  try {
    localStorage.setItem('island.sound', v ? '0' : '1')
  } catch {
    /* ignore */
  }
}

export function toggleMuted() {
  setMuted(!muted)
}
