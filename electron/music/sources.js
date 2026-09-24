// 歌词与封面的来源。
//
// 歌词：本地覆盖 → 磁盘缓存 → 在线三引擎（LRCLIB → 网易云 → QQ音乐）。
//   LRCLIB 放第一位：公开开放的同步歌词库，有正式 API、无 ToS 风险；
//   网易云 / QQ 是非官方接口，可以在设置里单独关掉。
// 引擎顺序与匹配策略参考了 NetSpeed-Dynamic（见 docs/音乐模块设计.md §3.3）：
//   关键是**用时长度校验**（差 ≤3s）来消歧同名歌。
//
// 封面：SMTC 本地缩略图优先（在 smtc.js 里拿），这里只做在线兜底。
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
const TIMEOUT = 6000
// 找不到的也缓存，但过期时间短一些，避免接口临时抽风被长期记住
const NEGATIVE_TTL = 30 * 24 * 3600 * 1000
const POSITIVE_TTL = 180 * 24 * 3600 * 1000

/* ------------------------------------------------------------------ *
 * LRC 解析
 * ------------------------------------------------------------------ */
export function parseLrc(text) {
  if (!text || typeof text !== 'string') return { lines: [], meta: {} }
  const meta = {}
  const tagRe = /\[(ti|ar|al|by|offset):([^\]]*)\]/gi
  let m
  while ((m = tagRe.exec(text))) meta[m[1].toLowerCase()] = m[2].trim()
  const offset = Number(meta.offset) || 0

  const timeRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  const raw = []
  for (const line of text.split(/\r?\n/)) {
    timeRe.lastIndex = 0
    const stamps = []
    let t
    while ((t = timeRe.exec(line))) {
      const frac = t[3] ? Number(`0.${t[3]}`) : 0
      stamps.push(Math.round((Number(t[1]) * 60 + Number(t[2]) + frac) * 1000))
    }
    if (!stamps.length) continue
    const content = line.replace(timeRe, '').trim()
    if (!content) continue // 间奏的空行丢掉：这一句继续显示上一句
    for (const ms of stamps) raw.push({ t: ms - offset, text: content })
  }
  raw.sort((a, b) => a.t - b.t)

  // 有些 LRC 会给同一句打多个时间戳，去掉挨得太近的重复文本
  const lines = []
  for (const l of raw) {
    const prev = lines[lines.length - 1]
    if (prev && prev.text === l.text && l.t - prev.t < 300) continue
    lines.push({ t: Math.max(0, l.t), text: l.text })
  }
  return { lines, meta }
}

/* ------------------------------------------------------------------ *
 * 搜索词清洗
 * ------------------------------------------------------------------ */
const TITLE_PREFIX = ['正在播放: ', '正在播放：', 'Now Playing: ', 'Playing: ']
const PLACEHOLDER_ARTISTS = [
  'edge',
  'chrome',
  'firefox',
  'potplayer',
  'bilibili',
  'msedge',
]
const PLATFORM_WORDS = [
  '网易云',
  '云音乐',
  'qq音乐',
  'qqmusic',
  '酷狗',
  'kugou',
  '酷我',
  'kuwo',
  '虾米',
  '咪咕',
  '汽水音乐',
  'spotify',
  'apple music',
  'itunes',
  'youtube music',
  'soundcloud',
  'tidal',
  'deezer',
  'pandora',
  'amazon music',
  '音乐',
  'music',
]

