<template>
  <Card title="跟随的播放器" icon="volume">
    <Row label="播放器" desc="跟随哪个应用的媒体会话。自动 = 优先已知音乐应用，忽略浏览器里的视频">
      <Select
        :model-value="s.musicPlayer"
        :options="playerOptions"
        @update:model-value="set({ musicPlayer: $event })"
      />
    </Row>
    <Row label="紧凑态显示歌词" desc="在放歌时占用胶囊，显示当前一句和下一句">
      <Toggle
        :model-value="s.musicLyricPill !== false"
        @update:model-value="set({ musicLyricPill: $event })"
      />
    </Row>
  </Card>

  <Card title="歌词来源" icon="quote">
    <Row
      label="在线获取歌词"
      desc="在线找歌词会把歌名与歌手发送到公开歌词库。关掉后只用下面的本地目录"
    >
      <Toggle
        :model-value="s.musicLyricOnline !== false"
        @update:model-value="set({ musicLyricOnline: $event })"
      />
    </Row>
    <Row
      label="歌词引擎"
      desc="LRCLIB 是公开开放的同步歌词库（默认引擎）；网易云 / QQ 是非官方接口，失效时关掉即可"
      stack
    >
      <div class="st-checks">
        <Check
          :model-value="s.musicLyricNetease !== false"
          label="网易云"
          @update:model-value="set({ musicLyricNetease: $event })"
        />
        <Check
          :model-value="s.musicLyricQQ !== false"
          label="QQ音乐"
          @update:model-value="set({ musicLyricQQ: $event })"
        />
      </div>
    </Row>
  </Card>

  <Card title="本地歌词" icon="folder">
    <Row label="歌词目录" desc="本地文件优先于在线结果" stack>
      <div class="st-lyric-dir">
        <code>{{ dir || '读取中…' }}</code>
        <button class="st-btn ghost" @click="openDir">打开目录</button>
      </div>
      <div class="st-card-foot" style="padding: 6px 0 0">
        把 <code>.lrc</code> 放进去即可覆盖在线结果，文件名用
        <code>歌手 - 歌名.lrc</code> 或 <code>歌名.lrc</code>。
      </div>
    </Row>
  </Card>

  <Card title="网易云静默通道" icon="volume">
    <Row
      label="读取真实进度 / 拖动生效"
      desc="网易云不上报系统进度。开启后通过它自己的调试接口读取真实进度并真正 seek —— 需要以调试端口重启一次网易云"
    >
      <Toggle
        :model-value="s.musicNeteaseChannel === true"
        @update:model-value="onToggleChannel"
      />
    </Row>
    <Row label="通道状态" stack>
      <div class="nc-row">
        <code>{{ channelStatus }}</code>
        <button class="st-btn ghost" :disabled="busy" @click="probe">检测</button>
        <button class="st-btn ghost" :disabled="busy" @click="restart">重启网易云</button>
      </div>
      <div class="st-card-foot" style="padding: 6px 0 0">
        调试端口 {{ s.musicNeteasePort }}。重启会退出当前播放器，之后由本程序带调试参数拉起；
        连不上时自动退回本地计时，不会假装有真实进度。
      </div>
    </Row>
  </Card>

  <Card title="关于同步" icon="info">
    <Row label="为什么有时歌词对不齐" stack>
      <div class="st-card-foot" style="padding: 0">
        歌词跟着播放进度走。Chrome、Spotify 这类播放器会上报进度，可以精确同步；
        <b>网易云音乐不上报进度</b>（系统接口里拿不到），默认只能按本地计时估算 ——
        中途打开、拖动进度条都会让它偏掉。这时在展开面板里点某一句歌词，即可把进度对齐到那一句。
        想让它也精确，就打开上面的「网易云静默通道」。
      </div>
    </Row>
  </Card>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import Card from '../../components/Card.vue'
import Row from '../../components/Row.vue'
import Toggle from '../../components/Toggle.vue'
import Select from '../../components/Select.vue'
import Check from '../../components/Check.vue'
import { settings, update } from '../../../composables/useSettings'

const s = settings
const set = (patch) => update(patch)

const playerOptions = [
  { value: 'auto', label: '自动' },
  { value: 'netease', label: '网易云音乐' },
  { value: 'qqmusic', label: 'QQ音乐' },
  { value: 'kugou', label: '酷狗音乐' },
  { value: 'spotify', label: 'Spotify' },
  { value: 'browser', label: '浏览器' },
]

const dir = ref('')
onMounted(async () => {
  // 打开这一页说明用户确实在关心音乐，和「展开到音乐面板」一样算数：
  // 让主进程按需拉起常驻的 SMTC helper（默认不启动，实测常驻约 100MB）。
  try {
    if (window.api.musicArm) window.api.musicArm()
  } catch {
    /* ignore */
  }
  try {
    dir.value = (await window.api.musicLyricsDir()) || ''
  } catch {
    dir.value = ''
  }
  if (s.musicNeteaseChannel) await probe()
})
const busy = ref(false)
const busyMsg = ref('')
const probeState = ref('') // '' | 'ok' | 'bad'
const probeMsg = ref('')

// 注意：连接本身建立在**灵动岛那个渲染进程**里（useNeteaseChannel 是模块级状态），
// 设置窗口是另一个 renderer，拿不到那份状态 —— 所以这里只探测端口通不通：
// 端口通 = 岛上能连上。之前直接读 channel.state，于是这里永远显示"未连接"。
const channelStatus = computed(() => {
  if (busy.value && busyMsg.value) return busyMsg.value
  if (!s.musicNeteaseChannel) return '未开启'
  if (probeState.value === 'ok') return `调试端口可用（${s.musicNeteasePort}）· 灵动岛会自动连接`
  if (probeState.value === 'bad') return probeMsg.value || `调试端口 ${s.musicNeteasePort} 不可用`
  return '未检测'
})

async function onToggleChannel(on) {
  set({ musicNeteaseChannel: !!on })
  if (on) await probe()
}

async function probe() {
  busy.value = true
  busyMsg.value = '检测中…'
  try {
    const r = await window.api.musicNeteaseProbe(s.musicNeteasePort)
    probeState.value = r && r.ok ? 'ok' : 'bad'
    probeMsg.value = (r && !r.ok && r.reason) || ''
  } catch {
    probeState.value = 'bad'
    probeMsg.value = '检测失败'
  }
  busy.value = false
  busyMsg.value = ''
}

async function restart() {
  busy.value = true
  busyMsg.value = '正在重启网易云…（会中断当前播放）'
  try {
    const r = await window.api.musicNeteaseRelaunch(s.musicNeteasePort)
    probeState.value = r && r.ok ? 'ok' : 'bad'
    probeMsg.value = (r && !r.ok && r.reason) || ''
    busyMsg.value = r && r.ok ? '已重启，调试端口可用' : ''
  } catch {
    busyMsg.value = '重启失败'
  }
  busy.value = false
  if (busyMsg.value) {
    const msg = busyMsg.value
    setTimeout(() => {
      if (busyMsg.value === msg) busyMsg.value = ''
    }, 8000)
  }
}

async function openDir() {
  try {
    await window.api.musicOpenLyricsDir()
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.nc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.nc-row code {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--st-text-3);
  background: var(--st-card);
  border: 1px solid var(--st-line);
  border-radius: 8px;
  padding: 6px 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.st-lyric-dir {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.st-lyric-dir code {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--st-text-3);
  background: var(--st-card);
  border: 1px solid var(--st-line);
  border-radius: 8px;
  padding: 6px 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
