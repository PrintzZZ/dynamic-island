// 网易云静默通道（渲染进程侧）
//
// 为什么要这条通道：网易云的 SMTC 会话实测既没有时间轴、也不声明可写进度
// （pos=0 dur=0 lastUpd=0 canPos=false），只走系统媒体会话的客户端既读不到真实进度、
// 也拖不动它。它的界面是 CEF，带 --remote-debugging-port 启动时会开放 CDP，
// 我们就可以在它自己的页面里读状态、派发 seek —— 无需逆向、无需读取进程内存。
//
// 读：遍历 React fiber 树找到播放器 store，取 playing 状态；进度来自
//     播放器自己的滑块元素（[aria-label="播放进度调节"] 的 --track-precent）。
// 写：store.dispatch({ type: 'playing/setPlayingPosition', payload: { duration: 秒 } })。
//
// 连不上（端口没开 / 页面不对 / 版本改了字段）时一律退回"本地估算"，
// 不伪装成有真实进度。
import { reactive } from 'vue'

export const channel = reactive({
  state: 'idle', // idle | connecting | connected | error
  reason: '',
  port: 0,
  songId: '',
  title: '',
  positionMs: null,
  at: 0,
  playing: false,
  durationMs: 0,
})

let ws = null
let pollTimer = null
let seq = 0
const pending = new Map()

const PAGE = 'orpheus://orpheus/pub/app.html'

// 找 store 的公共前缀：遍历 fiber 树，挑出同时有 getState / dispatch 且状态里有 playing 的那个。
const FIND_STORE = `
  if (location.href.split(/[?#]/)[0] !== ${JSON.stringify(PAGE)}) return { err: 'page' }
  const root = document.getElementById('root')
  if (!root) return { err: 'root' }
  const key = Object.keys(root).find((k) => /^__react(Container|Fiber)\\$/.test(k))
  const fiber =
    (root._reactRootContainer && root._reactRootContainer._internalRoot && root._reactRootContainer._internalRoot.current) ||
    (key && (root[key].current || root[key]))
  if (!fiber) return { err: 'fiber' }
  const seen = new Set()
  const stack = [fiber]
  let store = null
  while (stack.length && seen.size < 6000) {
    const node = stack.pop()
    if (!node || seen.has(node)) continue
    seen.add(node)
    const p = node.memoizedProps || {}
    const cands = [p.store, p.value && p.value.store, node.stateNode && node.stateNode.store]
    for (const c of cands) {
      if (c && typeof c.getState === 'function' && typeof c.dispatch === 'function' && c.getState().playing) {
        store = c
        break
      }
    }
    if (store) break
    if (node.sibling) stack.push(node.sibling)
    if (node.child) stack.push(node.child)
  }
  if (!store) return { err: 'store' }
`

const READ_EXPR = `(() => {
${FIND_STORE}
  const pl = store.getState().playing
  if (!pl || pl.isLoadingFirst || pl.isPlayingVideo) return { err: 'notrack' }
  const id = String(pl.resourceTrackId || '')
  const track = pl.curPlaying && pl.curPlaying.track
  if (!/^\\d+$/.test(id) || !track || String(track.id) !== id) return { err: 'meta' }
  const durationSec = Number(track.duration) / 1000 || Number(pl.resourceDuration) || 0
  if (!(durationSec > 0) || durationSec > 86400) return { err: 'duration' }
  const restored = pl.restoreResource
  let positionSec = NaN
  if (restored && String(restored.trackId || restored.id) === id) positionSec = Number(restored.current)
  if (!Number.isFinite(positionSec)) {
    const slider = document.querySelector('[aria-label="播放进度调节"]')
    const pct = slider ? slider.style.getPropertyValue('--track-precent').trim() : ''
    if (!/^\\d+(\\.\\d+)?%$/.test(pct)) return { err: 'position' }
    positionSec = durationSec * (Number(pct.slice(0, -1)) / 100)
  }
  if (!Number.isFinite(positionSec) || positionSec < 0) return { err: 'position' }
  return {
    ok: true,
    songId: id,
    title: String(track.name || pl.resourceName || ''),
    artist: (track.artists || track.ar || []).map((a) => a && a.name).filter(Boolean).join(' / '),
    durationSec,
    positionSec,
    playing: pl.playingState === 2,
    // 只有拿到活的 playId 才算"可控制"（恢复出来的条目还没有）
    ready: !restored && typeof pl.playId === 'string' && !!pl.playId,
    at: Date.now(),
  }
})()`

