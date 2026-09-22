// 轻量音效引擎：用 Web Audio API 现场合成，无需外部音频文件
//
// 音量 / 分项开关 / 总开关都来自设置面板（见 composables/useSettings.js）。
// 设置是异步 hydrate 的，所以这里每次发声时**现读**，不做模块级缓存。
import { sfxAllowed, soundOn, update, volumeGain } from '../composables/useSettings'

let ctx = null

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
function tone(freq, dur = 0.08, { type = 'sine', gain = 0.12, when = 0, sfx = 'tick' } = {}) {
  if (!sfxAllowed(sfx)) return
  const ac = ensureCtx()
  if (!ac) return
  const vol = volumeGain()
  if (vol <= 0) return
  const t = ac.currentTime + when
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * vol), t + 0.008)
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
    tone(660, 0.09, { gain: 0.1, sfx: 'expand' })
    tone(990, 0.1, { when: 0.05, gain: 0.1, sfx: 'expand' })
  },
  // 收起：下扬双音
  collapse() {
    tone(900, 0.08, { gain: 0.09, when: 0.02, sfx: 'collapse' })
    tone(560, 0.1, { gain: 0.09, sfx: 'collapse' })
  },
  // 吸附：低沉咔哒
  dock() {
    tone(480, 0.05, { type: 'triangle', gain: 0.15, sfx: 'dock' })
  },
  // 解除吸附：清脆上扬
  undock() {
    tone(760, 0.05, { type: 'triangle', gain: 0.13, sfx: 'undock' })
  },
  // 切换应用：短促 tick
  switchApp() {
    tone(1250, 0.04, { gain: 0.07, sfx: 'switchApp' })
  },
  // 通知触达：清亮的上行三音，比 switchApp 更"有存在感"
  notice() {
    tone(784, 0.1, { gain: 0.09, sfx: 'notice' })
    tone(1046, 0.1, { when: 0.08, gain: 0.09, sfx: 'notice' })
    tone(1568, 0.16, { when: 0.16, gain: 0.08, sfx: 'notice' })
  },
  // 计时开始：短促上扬，和"结束"的警报音形成对比
  start() {
    tone(523, 0.07, { gain: 0.09, sfx: 'start' })
    tone(784, 0.12, { when: 0.06, gain: 0.1, sfx: 'start' })
  },
  // 勾选待办：极轻 tick
  tick() {
    tone(1650, 0.03, { gain: 0.06, sfx: 'tick' })
  },
  // 倒计时完成：四声提示
  alarm() {
    ;[0, 0.18, 0.36, 0.54].forEach((t) =>
      tone(1470, 0.14, { when: t, gain: 0.13, sfx: 'alarm' })
    )
  },
}

export function isMuted() {
  return !soundOn() || volumeGain() <= 0
}

export function setMuted(v) {
  // 静音状态现在统一存在设置里，岛内菜单 / 右键菜单 / 设置面板共用一份
  update({ soundEnabled: !v })
}

export function toggleMuted() {
  setMuted(!isMuted())
}
