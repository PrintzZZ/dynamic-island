import MusicApp from './MusicApp.vue'
import MusicCompact from './MusicCompact.vue'

// 岛内应用清单（manifest）
export default {
  id: 'music',
  name: '音乐',
  icon: '♪',
  accent: '#30D158',
  component: MusicApp,
  compact: MusicCompact,
  // 展开态是"半高"：封面 + 两行歌词 + 进度 + 控制器，不需要 480 那么高。
  // 机制见 useIsland 的 expandedHeight（和 expandedW 同一套）。
  expandedH: 248,
}
