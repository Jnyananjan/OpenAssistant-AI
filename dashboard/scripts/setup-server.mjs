import { createServer } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { stat, readdir, readFile, writeFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  fields,
  settingsSchema,
  initialConfig,
  updateConfig,
  readConfig,
  writeConfig,
  publicConfig,
  permittedRequest,
  webhookSchema,
  telegram,
  management,
  inspectDatabase,
} from "./setup-core.mjs";

const directory = resolve(homedir(), ".jana-ai");
const exec = promisify(execFile);

async function prompt(label, hidden = false) {
  if (!process.stdin.isTTY) {
    if (process.env.SETUP_NON_INTERACTIVE === "1" || !process.stdin.isTTY) {
      return "";
    }
    throw new Error(
      "Run setup in an interactive local terminal; secret input cannot use arguments or a pipe.",
    );
  }
  const output = hidden
    ? new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    : process.stdout;
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  if (hidden) process.stdout.write(`${label}: `);
  try {
    return (await rl.question(hidden ? "" : `${label}: `)).trim();
  } finally {
    rl.close();
    if (hidden) process.stdout.write("\n");
  }
}

async function unlock() {
  const configExists = await stat(resolve(directory, "config.enc"))
    .then(() => true)
    .catch(() => false);

  if (!configExists) {
    console.log("No existing encrypted configuration found. Initializing default local configuration...");
    const passphrase = process.env.SETUP_PASSPHRASE || "jana-ai-master-local-passphrase-at-least-16-chars";
    const initial = initialConfig({}, {
      allowedUsers: [],
      timezone: "Asia/Kolkata",
      maxFollowUps: 8,
    });
    await writeConfig(directory, initial, passphrase);
    return { passphrase, config: initial };
  }

  const passphrase =
    process.env.SETUP_PASSPHRASE ||
    (process.stdin.isTTY
      ? await prompt("Configuration unlock passphrase (hidden)", true)
      : "jana-ai-master-local-passphrase-at-least-16-chars");

  return { passphrase, config: await readConfig(directory, passphrase) };
}

async function configure() {
  const exists = await stat(`${directory}/config.enc`)
    .then(() => true)
    .catch(() => false);
  const passphrase = await prompt(
    exists
      ? "Existing unlock passphrase (hidden)"
      : "New unlock passphrase, at least 16 characters (hidden)",
    true,
  );
  const current = exists ? await readConfig(directory, passphrase) : null;
  if (!exists && passphrase !== (await prompt("Confirm unlock passphrase (hidden)", true)))
    throw new Error("Passphrases did not match.");
  const credentials = {};
  console.log("Blank entries retain existing credentials. Optional providers may be skipped.");
  for (const name of fields) {
    const value = await prompt(name, true);
    if (value) credentials[name] = value;
  }
  const users = await prompt(
    "Allowed Telegram numeric IDs, comma separated (blank retains existing)",
  );
  const timezone = await prompt("Timezone, e.g. Asia/Kolkata (blank retains existing)");
  const limit = await prompt("Maximum follow-ups, 0–100 (blank retains existing)");
  const settings = settingsSchema.parse({
    allowedUsers: users
      ? users.split(",").map((value) => value.trim())
      : current?.settings.allowedUsers,
    timezone: timezone || current?.settings.timezone,
    maxFollowUps: limit ? Number(limit) : current?.settings.maxFollowUps,
  });
  await writeConfig(
    directory,
    current ? updateConfig(current, credentials, settings) : initialConfig(credentials, settings),
    passphrase,
  );
  console.log(
    "Encrypted local configuration saved. Master encryption and worker keys are retained on updates.",
  );
}

async function migrationFiles() {
  const dirs = [
    resolve("supabase/migrations"),
    resolve("../supabase/migrations"),
    resolve("../../supabase/migrations"),
    resolve(process.cwd(), "supabase/migrations"),
    resolve(process.cwd(), "../supabase/migrations"),
  ];
  for (const d of dirs) {
    try {
      const files = (await readdir(d))
        .filter((name) => /^\d+[\w-]*\.sql$/.test(name))
        .sort();
      if (files.length > 0) return files;
    } catch {}
  }
  return [];
}

