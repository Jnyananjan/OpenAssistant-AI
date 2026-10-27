import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";

function setupBackendPlugin(): Plugin {
  let proc: ChildProcess | null = null;
  return {
    name: "setup-backend-autostart",
    configureServer(server) {
      const req = http.get("http://127.0.0.1:4000/api/setup/status", () => {
        // Backend service is already listening on port 4000
      });
      req.on("error", () => {
        try {
          proc = spawn(process.execPath, ["scripts/setup-server.mjs"], {
            stdio: "inherit",
            env: {
              ...process.env,
              SETUP_NON_INTERACTIVE: "1",
              SETUP_PASSPHRASE:
                process.env["SETUP_PASSPHRASE"] ||
                "jana-ai-master-local-passphrase-at-least-16-chars",
            },
          });
        } catch (err) {
          console.error("Could not auto-start setup backend:", err);
        }
      });
      const cleanup = () => {
        if (proc && !proc.killed) {
          proc.kill();
          proc = null;
        }
      };
      server.httpServer?.on("close", cleanup);
      process.on("exit", cleanup);
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    setupBackendPlugin(),
  ],
});
