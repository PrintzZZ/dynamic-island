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

  <Card title="关于同步" icon="info">
    <Row label="为什么有时歌词对不齐" stack>
      <div class="st-card-foot" style="padding: 0">
        歌词跟着播放进度走。Chrome、Spotify 这类播放器会上报进度，可以精确同步；
        <b>网易云音乐不上报进度</b>（系统接口里拿不到），只能按本地计时估算 ——
        中途打开、拖动进度条都会让它偏掉。这时在展开面板里点某一句歌词，即可把进度对齐到那一句。
      </div>
    </Row>
  </Card>
</template>

<script setup>
import { onMounted, ref } from 'vue'
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
})
async function openDir() {
  try {
    await window.api.musicOpenLyricsDir()
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
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