function seekExpr(songId, seconds) {
  return `(() => {
${FIND_STORE}
  const pl = store.getState().playing
  if (!pl) return { err: 'notrack' }
  if (String(pl.resourceTrackId) !== ${JSON.stringify(String(songId))}) return { err: 'track_changed' }
  if (pl.resourceType !== 'track' || pl.isPlayingVideo || pl.isLoadingFirst || pl.restoreResource) return { err: 'notready' }
  if (typeof pl.playId !== 'string' || !pl.playId) return { err: 'noplayid' }
  store.dispatch({ type: 'playing/setPlayingPosition', payload: { duration: ${Number(seconds)} } })
  return { ok: true, songId: String(pl.resourceTrackId) }
})()`
}

function onMessage(raw) {
  let msg = null
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  if (!msg || typeof msg.id !== 'number') return
  const entry = pending.get(msg.id)
  if (!entry) return
  pending.delete(msg.id)
  const res = msg.result || {}
  const value = res.result && 'value' in res.result ? res.result.value : null
  entry(value)
}

function evaluate(expression, timeoutMs = 1600) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== 1) return resolve(null)
    const id = ++seq
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(null)
    }, timeoutMs)
    pending.set(id, (v) => {
      clearTimeout(timer)
      resolve(v)
    })
    try {
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: false },
        })
      )
    } catch {
      clearTimeout(timer)
      pending.delete(id)
      resolve(null)
    }
  })
}

async function pollOnce() {
  const v = await evaluate(READ_EXPR)
  if (!v || !v.ok) {
    // 读不到（切歌中 / 广告 / 字段变了）→ 不冒充有真实进度
    channel.positionMs = null
    channel.songId = ''
    return
  }
  channel.songId = v.songId
  channel.title = v.title
  channel.positionMs = Math.round(v.positionSec * 1000)
  channel.durationMs = Math.round(v.durationSec * 1000)
  channel.playing = !!v.playing
  channel.at = Date.now()
  channel.ready = !!v.ready
}

function startPoll() {
  stopPoll()
  pollOnce()
  pollTimer = setInterval(pollOnce, 500)
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function disconnectChannel() {
  stopPoll()
  if (ws) {
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    ws = null
  }
  for (const [, cb] of pending) cb(null)
  pending.clear()
  channel.state = 'idle'
  channel.positionMs = null
  channel.songId = ''
}

export async function connectChannel(port) {
  disconnectChannel()
  const api = typeof window !== 'undefined' && window.api
  if (!api || !api.musicNeteaseProbe) {
    channel.state = 'error'
    channel.reason = '当前版本不支持（需要重启应用）'
    return false
  }
  channel.state = 'connecting'
  channel.reason = ''
  const probe = await api.musicNeteaseProbe(port)
  if (!probe || !probe.ok) {
    channel.state = 'error'
    channel.reason = (probe && probe.reason) || '探测失败'
    return false
  }
  channel.port = probe.port
  return await new Promise((resolve) => {
    let settled = false
    const done = (v) => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    let sock = null
    try {
      sock = new WebSocket(probe.wsUrl)
    } catch {
      channel.state = 'error'
      channel.reason = '无法建立 WebSocket 连接'
      return done(false)
    }
    ws = sock
    const timer = setTimeout(() => {
      try {
        sock.close()
      } catch {
        /* ignore */
      }
      channel.state = 'error'
      channel.reason = '连接超时'
      done(false)
    }, 4000)
    sock.onopen = () => {
      clearTimeout(timer)
      channel.state = 'connected'
      channel.reason = ''
      startPoll()
      done(true)
    }
    sock.onerror = () => {
      clearTimeout(timer)
      if (channel.state !== 'connected') {
        channel.state = 'error'
        channel.reason = '连接失败（调试端口被拒绝？）'
      }
      done(false)
    }
    sock.onclose = () => {
      clearTimeout(timer)
      stopPoll()
      if (channel.state === 'connected') {
        channel.state = 'error'
        channel.reason = '连接已断开'
      }
      channel.positionMs = null
      done(false)
    }
    sock.onmessage = (ev) => onMessage(ev.data)
  })
}

/** 通道给出的当前进度（毫秒）；没连上或读不到时返回 null。 */
export function channelPositionMs() {
  if (channel.state !== 'connected' || channel.positionMs == null) return null
  return channel.positionMs + (channel.playing ? Math.max(0, Date.now() - channel.at) : 0)
}

/** 让网易云真的跳到 seconds（秒）。成功与否以派发是否被接受为准。 */
export async function channelSeek(seconds) {
  if (channel.state !== 'connected' || !channel.songId) return false
  const r = await evaluate(seekExpr(channel.songId, seconds))
  if (r && r.ok) {
    // 乐观更新：下一次轮询（≤500ms）会用播放器自己的值覆盖
    channel.positionMs = Math.round(Number(seconds) * 1000)
    channel.at = Date.now()
    return true
  }
  return false
}
