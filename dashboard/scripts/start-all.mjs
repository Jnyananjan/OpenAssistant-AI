import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = resolve(__dirname, "..");
const setupScript = resolve(__dirname, "setup-server.mjs");

function checkBackendLive(port = 4000) {
  return new Promise((res) => {
    const req = http.get(`http://127.0.0.1:${port}/api/setup/status`, (response) => {
      res(response.statusCode === 200 || response.statusCode === 403);
    });
    req.on("error", () => res(false));
    req.setTimeout(500, () => {
      req.destroy();
      res(false);
    });
  });
}

async function waitForBackend(port = 4000, maxWaitMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await checkBackendLive(port)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function main() {
  let backendProc = null;
  const isLive = await checkBackendLive(4000);

  if (!isLive) {
    console.log("🚀 [OpenAssistant AI] Starting background setup service on http://localhost:4000...");
    backendProc = spawn(process.execPath, [setupScript], {
      cwd: dashboardRoot,
      env: {
        ...process.env,
        SETUP_NON_INTERACTIVE: "1",
        SETUP_PASSPHRASE:
          process.env.SETUP_PASSPHRASE ||
          "jana-ai-master-local-passphrase-at-least-16-chars",
      },
      stdio: ["ignore", "pipe", "inherit"],
    });

    backendProc.stdout?.on("data", (chunk) => {
      const line = chunk.toString();
      if (line.includes("listening on")) {
        console.log(`📡 [OpenAssistant AI Backend] ${line.trim()}`);
      }
    });

    backendProc.on("error", (err) => {
      console.error("❌ [OpenAssistant AI Backend Error]:", err);
    });

    const ready = await waitForBackend(4000);
    if (!ready) {
      console.warn("⚠️ [OpenAssistant AI] Setup service took long to respond, proceeding to launch dashboard...");
    } else {
      console.log("✅ [OpenAssistant AI] Local setup service is live and verified!");
    }
  } else {
    console.log("✅ [OpenAssistant AI] Local setup service is already running on http://localhost:4000");
  }

  console.log("⚡ [OpenAssistant AI] Launching modern operations dashboard...\n");

  const viteBin = resolve(dashboardRoot, "node_modules", "vite", "bin", "vite.js");
  const viteProc = spawn(process.execPath, [viteBin, "dev"], {
    cwd: dashboardRoot,
    env: process.env,
    stdio: "inherit",
  });

  const cleanup = () => {
    if (backendProc && !backendProc.killed) {
      try {
        backendProc.kill();
      } catch {}
    }
    if (viteProc && !viteProc.killed) {
      try {
        viteProc.kill();
      } catch {}
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);

  viteProc.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
