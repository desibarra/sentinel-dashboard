/// <reference types="vitest" />
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv, Plugin } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

export default defineConfig(({ mode }) => {
  // Carga variables de entorno (.env y variables de sistema)
  const env = loadEnv(mode, path.resolve(import.meta.dirname), "");
  const isDev = mode === "development";

  /**
   * Plugin para inyectar dinámicamente el script de Umami
   * Solo si VITE_ANALYTICS_ENDPOINT y VITE_ANALYTICS_WEBSITE_ID están definidos.
   */
  const umamiHtmlPlugin = (): Plugin => ({
    name: "umami-html-plugin",
    transformIndexHtml(html) {
      const endpoint = env.VITE_ANALYTICS_ENDPOINT;
      const websiteId = env.VITE_ANALYTICS_WEBSITE_ID;

      if (!endpoint || !websiteId) {
        return html; // No inyectar nada si faltan las variables
      }

      // Inyectar el script al final del <head> antes de cerrarlo
      const umamiScript = `\n    <script async defer src="${endpoint}" data-website-id="${websiteId}"></script>\n  `;
      return html.replace("</head>", `${umamiScript}</head>`);
    },
  });

  return {
    plugins: [
      react(),
      tailwindcss(),
      // 1. Inyección dinámica de Umami (solo si las env existen)
      umamiHtmlPlugin(),
      // 2. Plugins de desarrollo: solo se cargan si mode === 'development'
      // Esto evita que se intente abrir una conexión WebSocket a ws://localhost:8081 en producción
      ...(isDev ? [jsxLocPlugin(), vitePluginManusRuntime()] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      sourcemap: isDev,
    },
    server: {
      port: 5173,
      strictPort: false,
      host: true,
      allowedHosts: [
        ".manuspre.computer",
        ".manus.computer",
        ".manus-asia.computer",
        ".manuscomputer.ai",
        ".manusvm.computer",
        "localhost",
        "127.0.0.1",
      ],
      proxy: {
        "/api/sat": {
          target: "https://consultaqr.facturaelectronica.sat.gob.mx",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/sat/, ""),
          secure: false,
        },
        "/api": {
          target: "http://localhost:5000",
          changeOrigin: true,
          secure: false,
        },
      },
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: [],
    },
  };
});

/**
 * CHECKLIST DE DESPLIEGUE (Seguir en VPS):
 * 1. Definir variables en .env del VPS:
 *    VITE_ANALYTICS_ENDPOINT=https://tu-instancia-umami.com
 *    VITE_ANALYTICS_WEBSITE_ID=uuid-de-sitio
 * 
 * 2. Limpiar y reconstruir:
 *    rm -rf dist
 *    npm run build
 * 
 * 3. Reiniciar el servicio:
 *    pm2 restart sentinel
 * 
 * 4. Verificar:
 *    - El WebSocket ws://localhost:8081 ya no debe aparecer en consola.
 *    - Al ver el código fuente, solo verás el script de Umami si las variables estaban definidas.
 */
