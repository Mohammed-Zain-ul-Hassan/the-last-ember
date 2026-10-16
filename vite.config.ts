import { defineConfig } from "vite";
export default defineConfig({ base: "./", server: { port: 5183, strictPort: true }, build: { chunkSizeWarningLimit: 1200 } });
