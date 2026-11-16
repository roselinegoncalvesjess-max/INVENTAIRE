import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En développement, les appels /api sont redirigés vers le serveur Node.js (port 3001)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" }
  }
});
