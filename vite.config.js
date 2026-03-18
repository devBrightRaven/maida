import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [react()],
    define: {
        '__APP_VERSION__': JSON.stringify(version)
    },
    // 優化開發模式啟動速度
    optimizeDeps: {
        // 預先打包這些依賴，避免每次啟動重新處理
        include: ['react', 'react-dom']
    },
    server: {
        port: 5173,
        strictPort: true,
        // 預熱常用檔案
        warmup: {
            clientFiles: ['./src/App.jsx', './src/main.jsx']
        }
    },
    // Clear console on dev server start for Tauri
    clearScreen: false
})
