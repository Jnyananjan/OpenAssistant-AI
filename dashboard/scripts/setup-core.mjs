import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import { z } from "zod";

export const settingsSchema = z
  .object({
    allowedUsers: z
      .array(z.string().regex(/^[1-9]\d{0,19}$/))
      .min(1)
      .max(100),
    timezone: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Use a valid Region/City timezone."),
    maxFollowUps: z.number().int().min(0).max(100),
  })
  .strict();
export const fields = [
  "TELEGRAM_BOT_TOKEN",
  "PROJECT_REF",
  "SUPABASE_ACCESS_TOKEN",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "SUPERMEMORY_API_KEY",
];
const configSchema = z
  .object({
    credentials: z.record(z.enum(fields), z.string().min(1).max(24576)),
    encryptionSecret: z.string().min(32),
    workerSecret: z.string().min(32),
    settings: settingsSchema,
    webhookUrl: z.string().url().nullable(),
  })
  .strict();
export function seal(config, passphrase) {
  if (passphrase.length < 16)
    throw new Error("Use an unlock passphrase of at least 16 characters.");
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(configSchema.parse(config))),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    body: body.toString("base64"),
  });
}
export function unseal(envelope, passphrase) {
  try {
    const value = JSON.parse(envelope);
    if (value.version !== 1) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      scryptSync(passphrase, Buffer.from(value.salt, "base64"), 32),
      Buffer.from(value.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return configSchema.parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(value.body, "base64")),
          decipher.final(),
        ]).toString(),
      ),
    );
  } catch {
    throw new Error(
      "Unable to unlock configuration. Check your passphrase or restore an encrypted backup.",
    );
  }
}
export function initialConfig(credentials, settings) {
  return configSchema.parse({
    credentials,
    settings,
    encryptionSecret: randomBytes(32).toString("hex"),
    workerSecret: randomBytes(32).toString("hex"),
    webhookUrl: null,
  });
}
export function updateConfig(current, credentials, settings) {
  return configSchema.parse({
    ...current,
    credentials: { ...current.credentials, ...credentials },
    settings,
  });
}
export async function readConfig(directory, passphrase) {
  return unseal(await readFile(`${directory}/config.enc`, "utf8"), passphrase);
}
export async function writeConfig(directory, config, passphrase) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const target = `${directory}/config.enc`,
    temp = `${directory}/config.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temp, seal(config, passphrase), { mode: 0o600, flag: "wx" });
  await rename(temp, target);
  await chmod(target, 0o600);
}
export function publicConfig(config) {
  return {
    credentials: fields.map((name) => ({ name, configured: Boolean(config.credentials[name]) })),
    settings: config.settings,
    encryptionConfigured: true,
    workerConfigured: true,
    webhookUrl: config.webhookUrl,
  };
}
export function permittedRequest(host, origin, allowedOrigins, port) {
  return (
    [`localhost:${port}`, `127.0.0.1:${port}`].includes(host) &&
    Boolean(origin && allowedOrigins.includes(origin))
  );
}
export const webhookSchema = z
  .object({
    url: z
      .string()
      .max(2048)
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.port &&
          !/^(localhost|.*\.localhost|.*\.local|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(url.hostname)
        );
      }, "Use the public HTTPS URL of your existing Telegram handler, not localhost."),
    handlerReady: z.literal(true),
  })
  .strict();
export async function telegram(config, method, body = {}) {
  const token = config.credentials.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram credentials are not configured locally.");
  let response;
  // Telegram embeds its token in URLs; never log network exceptions or request URLs.
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Telegram could not be reached.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true)
    throw new Error(
      `Telegram did not confirm the request (HTTP ${response.status}). Check bot credentials and handler configuration.`,
    );
  return data.result;
}
export async function management(config, path, body) {
  const { PROJECT_REF: ref, SUPABASE_ACCESS_TOKEN: token } = config.credentials;
  if (!ref || !token || !/^[a-z0-9]{20}$/.test(ref))
    throw new Error("A valid project reference and access token are required.");
  let response;
  try {
    response = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error("Database management service could not be reached.");
  }
  if (!response.ok)
    throw new Error(
      `Database management request failed (HTTP ${response.status}). Check project access.`,
    );
  const data = await response.json().catch(() => null);
  if (data === null) throw new Error("Database management returned an invalid response.");
  return data;
}
export async function inspectDatabase(config) {
  const tables = await management(config, "/database/query", {
    query:
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  });
  const extensions = await management(config, "/database/query", {
    query:
      "select extname from pg_extension where extname in ('pg_cron','pg_net') order by extname",
  });
  if (!Array.isArray(tables) || !Array.isArray(extensions))
    throw new Error("Schema inspection returned invalid results.");
  return {
    tables: tables.map((row) => z.string().parse(row.table_name)),
    extensions: extensions.map((row) => z.string().parse(row.extname)),
  };
}
