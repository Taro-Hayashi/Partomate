import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces, including Tailscale
    port: 15173,
    allowedHosts: true, // Allow all hostnames (like mac-mini-1) to bypass Vite's host check
  },
  preview: {
    host: true,
    port: 15173,
    allowedHosts: true,
  },
})
