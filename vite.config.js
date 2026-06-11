/**
 * vite.config.js
 * =============================================================================
 * PROPOSITO:
 *   Configuracion del bundler/dev-server Vite para la SPA de CS Travel.
 *
 * RESPONSABILIDADES:
 *   - Definir el puerto del servidor de desarrollo (frontend).
 *   - Configurar un "proxy" para que las llamadas Fetch a /api se reenvien
 *     automaticamente a json-server (que corre en el puerto 3001).
 *
 * POR QUE UN PROXY:
 *   En desarrollo tenemos DOS servidores corriendo a la vez:
 *     1) Vite  -> sirve el frontend (HTML/CSS/JS)        en  http://localhost:5173
 *     2) json-server -> simula el backend/API REST       en  http://localhost:3001
 *   El proxy permite que desde el frontend llamemos a rutas relativas como
 *   "/api/companies" y Vite las redirija a "http://localhost:3001/companies".
 *   Asi evitamos problemas de CORS y dejamos la URL del backend en UN solo lugar.
 *
 *   --> Cuando migremos a Wix, solo cambia la capa apiService.js; el resto de la
 *       aplicacion sigue usando rutas logicas sin saber de donde vienen los datos.
 * =============================================================================
 */

import { defineConfig } from 'vite';

export default defineConfig({
  // Puerto del servidor de desarrollo del frontend.
  server: {
    port: 5173,
    open: true, // Abre el navegador automaticamente al ejecutar "npm run dev".
    proxy: {
      // Toda peticion que empiece con "/api" se reenvia a json-server.
      '/api': {
        target: 'http://localhost:3001', // Donde escucha json-server.
        changeOrigin: true,
        // Quitamos el prefijo "/api" antes de mandar al backend.
        // Ej: "/api/companies"  ->  "http://localhost:3001/companies"
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // Carpeta de salida del build de produccion.
  build: {
    outDir: 'dist',
  },
});
