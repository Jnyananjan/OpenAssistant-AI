import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Cpu,
  Plus,
  Zap,
  KeyRound,
  Copy,
  RotateCw,
  Settings2,
  Trash2,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Btn, Input, PageHeader, Panel, Pill } from "./ui-kit";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { dashboardOptions } from "@/lib/dashboard";
import { operation, type Dashboard } from "@/lib/api";
import {
  providerCatalog,
  providerDraftSchema,
  connectedCount,
  canSaveProvider,
  testProvider,
  type ProviderId,
} from "@/lib/providers";
import { cn } from "@/lib/utils";

type Provider = Dashboard["providers"][number];
const routingNames: Record<string, string> = {
  best_available: "Auto: Best Available",
  quick_answer: "Auto: Quick Answer",
  deep_reasoning: "Auto: Deep Reasoning",
  coding: "Auto: Coding",
  budget: "Auto: Budget",
  manual: "Manual",
};
function Brand({ id }: { id: string }) {
  const index = providerCatalog.findIndex((p) => p.id === id);
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-md border font-mono text-lg",
        index === 0
          ? "bg-info/10 text-info"
          : index === 1
            ? "bg-warning/10 text-warning"
            : index === 2
              ? "bg-success/10 text-success"
              : "bg-muted text-foreground",
      )}
    >
      {providerCatalog[index]?.symbol ?? <Cpu className="size-4" />}
    </span>
  );
}
function Models({
  models,
  value,
  disabled,
  onChange,
}: {
  models: string[];
  value: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const choices = [...new Set([...models, ...(value ? [value] : [])])];
  return (
    <Select value={value ?? ""} onValueChange={onChange} disabled={disabled || !choices.length}>
      <SelectTrigger aria-label="Default Model" className="h-9">
        <SelectValue
          placeholder={choices.length ? "Select a model" : "Model catalog unavailable"}
        />
      </SelectTrigger>
      <SelectContent>
        {choices.map((model) => (
          <SelectItem key={model} value={model}>
            {model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function ProviderHub() {
  const query = useSuspenseQuery(dashboardOptions);
  const data = query.data.status === "ready" ? query.data.data : null;
  const client = useQueryClient();
  const [modal, setModal] = useState<{ provider: Provider | null } | null>(null);
  const [remove, setRemove] = useState<Provider | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const providers = data?.providers.filter((p) => p.configured || p.status === "error") ?? [];
  const perform = async (id: string, path: string, body: unknown) => {
    setBusy(id);
    try {
      await operation(path, body);
      await client.invalidateQueries({ queryKey: dashboardOptions.queryKey });
      toast.success("Provider update confirmed by server");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Provider update failed");
      return false;
    } finally {
      setBusy(null);
    }
  };
  const test = async (provider: Provider) => {
    setBusy(provider.id);
    try {
      const result = await testProvider({ provider: provider.id });
      toast.success(`Connection verified · ${result.latencyMs}ms`);
      await client.invalidateQueries({ queryKey: dashboardOptions.queryKey });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <PageHeader
        title="AI Providers"
        desc="Connect and route your AI models. Credentials are AES-256-GCM encrypted and stored server-side."
        right={
          <Btn variant="primary" onClick={() => setModal({ provider: null })}>
            <Plus className="size-4" />
            Add Provider
          </Btn>
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Pill tone={data && connectedCount(data.providers) ? "success" : "muted"} dot>
          {data
            ? `${connectedCount(data.providers)} / ${providerCatalog.length} Connected`
            : "Connected count unavailable"}
        </Pill>
        <Pill>
          <Zap className="size-3" />
          {data?.routing ? routingNames[data.routing.mode] : "Router not verified"}
        </Pill>
      </div>
      {!data && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/20 bg-warning/10 p-3">
          <p role="alert" className="text-xs text-muted-foreground">
            {query.data.status === "unavailable" ? query.data.message : "Provider data unavailable"}
          </p>
          <Btn
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            Retry
          </Btn>
        </div>
      )}
      {!providers.length ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed px-5 py-10 text-center">
          <span className="mb-4 grid size-14 place-items-center rounded-lg border bg-muted">
            <Cpu className="size-6 text-primary" />
          </span>
          <h2 className="text-sm font-medium">
            {data ? "No AI providers connected yet." : "Provider connections unavailable"}
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {data
              ? "Add Google Gemini, Anthropic Claude, or OpenAI to start using the assistant."
              : "Saved providers could not be loaded. Browse connection options while the local service is unavailable."}
          </p>
          <Btn variant="primary" className="mt-6" onClick={() => setModal({ provider: null })}>
            <Plus className="size-4" />
            Connect First Provider
          </Btn>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <Panel key={p.id} className="min-w-0 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Brand id={p.id} />
                  <h2 className="text-sm font-semibold">
                    {providerCatalog.find((c) => c.id === p.id)?.name ?? p.name}
                  </h2>
                </div>
                <Pill
                  dot
                  tone={
                    p.status === "connected" ? "success" : p.status === "error" ? "danger" : "muted"
                  }
                >
                  {p.status === "connected"
                    ? `Connected${p.latencyMs !== null ? ` · ${p.latencyMs}ms` : ""}`
                    : p.status === "error"
                      ? "Error"
                      : p.status === "unset"
                        ? "Unset"
                        : "Not verified"}
                </Pill>
              </div>
              <div className="mt-5 flex items-center gap-2 rounded-md border bg-background p-2">
                <KeyRound className="size-3.5 text-muted-foreground" />
                <span className="flex-1 font-mono text-xs">••••••••••••</span>
                <Btn
                  variant="ghost"
                  title="Copy provider identifier, not secret"
                  aria-label={`Copy ${p.name} identifier`}
                  className="size-7 p-0"
                  onClick={() => {
                    void navigator.clipboard.writeText(p.id).then(
                      () => toast.success("Provider identifier copied"),
                      () => toast.error("Clipboard unavailable"),
                    );
                  }}
                >
                  <Copy className="size-3.5" />
                </Btn>
                <Btn variant="ghost" onClick={() => setModal({ provider: p })}>
                  <RotateCw className="size-3.5" />
                  Rotate Key
                </Btn>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Stored keys are never returned to this page.
              </div>
              <label className="mt-4 block space-y-2 text-xs text-muted-foreground">
                <span>Default Model</span>
                <Models
                  models={p.accessibleModels}
                  value={p.defaultModel}
                  disabled={!data?.capabilities.includes("provider_model_save") || Boolean(busy)}
                  onChange={(model) => {
                    void perform(p.id, "/api/providers/model", {
                      provider: p.id,
                      defaultModel: model,
                    });
                  }}
                />
              </label>
              <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                <Btn
                  disabled={!data?.capabilities.includes("provider_test") || Boolean(busy)}
                  onClick={() => {
                    void test(p);
                  }}
                >
                  {busy === p.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5" />
                  )}
                  Test Connection
                </Btn>
                <Btn variant="ghost" onClick={() => setModal({ provider: p })}>
                  <Settings2 className="size-3.5" />
                  Edit / Configure
                </Btn>
                <Btn
                  variant="ghost"
                  className="text-destructive"
                  disabled={!data?.capabilities.includes("provider_remove") || Boolean(busy)}
                  title="Disconnect provider"
                  onClick={() => setRemove(p)}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Btn>
              </div>
            </Panel>
          ))}
        </div>
      )}
      
      <Dialog
        open={Boolean(modal)}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        {modal && (
          <ProviderModal
            key={modal.provider?.id ?? "new"}
            editing={modal.provider}
            data={data}
            close={() => setModal(null)}
            saved={async () => {
              await client.invalidateQueries({ queryKey: dashboardOptions.queryKey });
              setModal(null);
            }}
          />
        )}
      </Dialog>
      <AlertDialog
        open={Boolean(remove)}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {remove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The server will remove the saved credentials. Routes using this provider may become
              unavailable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busy)}>Cancel</AlertDialogCancel>
            <Btn
              variant="danger"
              disabled={Boolean(busy)}
              onClick={() => {
                if (remove)
                  void perform(remove.id, "/api/providers/remove", { provider: remove.id }).then(
                    (ok) => {
                      if (ok) setRemove(null);
                    },
                  );
              }}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Disconnect
            </Btn>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function ProviderModal({
  editing,
  data,
  close,
  saved,
}: {
  editing: Provider | null;
  data: Dashboard | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<ProviderId>(
    providerCatalog.find((p) => p.id === editing?.id)?.id ?? "gemini",
  );
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [url, setUrl] = useState(editing?.baseUrl ?? "");
  const [model, setModel] = useState<string | null>(editing?.defaultModel ?? null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState<number | null>(null);
  const brand = providerCatalog.find((p) => p.id === selected) ?? providerCatalog[0];
  const existing = data?.providers.find((p) => p.id === selected);
  const allowed = canSaveProvider(data?.capabilities);
  const resetVerification = () => {
    setTiming(null);
    setError(null);
  };
  const submit = async (test: boolean) => {
    resetVerification();
    const result = providerDraftSchema.safeParse({
      provider: selected,
      apiKey: key,
      baseUrl: url,
      defaultModel: model,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check your provider settings.");
      return;
    }
    if (!key.trim() && !existing?.configured && selected !== "custom") {
      setError("API key is required for a new provider.");
      return;
    }
    if (selected === "custom" && !url.trim()) {
      setError("Enter your custom endpoint base URL.");
      return;
    }
    if (!allowed) {
      setError("Encrypted provider saving is not supported by the connected setup service.");
      return;
    }
    setBusy(test ? "test" : "save");
    try {
      if (test) {
        const response = await testProvider({ ...result.data, draft: true });
        setTiming(response.latencyMs);
        toast.success("Provider connection verified");
      } else {
        await operation("/api/providers/save", result.data);
        setKey("");
        await saved();
        toast.success("Provider saved by server");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Provider operation failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg p-5 sm:p-6">
      <DialogHeader>
        <DialogTitle>{editing ? "Configure Provider" : "Add Provider"}</DialogTitle>
        <DialogDescription>Choose your provider and connection settings.</DialogDescription>
      </DialogHeader>
      <form
        className="min-w-0 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <fieldset disabled={Boolean(busy)}>
          <legend className="mb-2 text-xs font-medium">Provider</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {providerCatalog.map((p) => (
              <label
                key={p.id}
                className={cn(
                  "flex min-h-20 cursor-pointer items-start gap-3 rounded-md border p-3",
                  selected === p.id ? "border-primary bg-primary/5" : "hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.id}
                  checked={selected === p.id}
                  disabled={Boolean(editing)}
                  onChange={() => {
                    setSelected(p.id);
                    setKey("");
                    setUrl("");
                    setModel(null);
                    resetVerification();
                  }}
                  className="sr-only"
                />
                <Brand id={p.id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{p.name}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                    {p.tag}
                  </span>
                </span>
                {selected === p.id && <Check className="size-3.5 shrink-0 text-primary" />}
              </label>
            ))}
          </div>
        </fieldset>
        {brand.href && (
          <a
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            href={brand.href}
            target="_blank"
            rel="noreferrer"
          >
            Get API Key from {brand.name} Console
            <ExternalLink className="size-3" />
          </a>
        )}
        <div>
          <label htmlFor="provider-api-key" className="mb-2 block text-xs">
            API Key {existing?.configured || selected === "custom" ? "(optional replacement)" : "*"}
          </label>
          <div className="relative">
            <Input
              id="provider-api-key"
              type={show ? "text" : "password"}
              value={key}
              onChange={(event) => {
                setKey(event.target.value.trim());
                resetVerification();
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder={
                existing?.configured ? "Leave blank to keep existing key" : "Enter API key"
              }
              className="pr-10 font-mono"
            />
            <Btn
              type="button"
              variant="ghost"
              aria-label={show ? "Hide API key" : "Show API key"}
              className="absolute right-0 top-0 size-8 p-0"
              onClick={() => setShow((value) => !value)}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Btn>
          </div>
        </div>
        {["custom", "openrouter"].includes(selected) && (
          <label className="block space-y-2 text-xs">
            <span>Base URL {selected === "custom" ? "*" : "(Optional)"}</span>
            <Input
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                resetVerification();
              }}
              placeholder={
                selected === "custom" ? "http://localhost:11434/v1" : "https://openrouter.ai/api/v1"
              }
            />
          </label>
        )}
        <label className="block space-y-2 text-xs">
          <span>Default Model</span>
          <Models
            models={existing?.models ?? []}
            value={model}
            onChange={(value) => {
              setModel(value);
              resetVerification();
            }}
          />
        </label>
        {!allowed && (
          <p
            role="status"
            className="rounded-md border border-warning/20 bg-warning/10 p-3 text-xs text-muted-foreground"
          >
            {data
              ? "This setup service does not support encrypted provider saves yet. Configure credentials in your local setup terminal."
              : "The local setup service is unavailable. Saving and connection tests are disabled until secure server support is available."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {timing !== null && (
          <Pill tone="success">
            <Zap className="size-3" />
            Verified · {timing}ms
          </Pill>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Btn
            type="button"
            disabled={
              Boolean(busy) || !allowed || !data?.capabilities.includes("provider_draft_test")
            }
            onClick={() => {
              void submit(true);
            }}
          >
            {busy === "test" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Zap className="size-3.5" />
            )}
            Test Connection
          </Btn>
          <div className="flex-1" />
          <Btn type="button" variant="ghost" disabled={Boolean(busy)} onClick={close}>
            Cancel
          </Btn>
          <Btn type="submit" variant="primary" disabled={Boolean(busy) || !allowed}>
            {busy === "save" && <Loader2 className="size-3.5 animate-spin" />}Save Provider
          </Btn>
        </div>
      </form>
    </DialogContent>
  );
}
