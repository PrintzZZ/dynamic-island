import { createApp } from 'vue'
import App from './App.vue'
import './apps' // 注册所有岛内应用
import './styles/main.css'
import { hydrate, listen } from './composables/useSettings'

createApp(App).mount('#app')

// 设置存在主进程，异步拉一次；拉到之前先用默认值渲染，不会闪白
hydrate().then(() => listen())