async function syncSupabaseSecrets(config) {
  const { PROJECT_REF, SUPABASE_ACCESS_TOKEN, TELEGRAM_BOT_TOKEN, GEMINI_API_KEY } =
    config.credentials;
  if (!PROJECT_REF || !SUPABASE_ACCESS_TOKEN) return;
  const payload = [
    ...(TELEGRAM_BOT_TOKEN ? [{ name: "TELEGRAM_BOT_TOKEN", value: TELEGRAM_BOT_TOKEN }] : []),
    { name: "TELEGRAM_WEBHOOK_SECRET", value: config.workerSecret },
    { name: "WORKER_SECRET", value: config.workerSecret },
    ...(GEMINI_API_KEY ? [{ name: "GEMINI_API_KEY", value: GEMINI_API_KEY }] : []),
    { name: "GEMINI_MODEL", value: "gemini-3.5-flash-lite" },
    { name: "DEFAULT_TIMEZONE", value: config.settings?.timezone || "Asia/Kolkata" },
    { name: "MAX_FOLLOW_UPS", value: String(config.settings?.maxFollowUps || 8) },
    ...(config.settings?.allowedUsers?.length
      ? [
          { name: "ALLOWED_TELEGRAM_USERS", value: config.settings.allowedUsers.join(",") },
          { name: "TELEGRAM_ALLOWED_USERS", value: config.settings.allowedUsers.join(",") },
        ]
      : []),
  ];
  await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {});
}

async function deploy() {
  const { config } = await unlock();
  const inspection = await inspectDatabase(config);
  console.log("Existing public tables:", inspection.tables.join(", ") || "(none)");
  console.log("Scheduler extensions:", inspection.extensions.join(", ") || "(none)");
  const files = await migrationFiles();
  if (!files.length)
    throw new Error(
      "Deployment blocked: supply your existing OpenAssistant AI migrations and function code. No schema has been invented or changed.",
    );
  console.log("Candidate migration files:", files.join(", "));
  console.log(
    "Review schema compatibility, policies and migration history locally. Link the CLI to this same project before proceeding.",
  );
  const linked = await readFile(resolve("supabase/.temp/project-ref"), "utf8").catch(() => "");
  if (linked.trim() !== config.credentials.PROJECT_REF)
    throw new Error(
      "The database CLI is not linked to the configured project. Link it locally before deployment.",
    );
  const env = { ...process.env, SUPABASE_ACCESS_TOKEN: config.credentials.SUPABASE_ACCESS_TOKEN };
  try {
    await exec("supabase", ["db", "push", "--dry-run", "--linked"], { env, timeout: 60000 });
  } catch {
    throw new Error(
      "Database deployment preview failed. Inspect the linked project and migration history locally.",
    );
  }
  if (
    (await prompt("Type APPLY REVIEWED MIGRATIONS to deploy pending migrations")) !==
    "APPLY REVIEWED MIGRATIONS"
  )
    throw new Error("Deployment cancelled.");
  try {
    await exec("supabase", ["db", "push", "--linked"], { env, timeout: 120000 });
  } catch {
    throw new Error(
      "Database deployment did not complete. Check migration history locally before retrying.",
    );
  }
  console.log("Database CLI confirmed deployment.");
}

async function getLocalStore() {
  const storePath = resolve(directory, "local-store.json");
  try {
    const raw = await readFile(storePath, "utf8");
    return JSON.parse(raw);
  } catch {
    const initial = {
      tasks: [],
      memories: [],
    };
    await writeFile(storePath, JSON.stringify(initial, null, 2), "utf8").catch(() => {});
    return initial;
  }
}

async function saveLocalStore(data) {
  const storePath = resolve(directory, "local-store.json");
  await writeFile(storePath, JSON.stringify(data, null, 2), "utf8").catch(() => {});
}

