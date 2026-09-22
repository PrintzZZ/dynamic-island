import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

// base 使用相对路径，保证生产环境下 file:// 加载资源正常
export default defineConfig({
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main.js',
      },
      preload: {
        input: 'electron/preload.js',
      },
    }),
  ],
  base: './',
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    rollupOptions: {
      // 两个渲染页：灵动岛（index.html）+ 独立设置窗口（settings.html）
      input: {
        main: `${root}index.html`,
        settings: `${root}settings.html`,
      },
    },
  },
})