export function cleanQuery(title, artist) {
  let t = String(title || '').trim()
  for (const p of TITLE_PREFIX) {
    if (t.startsWith(p)) {
      t = t.slice(p.length).trim()
      break
    }
  }
  const dash = t.indexOf(' - ')
  if (dash > 0) t = t.slice(0, dash).trim()

  const a = String(artist || '').trim()
  const lower = a.toLowerCase()
  const isPlaceholder =
    !a ||
    PLACEHOLDER_ARTISTS.includes(lower) ||
    PLATFORM_WORDS.some((w) => lower.includes(w))
  return { title: t, artist: isPlaceholder ? '' : a }
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */
async function getJson(url, opts = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT)
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// 歌手串在不同引擎里的分隔方式完全不同：LRCLIB 用 ", "、网易云把多歌手**直接拼在一起**
// （"Justin BieberLudacris"）、播放器窗口标题用 "/"。所以按分隔符切成集合判断，
// 而不是拿整串互相包含 —— 否则多歌手歌永远匹配不上。
function artistTokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[/,;&、·|]+|\s+(?:feat|ft)\.?\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
}
function artistMatches(want, ar) {
  if (!want) return true
  const a = String(ar || '').toLowerCase()
  if (!a) return false
  if (a.includes(want) || want.includes(a)) return true
  const wt = artistTokens(want)
  const at = artistTokens(a)
  return wt.some((x) => x.length >= 2 && at.some((y) => y.includes(x) || x.includes(y)))
}

// 歌名匹配 &&（歌手匹配 || 时长差 ≤ 3s），有时长时取最接近的一条
function pickBest(list, q, durMs, read) {
  const wantName = q.title.toLowerCase()
  const wantArtist = q.artist.toLowerCase()
  let best = null
  let bestDiff = Infinity
  for (const item of list) {
    const { name, artists, dur, id, mid } = read(item)
    if (!id && !mid) continue
    const n = String(name || '').toLowerCase()
    const ar = String(artists || '').toLowerCase()
    const nameOk = n && (n.includes(wantName) || wantName.includes(n))
    const artistOk = artistMatches(wantArtist, ar)
    if (!nameOk) continue
    if (durMs > 0 && dur > 0) {
      const diff = Math.abs(dur - durMs)
      if ((artistOk || diff <= 3000) && diff < bestDiff) {
        bestDiff = diff
        best = item
      }
    } else if (artistOk) {
      return item
    }
  }
  return best
}

/* ------------------------------------------------------------------ *
 * 三个引擎
 * ------------------------------------------------------------------ */
async function fromLrclib(q, durMs) {
  const sec = Math.round((durMs || 0) / 1000)
  // 有时长就走精确的 /api/get，一次命中
  if (sec) {
    const url =
      `https://lrclib.net/api/get?track_name=${encodeURIComponent(q.title)}` +
      `&artist_name=${encodeURIComponent(q.artist)}&duration=${sec}`
    const j = await getJson(url)
    if (j) {
      const lrc = j.syncedLyrics || j.plainLyrics || ''
      if (lrc) {
        return {
          lrc,
          title: j.trackName || q.title,
          artist: j.artistName || q.artist,
          source: 'LRCLIB',
          durMs: Math.round((Number(j.duration) || 0) * 1000),
        }
      }
    }
  }
  // 没时长（窗口标题兜底就是这种情况）时 /api/get 用不了，改用 /api/search 自己挑一条。
  // 这一步很关键：否则兜底路径会把最可靠的主引擎整个跳过，只剩两个非官方接口。
  const list = await getJson(
    `https://lrclib.net/api/search?track_name=${encodeURIComponent(q.title)}&artist_name=${encodeURIComponent(q.artist)}`
  )
  if (!Array.isArray(list) || !list.length) return null
  const hit = pickBest(list, q, durMs, (r) => ({
    id: r.id,
    name: r.trackName,
    artists: r.artistName,
    dur: Math.round((Number(r.duration) || 0) * 1000), // LRCLIB 的 duration 是秒
  }))
  if (!hit) return null
  const lrc = hit.syncedLyrics || hit.plainLyrics || ''
  if (!lrc) return null
  return {
    lrc,
    title: hit.trackName || q.title,
    artist: hit.artistName || q.artist,
    source: 'LRCLIB',
    durMs: Math.round((Number(hit.duration) || 0) * 1000),
  }
}

