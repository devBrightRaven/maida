import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'child_process'
import { version } from './package.json'

// Committer date of HEAD (source-of-truth release date).
// Falls back to build-machine date if git is unavailable (e.g. shallow clone).
const buildDate = (() => {
    try {
        return execFileSync('git', ['log', '-1', '--format=%cI']).toString().trim().split('T')[0];
    } catch {
        return new Date().toISOString().split('T')[0];
    }
})();

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [react()],
    define: {
        '__APP_VERSION__': JSON.stringify(version),
        '__BUILD_DATE__': JSON.stringify(buildDate)
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
