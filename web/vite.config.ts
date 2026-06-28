import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_URL ?? "";

  let catalogUrlPattern: RegExp;
  try {
    if (apiBase) {
      const apiOrigin = new URL(apiBase).origin;
      catalogUrlPattern = new RegExp(
        `^${apiOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/resources`,
      );
    } else {
      catalogUrlPattern = /^\/resources/;
    }
  } catch {
    catalogUrlPattern = /^\/resources/;
  }

  return {
    build: {
      chunkSizeWarningLimit: 800, // Budget baseline
    },
    plugins: [
      react(),
      visualizer({
        filename: "stats.html",
        brotliSize: true,
        gzipSize: true,
      }),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg"],
        manifest: {
          name: "MindVault",
          short_name: "MindVault",
          description:
            "Payment-protected vault for digital resources on Stellar using HTTP 402 and x402.",
          theme_color: "#4f46e5",
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: "index.html",
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: catalogUrlPattern,
              handler: "NetworkFirst",
              options: {
                cacheName: "mindvault-catalog",
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 32,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        "/resources": "http://localhost:4021",
      },
    },
  };
});
