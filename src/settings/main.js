import { createApp } from 'vue'
import SettingsApp from './SettingsApp.vue'
// 只要 @font-face，不要岛那份 main.css（它会把 body 设成透明 + 面向胶囊的字体栈）
import '../styles/fonts.css'
import './settings.css'

createApp(SettingsApp).mount('#settings')
