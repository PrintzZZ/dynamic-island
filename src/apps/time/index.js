import TimeApp from './TimeApp.vue'
import TimeCompact from './TimeCompact.vue'

export default {
  id: 'time',
  name: '时间',
  icon: '◷',
  accent: '#FF9F0A',
  component: TimeApp,
  compact: TimeCompact,
  // 展开宽度（可选）。不写就用默认的 384；写更大的值会让展开态更宽，
  // 卡片堆栈就能"当前卡更宽 + 两侧露出更多"同时成立。
  // 注意：改这里就必须同步 electron/main.js 的 WIN.width（窗口要装得下）。
  expandedW: 384,
}