async function fromNetease(q, durMs) {
  const body = new URLSearchParams({ s: `${q.title} ${q.artist}`.trim(), type: '1', limit: '8', offset: '0' })
  const j = await getJson('https://music.163.com/api/search/get/web', {
    method: 'POST',
    body,
    headers: { Referer: 'https://music.163.com' },
  })
  const songs = j && j.result && j.result.songs
  if (!Array.isArray(songs) || !songs.length) return null
  const hit = pickBest(songs, q, durMs, (s) => ({
    id: s.id,
    name: s.name,
    artists: (s.artists || s.ar || []).map((a) => a.name).join(''),
    dur: Number(s.duration || s.dt || 0),
  }))
  if (!hit) return null
  const lj = await getJson(`https://music.163.com/api/song/lyric?id=${hit.id}&lv=-1&kv=-1&tv=-1`, {
    headers: { Referer: 'https://music.163.com' },
  })
  const lrc = lj && lj.lrc && lj.lrc.lyric
  if (!lrc) return null
  return {
    lrc,
    title: hit.name || q.title,
    artist: (hit.artists || hit.ar || []).map((a) => a.name).join(' / ') || q.artist,
    source: '网易云',
    durMs: Number(hit.duration || hit.dt || 0),
  }
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#32;/g, ' ')
    .replace(/&#45;/g, '-')
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

async function fromQQ(q, durMs) {
  const w = encodeURIComponent(`${q.title} ${q.artist}`.trim())
  const j = await getJson(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${w}&n=5&format=json`, {
    headers: { Referer: 'https://y.qq.com/' },
  })
  const songs = j && j.data && j.data.song && j.data.song.list
  if (!Array.isArray(songs) || !songs.length) return null
  const hit = pickBest(songs, q, durMs, (s) => ({
    mid: s.songmid,
    name: s.songname,
    artists: (s.singer || []).map((x) => x.name).join(''),
    dur: Number(s.interval || 0) * 1000,
  }))
  if (!hit) return null
  const lj = await getJson(
    `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${hit.songmid}&format=json&nobase64=1`,
    { headers: { Referer: 'https://y.qq.com/' } }
  )
  const lrc = lj && lj.lyric ? decodeEntities(lj.lyric) : ''
  if (!lrc) return null
  return {
    lrc,
    title: hit.songname || q.title,
    artist: (hit.singer || []).map((x) => x.name).join(' / ') || q.artist,
    source: 'QQ音乐',
    durMs: Number(hit.interval || 0) * 1000,
  }
}

/* ------------------------------------------------------------------ *
 * 缓存与本地覆盖
 * ------------------------------------------------------------------ */
function lyricsRoot() {
  return path.join(app.getPath('userData'), 'lyrics')
}
function cacheFile(key) {
  return path.join(lyricsRoot(), 'cache', `${key}.json`)
}
// 缓存 key 必须带上引擎顺序：同一个"歌名|歌手|时长"在网易云源下是简体、在 LRCLIB 源下
// 可能是繁体，只按歌名缓存会让换播放器之后拿到另一家的版本（反之亦然）。
function keyOf(q, durMs, engines) {
  const eng = Array.isArray(engines) ? engines.join('+') : ''
  return crypto
    .createHash('sha1')
    .update(`${q.title}|${q.artist}|${Math.round((durMs || 0) / 1000)}|${eng}`)
    .digest('hex')
    .slice(0, 16)
}
function readCache(key) {
  try {
    const j = JSON.parse(fs.readFileSync(cacheFile(key), 'utf8'))
    // v2 起缓存里多存了 dur（进度总长）。v1 条目没有这个字段，直接当未命中重新取，
    // 否则升级后老缓存会让"有歌词但没进度"一直持续到缓存自然过期。
    if (!j || j.v !== 2) return null
    const ttl = j.found ? POSITIVE_TTL : NEGATIVE_TTL
    if (Date.now() - (j.at || 0) > ttl) return null
    return j
  } catch {
    return null
  }
}
function writeCache(key, found, lrc, source, syncedTitle, durMs) {
  try {
    fs.mkdirSync(path.join(lyricsRoot(), 'cache'), { recursive: true })
    fs.writeFileSync(
      cacheFile(key),
      JSON.stringify({ v: 2, at: Date.now(), found, lrc: lrc || '', source: source || '', title: syncedTitle || '', dur: Number(durMs) || 0 }),
      'utf8'
    )
  } catch {
    /* ignore */
  }
}
function readLocalOverride(q) {
  const dir = lyricsRoot()
  const names = [`${q.artist} - ${q.title}.lrc`, `${q.title}.lrc`]
  for (const n of names) {
    if (!n.trim() || n.startsWith(' - ')) continue
    try {
      const p = path.join(dir, n)
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
    } catch {
      /* ignore */
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * 对外：找歌词
 * ------------------------------------------------------------------ */
// 返回 { lines, synced, source } 或 null
export async function findLyrics({ title, artist, durationMs, online = true, engines } = {}) {
  const q = cleanQuery(title, artist)
  if (!q.title) return null

  // 引擎顺序先定下来：它既决定去问谁，也进缓存 key（见 keyOf）
  const order = Array.isArray(engines) && engines.length ? engines : ['lrclib', 'netease', 'qq']

  const local = readLocalOverride(q)
  if (local) {
    const { lines } = parseLrc(local)
    if (lines.length) return { lines, synced: true, source: '本地文件' }
  }

  const key = keyOf(q, durationMs, order)
  const cached = readCache(key)
  if (cached) {
    if (!cached.found) return null
    const { lines } = parseLrc(cached.lrc)
    if (lines.length) return { lines, synced: true, source: cached.source || '缓存', durMs: Number(cached.dur) || 0 }
    return null
  }

  if (!online) return null

  let got = null
  let lines = []
  for (const name of order) {
    let res = null
    try {
      if (name === 'lrclib') res = await fromLrclib(q, durationMs)
      else if (name === 'netease') res = await fromNetease(q, durationMs)
      else if (name === 'qq') res = await fromQQ(q, durationMs)
    } catch {
      res = null
    }
    if (!res || !res.lrc) continue
    // 关键：只认"能解析出带时间轴行"的结果。LRCLIB 有些歌只有纯文本歌词（plainLyrics），
    // 它是非空的但解析出 0 行 —— 早先在这里 break 就等于当场收工、写负缓存，
    // 网易云/QQ 明明有带时间轴的结果也永远拿不到（"今天你要嫁给我"就是这么丢的）。
    const parsed = parseLrc(res.lrc).lines
    if (!parsed.length) continue
    got = res
    lines = parsed
    break
  }

  if (!got || !lines.length) {
    writeCache(key, false, '', '', '')
    return null
  }
  const durMs = Number(got.durMs) || 0
  writeCache(key, true, got.lrc, got.source, got.title, durMs)
  return { lines, synced: true, source: got.source, durMs }
}

/* ------------------------------------------------------------------ *
 * 对外：在线兜底封面
 * ------------------------------------------------------------------ */
const PLACEHOLDER_COVER =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3a3c"/><stop offset="1" stop-color="#1c1c1e"/></linearGradient></defs><rect width="120" height="120" rx="16" fill="url(#g)"/><circle cx="60" cy="60" r="16" fill="none" stroke="#8e8e93" stroke-width="2"/><circle cx="60" cy="60" r="4" fill="#8e8e93"/></svg>'
  ).toString('base64')

export function placeholderCover() {
  return PLACEHOLDER_COVER
}

export async function findCover({ title, artist } = {}) {
  const q = cleanQuery(title, artist)
  if (!q.title) return ''
  const term = `${q.title} ${q.artist}`.trim()

  // 两路并发抢，谁先给用谁
  const tasks = [
    (async () => {
      const j = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=1`)
      const url = j && j.results && j.results[0] && j.results[0].artworkUrl100
      return url ? url.replace('100x100bb', '300x300bb') : ''
    })(),
    (async () => {
      const j = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(`track:"${q.title}" artist:"${q.artist}"`)}&limit=1`)
      const url = j && j.data && j.data[0] && j.data[0].album && (j.data[0].album.cover_medium || j.data[0].album.cover_big)
      return url || ''
    })(),
  ]
  try {
    return (await Promise.race(tasks)) || ''
  } catch {
    return ''
  }
}
