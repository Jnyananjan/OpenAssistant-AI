import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { z } from "zod";
import { api, operation } from "@/lib/api";
import { setupSources, setupStatusOptions } from "@/lib/setup";
import { Btn, Input, PageHeader, Pill } from "./ui-kit";
import { cn } from "@/lib/utils";

const steps = ["Connections", "Webhook", "Connection check"];
const AI_KEYS = [
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
];
const groups = [
  {
    id: "telegram",
    title: "Telegram bot",
    icon: Bot,
    names: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_USER_ID"],
    note: "Required",
  },
  {
    id: "database",
    title: "Database",
    icon: Database,
    names: ["PROJECT_REF", "SUPABASE_ACCESS_TOKEN"],
    note: "Required",
  },
  { id: "ai", title: "AI provider keys", icon: Cpu, names: AI_KEYS, note: "Add at least 1 key" },
  {
    id: "memory",
    title: "Memory",
    icon: ShieldCheck,
    names: ["SUPERMEMORY_API_KEY"],
    note: "Optional",
  },
];

const checksSchema = z.object({
  checks: z
    .array(
      z.object({ name: z.string(), required: z.string(), found: z.string().nullable(), ok: z.boolean() }),
    )
    .min(1),
});
const inspectionSchema = z.object({
  ok: z.literal(true),
  tables: z.array(z.string()),
  extensions: z.array(z.string()),
});

type LogLine = { time: string; level: "info" | "ok" | "error" | "skip"; text: string };

function SecretField({
  title,
  href,
  source,
  configured,
  value,
  field,
  onChange,
}: {
  title: string;
  href: string;
  source: string;
  configured: boolean;
  value: string;
  field: string;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const id = `key-${title.replace(/\W+/g, "-")}`;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = (await operation("/api/setup/test-connection", {
        field,
        value: value.trim() || undefined,
      })) as { ok: boolean; message: string };
      setTestResult({ ok: true, message: res.message || "Connected" });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {title}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            Get {field === "TELEGRAM_USER_ID" ? "ID" : "key"} from {source}
            <ExternalLink className="size-3" />
          </a>
          {testResult ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
                testResult.ok
                  ? "bg-success/15 text-success"
                  : "bg-destructive/15 text-destructive",
              )}
            >
              {testResult.ok ? "✓" : "✗"} {testResult.message}
            </span>
          ) : (
            <Pill tone={configured ? "success" : "muted"}>{configured ? "Saved" : "Not added"}</Pill>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            field === "TELEGRAM_USER_ID"
              ? "e.g. 123456789 (from @userinfobot)"
              : field === "PROJECT_REF"
                ? "e.g. abcdefghijklmnopqrst or paste project URL"
                : configured
                  ? "Saved — paste a new value to replace"
                  : "Paste key here"
          }
          value={value}
          onChange={(event) => {
            let nextVal = event.target.value;
            if (field === "PROJECT_REF") {
              const trimmed = nextVal.trim();
              const match = trimmed.match(
                /(?:project\/|https:\/\/|\/\/|^)([a-z0-9]{20})(?:\.supabase\.co|\/|$)/i,
              );
              if (match?.[1]) {
                nextVal = match[1].toLowerCase();
              }
            }
            onChange(nextVal);
            if (testResult) setTestResult(null);
          }}
          className="flex-1"
        />
        <Btn
          type="button"
          variant="ghost"
          aria-label={show ? `Hide ${title} key` : `Show ${title} key`}
          onClick={() => setShow((v) => !v)}
        >
          {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Btn>
        <Btn
          type="button"
          variant="default"
          disabled={testing || (!value.trim() && !configured)}
          onClick={() => void handleTest()}
          className="h-9 shrink-0 gap-1.5 text-xs"
          title="Test this specific connection immediately"
        >
          {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          {testing ? "Testing..." : "Test"}
        </Btn>
      </div>
    </div>
  );
}

