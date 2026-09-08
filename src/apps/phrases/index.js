import PhrasesApp from './PhrasesApp.vue'
import PhrasesCompact from './PhrasesCompact.vue'

export default {
  id: 'phrases',
  name: '常用语',
  icon: '❝',
  accent: '#BF5AF2',
  component: PhrasesApp, // 展开态内容
  compact: PhrasesCompact, // 紧凑态内容
}
