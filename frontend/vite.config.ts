import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// 開発時は API をバックエンドへプロキシ。本番は Caddy が /api を api コンテナへ転送する。
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Karidasu — 備品貸出管理",
        short_name: "Karidasu",
        description: "QRをかざすだけの備品・資産 貸出/返却・棚卸",
        theme_color: "#0f766e",
        background_color: "#ffffff",
        display: "standalone",
        lang: "ja",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // API GET はネット優先＋フォールバックでキャッシュ（オフライン参照用）。
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
