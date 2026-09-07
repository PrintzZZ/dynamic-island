import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'

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
})
