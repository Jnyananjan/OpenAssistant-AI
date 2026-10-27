import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Btn, Panel, PanelHeader, Pill } from "@/components/ui-kit";
import { recommendModel } from "@/lib/advisor.functions";
import type { AdvisorCandidate, Recommendation } from "@/lib/advisor";

export function WorkloadAdvisor({
  candidates,
  canSave,
  saving,
  onUseModel,
}: {
  candidates: AdvisorCandidate[];
  canSave: boolean;
  saving: boolean;
  onUseModel: (model: string) => void;
}) {
  const recommend = useServerFn(recommendModel);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Recommendation | null>(null);

  const ready = candidates.length > 0;
  const canAsk = ready && description.trim().length >= 10 && !pending;

  const ask = async () => {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const recommendation = await recommend({
        data: { description: description.trim(), candidates },
      });
      setResult(recommendation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The advisor request failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel className="mb-6">
      <PanelHeader
        title="Workload advisor"
        icon={<Sparkles className="size-4" />}
        right={<Pill tone="info">AI powered</Pill>}
      />
      <div className="p-4">
        {!ready ? (
          <p className="text-sm text-muted-foreground">
            No verified providers are connected, so there is nothing to recommend from. Connect and
            verify a provider first.
          </p>
        ) : (
          <>
            <label htmlFor="workload-description" className="text-xs text-muted-foreground">
              Describe the workload — the advisor recommends from your {candidates.length} connected
              provider{candidates.length === 1 ? "" : "s"} only.
            </label>
            <textarea
              id="workload-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder='e.g. "Summarize 200-page PDFs as cheaply as possible" or "Real-time code completion with low latency"'
              className="mt-2 w-full rounded-md border bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex items-center gap-3">
              <Btn variant="primary" disabled={!canAsk} onClick={() => void ask()}>
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Analyzing…
                  </>
                ) : (
                  "Get recommendation"
                )}
              </Btn>
              {description.trim().length > 0 && description.trim().length < 10 && (
                <span className="text-xs text-muted-foreground">
                  Describe the workload in at least 10 characters.
                </span>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {result && (
              <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="success" dot>
                    Recommended
                  </Pill>
                  <span className="font-mono text-sm">{result.provider}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span className="font-mono text-sm font-medium">{result.model}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{result.reason}</p>
                {result.fallback && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Fallback: <span className="font-mono">{result.fallback.provider}</span> /{" "}
                    <span className="font-mono">{result.fallback.model}</span> —{" "}
                    {result.fallback.reason}
                  </p>
                )}
                <div className="mt-3">
                  <Btn
                    disabled={!canSave || saving}
                    onClick={() => onUseModel(result.model)}
                    title={canSave ? undefined : "Routing changes are not supported by the setup server."}
                  >
                    Use this model
                  </Btn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