export function SetupCockpit() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [url, setUrl] = useState("");
  const [handlerReady, setHandlerReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<"ok" | "failed" | null>(null);
  const query = useQuery(setupStatusOptions);
  const client = useQueryClient();
  const config = query.data?.status === "ready" ? query.data.data : null;
  const saved = (name: string) => {
    if (name === "TELEGRAM_USER_ID") {
      return Boolean(config?.settings?.allowedUsers?.length);
    }
    return config?.credentials.find((item) => item.name === name)?.configured ?? false;
  };
  const aiKeyCount = AI_KEYS.filter((n) => saved(n) || (drafts[n] ?? "").trim()).length;

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed.");
    } finally {
      setBusy(null);
    }
  };

  const saveCredentials = () =>
    run("credentials", async () => {
      const entries = Object.entries(drafts)
        .map(([name, value]) => [name, value.trim()] as const)
        .filter(([, value]) => value.length > 0);
      if (!entries.length) throw new Error("Paste at least one key before saving.");
      if (!aiKeyCount) throw new Error("Add at least one AI provider key.");
      if (!config)
        throw new Error("The setup service isn't reachable yet, so keys can't be saved. Retry shortly.");
      await operation("/api/setup/credentials", { credentials: Object.fromEntries(entries) });
      setDrafts({});
      await client.invalidateQueries({ queryKey: ["setup-status"] });
      setNotice("Keys saved and encrypted. They won't be shown again.");
    });

  const runCheck = async () => {
    setBusy("check");
    setLog([]);
    setResult(null);
    let failed = false;
    const push = (level: LogLine["level"], text: string) =>
      setLog((l) => [...l, { time: new Date().toLocaleTimeString(), level, text }]);
    const stepRun = async (label: string, fn: () => Promise<string>) => {
      push("info", `▸ ${label}…`);
      try {
        push("ok", `✓ ${label}: ${await fn()}`);
        return true;
      } catch (e) {
        failed = true;
        push("error", `✗ ${label}: ${e instanceof Error ? e.message : "failed"}`);
        return false;
      }
    };
    const reachable = await stepRun("Reach setup service", async () => {
      const r = await query.refetch();
      if (r.data?.status !== "ready") throw new Error(r.data?.message ?? "Unavailable");
      return "connected";
    });
    if (reachable) {
      await stepRun("Prerequisites", async () => {
        const { checks } = checksSchema.parse(await api("POST", "/api/check/prereqs"));
        checks.forEach((c) =>
          push(c.ok ? "ok" : "error", `   ${c.ok ? "✓" : "✗"} ${c.name} — ${c.found ?? "not found"}`),
        );
        const bad = checks.filter((c) => !c.ok).length;
        if (bad) throw new Error(`${bad} check(s) failed`);
        return "all passed";
      });
      if (saved("TELEGRAM_BOT_TOKEN"))
        await stepRun("Telegram bot", async () => {
          const r = z
            .object({ username: z.string().nullable() })
            .parse(await operation("/api/test/telegram"));
          return r.username ? `@${r.username}` : "token valid";
        });
      else {
        failed = true;
        push("error", "✗ Telegram bot: token not added");
      }
      if (saved("GEMINI_API_KEY"))
        await stepRun("Google Gemini key", async () => {
          await operation("/api/setup/test/gemini");
          return "valid";
        });
      else push("skip", "– Google Gemini key: not added, skipped");
      if (!AI_KEYS.some(saved)) {
        failed = true;
        push("error", "✗ AI providers: no key added — add at least 1");
      }
      await stepRun("Database", async () => {
        const r = inspectionSchema.parse(await operation("/api/setup/inspect"));
        return `${r.tables.length} table(s), scheduler: ${r.extensions.join(", ") || "none"}`;
      });
      push(config?.webhookUrl ? "ok" : "skip", config?.webhookUrl ? "✓ Webhook registered" : "– Webhook: not registered yet");
    }
    push(failed ? "error" : "ok", failed ? "Finished with errors." : "All connections OK.");
    setResult(failed ? "failed" : "ok");
    setBusy(null);
  };

  const copyWebhook = async () => {
    if (!config?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(config.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select and copy the URL manually.");
    }
  };
  const filled = Object.values(drafts).some((v) => v.trim().length > 0);

  return (
    <>
      <PageHeader
        title="Setup"
        desc="Connect OpenAssistant AI in three short steps."
        right={
          <Btn onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
            Refresh status
          </Btn>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border px-4 py-3">
        <ShieldCheck className="size-4 text-primary" />
        <span className="text-sm">Keys are encrypted and never shown again.</span>
        <Pill tone={config ? "success" : "warning"}>
          {query.isPending ? "Connecting" : config ? "Service connected" : "Service unavailable"}
        </Pill>
      </div>
      <ol className="mb-6 flex flex-wrap gap-2">
        {steps.map((label, i) => (
          <li key={label}>
            <Btn
              variant="ghost"
              className={cn(step === i && "bg-accent text-foreground")}
              onClick={() => {
                setStep(i);
                setError(null);
                setNotice(null);
              }}
              aria-current={step === i ? "step" : undefined}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px]">
                {i + 1}
              </span>
              {label}
            </Btn>
          </li>
        ))}
      </ol>
      <section className="min-w-0">
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Open each link, copy your key, and paste it in the box below it.
            </p>
            {groups.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.id} className="rounded-md border px-4 pt-3">
                  <div className="flex items-center gap-2 border-b pb-3">
                    <Icon className="size-4 text-primary" />
                    <h3 className="text-sm font-medium">{group.title}</h3>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {group.id === "ai" ? `${aiKeyCount} added · ${group.note}` : group.note}
                    </span>
                  </div>
                  <div className="divide-y">
                    {group.names.map((name) => {
                      const source = setupSources.find((s) => s.name === name);
                      if (!source) return null;
                      return (
                        <SecretField
                          key={name}
                          field={name}
                          title={source.title}
                          href={source.href}
                          source={source.source}
                          configured={saved(name)}
                          value={
                            drafts[name] ??
                            (name === "TELEGRAM_USER_ID" && config?.settings?.allowedUsers?.length
                              ? config.settings.allowedUsers.join(", ")
                              : "")
                          }
                          onChange={(value) => setDrafts((c) => ({ ...c, [name]: value }))}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <Btn
              variant="primary"
              disabled={Boolean(busy) || !filled}
              onClick={() => void saveCredentials()}
            >
              {busy === "credentials" && <Loader2 className="size-3.5 animate-spin" />}
              Save keys
            </Btn>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-6">
            <div className="rounded-md border p-4">
              <h3 className="text-sm font-medium">Current webhook URL</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Telegram uses this URL to send incoming messages to OpenAssistant AI.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  readOnly
                  aria-label="Registered webhook URL"
                  value={config?.webhookUrl ?? ""}
                  placeholder="Not registered yet"
                  className="font-mono text-xs"
                />
                <Btn disabled={!config?.webhookUrl} onClick={() => void copyWebhook()}>
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Btn>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Bot handler URL</label>
                {drafts["PROJECT_REF"] && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() =>
                      setUrl(
                        `https://${drafts["PROJECT_REF"]}.supabase.co/functions/v1/telegram-webhook`,
                      )
                    }
                  >
                    Auto-fill Supabase Edge Function URL
                  </button>
                )}
              </div>
              <Input
                type="url"
                placeholder="https://your-project-ref.supabase.co/functions/v1/telegram-webhook"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  className="mt-0.5"
                  type="checkbox"
                  checked={handlerReady}
                  onChange={(e) => setHandlerReady(e.target.checked)}
                />
                My bot handler is deployed and ready to receive messages.
              </label>
              <Btn
                variant="primary"
                disabled={Boolean(busy) || !url || !handlerReady}
                onClick={() =>
                  void run("webhook", async () => {
                    if (!config) throw new Error("The setup service isn't reachable yet. Retry shortly.");
                    await operation("/api/setup/webhook", { url, handlerReady });
                    await client.invalidateQueries({ queryKey: ["setup-status"] });
                    setNotice("Telegram confirmed the webhook URL.");
                  })
                }
              >
                {busy === "webhook" && <Loader2 className="size-3.5 animate-spin" />}
                Register webhook
              </Btn>
              <p className="text-xs text-muted-foreground">The URL must be public HTTPS.</p>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-muted-foreground">
                Runs every connection one by one and shows any errors.
              </p>
              {result && (
                <Pill tone={result === "ok" ? "success" : "danger"}>
                  {result === "ok" ? "All OK" : "Errors found"}
                </Pill>
              )}
              <Btn variant="primary" disabled={Boolean(busy)} onClick={() => void runCheck()}>
                {busy === "check" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {log.length ? "Run again" : "Run connection check"}
              </Btn>
            </div>
            <div
              role="log"
              aria-live="polite"
              className="max-h-96 min-h-48 overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-6"
            >
              {log.length ? (
                log.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      line.level === "ok" && "text-success",
                      line.level === "error" && "text-destructive",
                      line.level === "skip" && "text-muted-foreground",
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground">{line.time}</span>
                    <span className="break-words">{line.text}</span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">Press "Run connection check" to start.</p>
              )}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-destructive">
            <X className="size-4" />
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 text-sm text-success">
            {notice}
          </p>
        )}
        <div className="mt-6 flex justify-between border-t pt-4">
          <Btn variant="ghost" disabled={step === 0} onClick={() => setStep((v) => v - 1)}>
            Back
          </Btn>
          <Btn
            variant="ghost"
            disabled={step === steps.length - 1}
            onClick={() => setStep((v) => v + 1)}
          >
            Next step
          </Btn>
        </div>
      </section>
    </>
  );
}
