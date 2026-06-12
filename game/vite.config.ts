import { defineConfig } from "vite";

export default defineConfig({
  root: "./",
  publicDir: "public",
  server: {
    port: 3000,
    open: true, // 启动后自动打开浏览器
  },
  build: {
    outDir: "dist",
  },
});
