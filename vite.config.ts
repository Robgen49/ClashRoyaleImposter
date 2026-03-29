import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Production: фронт раздаётся с бэка по префиксу /app — иначе HTML тянет /assets/... и получает 404.
// Dev: корень /, чтобы `npm run dev` открывался как обычно.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/app/' : '/',
  plugins: [react()],
}))
