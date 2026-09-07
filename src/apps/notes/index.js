import NotesApp from './NotesApp.vue'
import NotesCompact from './NotesCompact.vue'

// 岛内应用清单（manifest）：icon 为可选符号，accent 为主题色
export default {
  id: 'notes',
  name: '便签',
  icon: '✎',
  accent: '#FFD60A',
  component: NotesApp, // 展开态内容
  compact: NotesCompact, // 紧凑态内容（可选，缺省则显示 icon + name）
}