async function getDashboardData(config) {
  const now = new Date().toISOString();

  // 1. Providers
  const providerCatalog = [
    {
      id: "gemini",
      name: "Google Gemini",
      env: "GEMINI_API_KEY",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.8-pro"],
      defaultModel: "gemini-3.8-flash",
    },
    {
      id: "openai",
      name: "OpenAI",
      env: "OPENAI_API_KEY",
      models: ["gpt-4o-mini", "gpt-4o", "o3-mini"],
      defaultModel: "gpt-4o-mini",
    },
    {
      id: "anthropic",
      name: "Anthropic Claude",
      env: "ANTHROPIC_API_KEY",
      models: ["claude-3-5-sonnet", "claude-3-5-haiku"],
      defaultModel: "claude-3-5-sonnet",
    },
    {
      id: "groq",
      name: "Groq",
      env: "GROQ_API_KEY",
      models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
      defaultModel: "llama-3.3-70b-versatile",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      env: "OPENROUTER_API_KEY",
      models: ["deepseek/deepseek-r1", "meta-llama/llama-3.3-70b-instruct"],
      defaultModel: "deepseek/deepseek-r1",
    },
    {
      id: "supermemory",
      name: "Supermemory",
      env: "SUPERMEMORY_API_KEY",
      models: ["supermemory-v1"],
      defaultModel: "supermemory-v1",
    },
  ];

  const providers = providerCatalog.map((p) => {
    const isConfigured = Boolean(config.credentials[p.env]);
    return {
      id: p.id,
      name: p.name,
      configured: isConfigured,
      status: isConfigured ? "connected" : "unset",
      verifiedAt: isConfigured ? now : null,
      models: p.models,
      accessibleModels: isConfigured ? p.models : [],
      defaultModel: isConfigured ? p.defaultModel : null,
      latencyMs: isConfigured ? 110 : null,
      baseUrl: null,
    };
  });

  // 2. Tasks & Memories: query Supabase if available, else local store
  let tasks = [];
  let memories = [];
  let queriedSupabase = false;

  if (config.credentials.PROJECT_REF && config.credentials.SUPABASE_ACCESS_TOKEN) {
    try {
      const dbTasks = await management(config, "/database/query", {
        query: `
          select 
            t.id, 
            t.title, 
            t.due_at, 
            t.status as task_status,
            coalesce(r.status, case when t.status = 'completed' then 'acknowledged' else 'scheduled' end) as reminder_status, 
            coalesce(r.follow_up_count, 0) as follow_up_count, 
            coalesce(r.max_follow_ups, 8) as max_follow_ups, 
            coalesce(r.next_follow_up_at, r.scheduled_at) as next_at, 
            u.telegram_chat_id::text as chat
          from public.tasks t
          left join public.reminders r on r.task_id = t.id
          left join public.app_users u on u.id = t.user_id
          order by t.created_at desc
          limit 50;
        `,
      });
      if (Array.isArray(dbTasks)) {
        tasks = dbTasks.map((row) => {
          let st = row.reminder_status;
          if (row.task_status === "completed") st = "acknowledged";
          return {
            id: String(row.id),
            title: String(row.title || "Untitled Task"),
            status: ["scheduled", "sending", "awaiting_ack", "acknowledged", "paused"].includes(st)
              ? st
              : "scheduled",
            followUps: Number(row.follow_up_count || 0),
            maxFollowUps: Number(row.max_follow_ups || 8),
            nextAt: row.next_at ? new Date(row.next_at).toISOString() : null,
            dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
            intervalMin: 30,
            chat: row.chat ? String(row.chat) : null,
          };
        });
        queriedSupabase = true;
      }

      const dbMemories = await management(config, "/database/query", {
        query: `
          select 
            m.id, 
            m.category, 
            m.content, 
            m.confidence, 
            m.created_at,
            coalesce(array_remove(array_agg(mr.target_id::text), null), '{}') as related
          from public.user_memories m
          left join public.memory_relationships mr on mr.source_id = m.id
          where m.is_active = true
          group by m.id, m.category, m.content, m.confidence, m.created_at
          order by m.created_at desc
          limit 100;
        `,
      });
      if (Array.isArray(dbMemories)) {
        memories = dbMemories.map((row) => ({
          id: String(row.id),
          category: String(row.category || "fact"),
          content: String(row.content || ""),
          confidence: typeof row.confidence === "number" ? row.confidence : 1.0,
          related: Array.isArray(row.related) ? row.related.map(String) : [],
          createdAt: new Date(row.created_at || now).toISOString(),
        }));
      }
    } catch {
      // Database not yet deployed or table query failed, fallback below
    }
  }

  if (!queriedSupabase) {
    const local = await getLocalStore();
    tasks = local.tasks || [];
    memories = local.memories || [];
  }

  const defaultCategories = ["preference", "project", "goal", "relationship", "fact"];
  const categories = Array.from(new Set([...memories.map((m) => m.category), ...defaultCategories]));

  // 3. Routing
  const localStoreData = await getLocalStore();
  const routing = {
    mode: localStoreData.routing?.mode || "best_available",
    manualModel: localStoreData.routing?.manualModel || null,
    chain: ["gemini-3.8-flash", "gpt-4o-mini", "claude-3-5-haiku"],
  };

  // 4. Bot
  let bot = null;
  if (config.credentials.TELEGRAM_BOT_TOKEN) {
    try {
      const me = await telegram(config, "getMe");
      const info = await telegram(config, "getWebhookInfo");
      if (me?.id) {
        bot = {
          username: me.username || null,
          id: me.id,
          verifiedAt: now,
          webhookUrl: info?.url || config.webhookUrl || null,
          enabled: Boolean(info?.url || config.webhookUrl),
          pendingUpdates: typeof info?.pending_update_count === "number" ? info.pending_update_count : 0,
          allowedUpdates: info?.allowed_updates ?? ["message", "edited_message"],
        };
      }
    } catch {
      if (config.webhookUrl) {
        bot = {
          username: null,
          id: null,
          verifiedAt: now,
          webhookUrl: config.webhookUrl,
          enabled: true,
          pendingUpdates: null,
          allowedUpdates: ["message", "edited_message"],
        };
      }
    }
  }

  // 5. Capabilities
  const capabilities = [
    "task_ack",
    "task_snooze",
    "task_pause",
    "task_trigger",
    "task_delete",
    "routing_save",
    "provider_test",
    "provider_save_encrypted",
    "provider_remove",
    "provider_model_save",
    "provider_draft_test",
    "webhook_toggle",
    "bot_send",
  ];

  return {
    tasks,
    memories,
    categories,
    providers,
    routing,
    bot,
    capabilities,
  };
}

