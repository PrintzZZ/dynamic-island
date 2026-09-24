import EfficiencyApp from './EfficiencyApp.vue'
import EfficiencyCompact from './EfficiencyCompact.vue'

// 岛内应用清单（manifest）：icon 是 compact 缺省时的兜底字符，
// accent 是标签栏圆点色。这里已有 compact，所以 icon 实际用不到。
export default {
  id: 'efficiency',
  name: '效率',
  icon: '⚡',
  accent: '#5AC8FA',
  component: EfficiencyApp,
  compact: EfficiencyCompact,
}
