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
  // 展开态是"歌词优先"的矮面板：顶栏 + 四行歌词窗口 + 进度 + 控制器。
  // 248 只够两行歌词（岛的 48px 标签栏还要吃掉一截），撑不起"多行歌词 + 底部渐隐"，
  // 所以给到 300；机制见 useIsland 的 expandedHeight（和 expandedW 同一套）。
  expandedH: 300,
}