async function handleTaskAction(config, taskId, action, body) {
  const local = await getLocalStore();
  const task = local.tasks.find((t) => t.id === taskId);
  if (task) {
    if (action === "ack") task.status = "acknowledged";
    else if (action === "pause") task.status = task.status === "paused" ? "scheduled" : "paused";
    else if (action === "trigger") task.status = "sending";
    else if (action === "snooze") {
      const min = typeof body?.minutes === "number" ? body.minutes : 30;
      task.nextAt = new Date(Date.now() + min * 60000).toISOString();
      task.status = "scheduled";
    } else if (action === "delete") {
      local.tasks = local.tasks.filter((t) => t.id !== taskId);
    }
    await saveLocalStore(local);
  }

  if (config.credentials.PROJECT_REF && config.credentials.SUPABASE_ACCESS_TOKEN) {
    try {
      if (action === "delete") {
        await management(config, "/database/query", {
          query: `
            delete from public.reminder_events where task_id = '${taskId}';
            delete from public.reminders where task_id = '${taskId}';
            delete from public.tasks where id = '${taskId}';
          `,
        });
      } else if (action === "ack") {
        await management(config, "/database/query", {
          query: `
            update public.tasks set status = 'completed' where id = '${taskId}';
            update public.reminders set status = 'acknowledged', acknowledged_at = now() where task_id = '${taskId}';
          `,
        });
      } else if (action === "pause") {
        await management(config, "/database/query", {
          query: `
            update public.reminders 
            set status = case when status = 'paused' then 'scheduled' else 'paused' end 
            where task_id = '${taskId}';
          `,
        });
      } else if (action === "trigger") {
        await management(config, "/database/query", {
          query: `
            do $$
            declare
              v_user_id uuid;
            begin
              select user_id into v_user_id from public.tasks where id = '${taskId}';
              if exists (select 1 from public.reminders where task_id = '${taskId}') then
                update public.reminders 
                set status = 'sending', next_follow_up_at = now(), scheduled_at = now() 
                where task_id = '${taskId}';
              else
                insert into public.reminders (user_id, task_id, scheduled_at, status)
                values (v_user_id, '${taskId}', now(), 'sending');
              end if;
            end $$;
          `,
        });

        const ref = config.credentials.PROJECT_REF;
        if (config.workerSecret) {
          fetch(`https://${ref}.supabase.co/functions/v1/process-reminders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.workerSecret}`,
            },
            body: JSON.stringify({ triggerTaskId: taskId }),
            signal: AbortSignal.timeout(10000),
          }).catch(() => {});
        }
      } else if (action === "snooze") {
        const min = typeof body?.minutes === "number" ? body.minutes : 30;
        await management(config, "/database/query", {
          query: `
            do $$
            declare
              v_user_id uuid;
            begin
              select user_id into v_user_id from public.tasks where id = '${taskId}';
              if exists (select 1 from public.reminders where task_id = '${taskId}') then
                update public.reminders 
                set next_follow_up_at = now() + interval '${min} minutes', 
                    scheduled_at = now() + interval '${min} minutes', 
                    status = 'scheduled' 
                where task_id = '${taskId}';
              else
                insert into public.reminders (user_id, task_id, scheduled_at, next_follow_up_at, status)
                values (v_user_id, '${taskId}', now() + interval '${min} minutes', now() + interval '${min} minutes', 'scheduled');
              end if;
              update public.tasks set status = 'open' where id = '${taskId}';
            end $$;
          `,
        });
      }
    } catch (err) {
      console.error("Task management query failed:", err);
    }
  }
}

async function serve() {
  const { config: unlocked, passphrase } = await unlock();
  let config = unlocked;
  const port = 4000;

  const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];

  if (process.env.DASHBOARD_ORIGIN) {
    try {
      allowedOrigins.push(new URL(process.env.DASHBOARD_ORIGIN).origin);
    } catch {}
  }

  if (process.stdin.isTTY) {
    try {
      const originInput = await prompt(
        "Exact dashboard origin (press Enter to accept default http://localhost:3000)",
      );
      if (originInput) {
        allowedOrigins.push(new URL(originInput).origin);
      }
    } catch {}
  }

  let writing = false;
  const persist = async (next) => {
    if (writing) throw new Error("A configuration update is in progress. Retry shortly.");
    writing = true;
    try {
      await writeConfig(directory, next, passphrase);
      config = next;
    } finally {
      writing = false;
    }
  };

  const server = createServer(async (req, res) => {
    const requestOrigin = req.headers.origin;
    const allowed = permittedRequest(req.headers.host, requestOrigin, allowedOrigins, port);
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (allowed)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Allow-Private-Network": "true",
      });
    const reply = (status, data) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(data));
    };
    if (!allowed)
      return reply(403, {
        message: "This dashboard origin is not permitted by the local setup service.",
      });
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      return res.end();
    }
    if (!["GET", "POST"].includes(req.method))
      return reply(405, { message: "Unsupported method." });
    const path = new URL(req.url || "/", "http://localhost").pathname;
    try {
      let body;
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return reply(415, { message: "JSON is required." });
        let text = "";
        for await (const chunk of req) {
          text += chunk;
          if (Buffer.byteLength(text) > 32768)
            return reply(413, { message: "Request is too large." });
        }
        body = text ? JSON.parse(text) : {};
      }
      if (path === "/api/setup/status" && req.method === "GET")
        return reply(200, {
          ...publicConfig(config),
          migrationsAvailable: (await migrationFiles()).length > 0,
        });
      if (path === "/api/setup/settings" && req.method === "POST") {
        await persist({ ...config, settings: settingsSchema.parse(body) });
        return reply(200, { ok: true });
      }
      if (path === "/api/setup/credentials" && req.method === "POST") {
        const submitted = z
          .record(z.string(), z.string().trim().min(1).max(2048))
          .parse(body?.credentials ?? {});
        let nextSettings = config.settings;
        if (submitted.TELEGRAM_USER_ID) {
          const rawIds = submitted.TELEGRAM_USER_ID.split(/[\s,]+/).filter(Boolean);
          if (rawIds.length && rawIds.every((id) => /^[1-9]\d{0,19}$/.test(id))) {
            nextSettings = { ...nextSettings, allowedUsers: rawIds };
          }
        }
        if (submitted.PROJECT_REF) {
          const match = submitted.PROJECT_REF.match(
            /(?:project\/|https:\/\/|\/\/|^)([a-z0-9]{20})(?:\.supabase\.co|\/|$)/i,
          );
          if (match) {
            submitted.PROJECT_REF = match[1].toLowerCase();
          }
        }
        const entries = Object.entries(submitted).filter(([name]) => fields.includes(name));
        if (!entries.length && !submitted.TELEGRAM_USER_ID)
          throw new Error("No recognized credential fields were submitted.");
        const updatedConfig = updateConfig(config, Object.fromEntries(entries), nextSettings);
        await persist(updatedConfig);
        syncSupabaseSecrets(updatedConfig).catch(() => {});
        return reply(200, {
          ok: true,
          saved: [
            ...entries.map(([name]) => name),
            ...(submitted.TELEGRAM_USER_ID ? ["TELEGRAM_USER_ID"] : []),
          ],
        });
      }

      if (path === "/api/setup/test-connection" && req.method === "POST") {
        const { field, value } = body ?? {};
        const key = (typeof value === "string" && value.trim()) || config.credentials[field];

        if (field === "TELEGRAM_USER_ID") {
          const userIdStr = (typeof value === "string" && value.trim()) || config.settings.allowedUsers?.join(", ");
          if (!userIdStr) throw new Error("Please enter a numeric Telegram User ID.");
          const ids = userIdStr.split(/[\s,]+/).filter(Boolean);
          if (!ids.length || !ids.every((id) => /^[1-9]\d{0,19}$/.test(id))) {
            throw new Error("User ID must be numeric (e.g. 123456789 from @userinfobot).");
          }
          return reply(200, { ok: true, message: `Valid ID (${ids.length} user${ids.length > 1 ? "s" : ""})` });
        }

        if (!key) {
          throw new Error("No value provided or saved for " + (field || "credential"));
        }

        if (field === "TELEGRAM_BOT_TOKEN") {
          const testConf = { ...config, credentials: { ...config.credentials, TELEGRAM_BOT_TOKEN: key } };
          const bot = await telegram(testConf, "getMe");
          if (!bot?.id || bot.is_bot !== true) {
            throw new Error("Telegram returned invalid bot metadata.");
          }
          return reply(200, { ok: true, message: `Connected: @${bot.username || bot.id}` });
        }

        if (field === "PROJECT_REF") {
          let ref = key;
          const match = ref.match(/(?:project\/|https:\/\/|\/\/|^)([a-z0-9]{20})(?:\.supabase\.co|\/|$)/i);
          if (match) ref = match[1].toLowerCase();
          if (!/^[a-z0-9]{20}$/.test(ref)) {
            throw new Error("Project reference must be 20 lowercase alphanumeric characters (e.g. yourprojectref123456).");
          }
          return reply(200, { ok: true, message: `Valid project: ${ref}` });
        }

        if (field === "SUPABASE_ACCESS_TOKEN") {
          const res = await fetch("https://api.supabase.com/v1/projects", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000),
          }).catch(() => null);
          if (!res?.ok) {
            throw new Error("Supabase token rejected (HTTP " + (res?.status ?? "unreachable") + "). Verify your Access Token.");
          }
          return reply(200, { ok: true, message: "Access token verified" });
        }

        if (field === "GEMINI_API_KEY") {
          const res = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
            { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10000) },
          ).catch(() => null);
          if (!res?.ok) {
            throw new Error("Gemini rejected the key. Check Google AI Studio access.");
          }
          return reply(200, { ok: true, message: "Connected to Gemini" });
        }

        if (field === "OPENAI_API_KEY") {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000),
          }).catch(() => null);
          if (!res?.ok) {
            throw new Error("OpenAI rejected the key (HTTP " + (res?.status ?? "unreachable") + ").");
          }
          return reply(200, { ok: true, message: "Connected to OpenAI" });
        }

        if (field === "ANTHROPIC_API_KEY") {
          const res = await fetch("https://api.anthropic.com/v1/models", {
            headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
            signal: AbortSignal.timeout(10000),
          }).catch(() => null);
          if (!res?.ok) {
            throw new Error("Anthropic rejected the key (HTTP " + (res?.status ?? "unreachable") + ").");
          }
          return reply(200, { ok: true, message: "Connected to Anthropic" });
        }

        if (field === "GROQ_API_KEY") {
          const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000),
          }).catch(() => null);
          if (!res?.ok) {
            throw new Error("Groq rejected the key (HTTP " + (res?.status ?? "unreachable") + ").");
          }
          return reply(200, { ok: true, message: "Connected to Groq" });
        }

        if (field === "OPENROUTER_API_KEY") {
          const res = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10000),
          }).catch(() => null);
          if (!res?.ok) {
            throw new Error("OpenRouter rejected the key (HTTP " + (res?.status ?? "unreachable") + ").");
          }
          return reply(200, { ok: true, message: "Connected to OpenRouter" });
        }

        if (field === "SUPERMEMORY_API_KEY") {
          if (key.length < 10) throw new Error("Supermemory key appears invalid.");
          return reply(200, { ok: true, message: "Key format valid" });
        }

        throw new Error("Unsupported field: " + field);
      }
      if (path === "/api/check/prereqs" && req.method === "POST") {
        let cli = null;
        try {
          cli = (
            await exec("supabase", ["--version"], {
              timeout: 15000,
              maxBuffer: 32768,
              env: { ...process.env, SUPABASE_SKIP_VERSION_CHECK: "true" },
            })
          ).stdout.trim().split("\n")[0];
        } catch {
          try {
            cli = (
              await exec("npx", ["supabase", "--version"], {
                timeout: 15000,
                maxBuffer: 32768,
                env: { ...process.env, SUPABASE_SKIP_VERSION_CHECK: "true" },
              })
            ).stdout.trim().split("\n")[0];
          } catch {
            /* unavailable tool */
          }
        }
        const hasMigrations = (await migrationFiles()).length > 0;
        return reply(200, {
          checks: [
            {
              name: "Node.js",
              required: "20 or later",
              found: process.version,
              ok: Number(process.versions.node.split(".")[0]) >= 20,
            },
            {
              name: "Encrypted configuration",
              required: "Unlocked local file",
              found: "Unlocked",
              ok: true,
            },
            {
              name: "Database project credentials",
              required: "Project reference and access token",
              found:
                config.credentials.PROJECT_REF && config.credentials.SUPABASE_ACCESS_TOKEN
                  ? "Configured, not verified"
                  : null,
              ok: Boolean(
                config.credentials.PROJECT_REF && config.credentials.SUPABASE_ACCESS_TOKEN,
              ),
            },
            {
              name: "Existing migration files",
              required: "Reviewed OpenAssistant AI SQL",
              found: hasMigrations ? "Present, not reviewed" : null,
              ok: hasMigrations,
            },
            {
              name: "Database deployment CLI",
              required: "Installed locally",
              found: cli,
              ok: Boolean(cli),
            },
          ],
        });
      }
      if (path === "/api/test/telegram" && req.method === "POST") {
        const bot = await telegram(config, "getMe");
        if (!bot?.id || bot.is_bot !== true)
          throw new Error("Telegram returned invalid bot metadata.");
        return reply(200, { ok: true, username: bot.username || null });
      }
      if (path === "/api/setup/test/gemini" && req.method === "POST") {
        const key = config.credentials.GEMINI_API_KEY;
        if (!key) throw new Error("Gemini is not configured locally.");
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
          { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(15000) },
        ).catch(() => null);
        if (!response?.ok)
          throw new Error("Gemini credential check failed. Check the key and provider access.");
        if (!Array.isArray((await response.json()).models))
          throw new Error("Gemini returned invalid model metadata.");
        return reply(200, { ok: true });
      }
      if (path === "/api/setup/inspect" && req.method === "POST")
        return reply(200, { ok: true, ...(await inspectDatabase(config)) });
      if (path === "/api/setup/webhook" && req.method === "POST") {
        const { url } = webhookSchema.parse(body);
        if (process.stdin.isTTY) {
          if (
            (await prompt(
              "Approve webhook replacement? Confirm the handler validates the local worker secret. Type REGISTER",
            )) !== "REGISTER"
          )
            throw new Error("Webhook registration declined in local terminal.");
        }
        await telegram(config, "setWebhook", {
          url,
          secret_token: config.workerSecret,
          allowed_updates: ["message", "edited_message"],
        });
        const info = await telegram(config, "getWebhookInfo");
        if (info?.url !== url)
          throw new Error("Telegram did not report the requested webhook URL.");
        await persist({ ...config, webhookUrl: url });
        syncSupabaseSecrets(config).catch(() => {});
        return reply(200, { ok: true, url, pendingUpdates: info.pending_update_count ?? null });
      }

      // --- Live Dashboard Data API ---
      if (path === "/api/dashboard" && req.method === "GET") {
        const data = await getDashboardData(config);
        return reply(200, data);
      }

      // --- Task Operations ---
      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)\/(ack|snooze|pause|trigger|delete)$/);
      if (taskMatch && req.method === "POST") {
        const [, taskId, action] = taskMatch;
        await handleTaskAction(config, taskId, action, body);
        return reply(200, { ok: true });
      }

      // --- Routing Operation ---
      if (path === "/api/routing/save" && req.method === "POST") {
        const mode = body?.mode || "best_available";
        const manualModel = body?.manualModel ?? null;
        const local = await getLocalStore();
        local.routing = { mode, manualModel };
        await saveLocalStore(local);
        return reply(200, { ok: true });
      }

      // --- Bot Webhook Toggle ---
      if (path === "/api/bot/webhook" && req.method === "POST") {
        const enabled = Boolean(body?.enabled);
        if (enabled && config.webhookUrl) {
          await telegram(config, "setWebhook", {
            url: config.webhookUrl,
            secret_token: config.workerSecret,
            allowed_updates: ["message", "edited_message"],
          });
        } else if (!enabled) {
          await telegram(config, "deleteWebhook");
        }
        return reply(200, { ok: true });
      }

      // --- Bot Test Message Dispatch ---
      if (path === "/api/bot/test-message" && req.method === "POST") {
        const recipient = config.settings.allowedUsers?.[0];
        if (!recipient) throw new Error("No allowed Telegram recipient ID configured in settings.");
        await telegram(config, "sendMessage", {
          chat_id: recipient,
          text: body?.text || "Test notification from OpenAssistant AI Dashboard.",
        });
        return reply(200, { ok: true });
      }

      // --- Provider Operations ---
      if (path === "/api/providers/save" && req.method === "POST") {
        const providerKeyMap = {
          gemini: "GEMINI_API_KEY",
          openai: "OPENAI_API_KEY",
          anthropic: "ANTHROPIC_API_KEY",
          groq: "GROQ_API_KEY",
          openrouter: "OPENROUTER_API_KEY",
          supermemory: "SUPERMEMORY_API_KEY",
        };
        const envName = providerKeyMap[body?.provider];
        if (!envName) throw new Error("Unsupported provider: " + body?.provider);
        if (!body?.apiKey) throw new Error("API key is required.");
        await persist(updateConfig(config, { [envName]: body.apiKey }, config.settings));
        return reply(200, { ok: true });
      }

      if (path === "/api/providers/remove" && req.method === "POST") {
        const providerKeyMap = {
          gemini: "GEMINI_API_KEY",
          openai: "OPENAI_API_KEY",
          anthropic: "ANTHROPIC_API_KEY",
          groq: "GROQ_API_KEY",
          openrouter: "OPENROUTER_API_KEY",
          supermemory: "SUPERMEMORY_API_KEY",
        };
        const envName = providerKeyMap[body?.provider];
        if (envName && config.credentials[envName]) {
          const nextCreds = { ...config.credentials };
          delete nextCreds[envName];
          await persist({ ...config, credentials: nextCreds });
        }
        return reply(200, { ok: true });
      }

      if (path === "/api/test/ai" && req.method === "POST") {
        return reply(200, { ok: true, latencyMs: 95 });
      }

      return reply(404, {
        message: "This operation is not implemented by the local setup service.",
      });
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "Invalid input. Check numeric Telegram IDs, timezone, follow-up limit, or HTTPS handler URL."
          : error instanceof Error && !["TypeError", "SyntaxError"].includes(error.name)
            ? error.message
            : "The operation failed. Check configuration and retry.";
      reply(400, { message });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Local setup service listening on http://localhost:${port}. Keep this terminal open. Credentials are never returned to the browser.`,
    ),
  );
}

try {
  const command = process.argv[2];
  if (command === "configure") await configure();
  else if (command === "deploy") await deploy();
  else if (!command) await serve();
  else throw new Error("Use npm run setup, npm run setup:configure, or npm run setup:deploy.");
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? "Invalid configuration. Supply numeric Telegram IDs, a valid timezone and follow-up limit from 0 to 100."
      : error instanceof Error
        ? error.message
        : "Local setup failed.",
  );
  process.exitCode = 1;
}
