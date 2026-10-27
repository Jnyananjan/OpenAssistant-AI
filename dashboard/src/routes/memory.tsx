import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Link2 } from "lucide-react";
import { Btn, Input, PageHeader, Panel, PanelHeader } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { dataRoute, useDashboard, withDashboard } from "@/lib/dashboard";
export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Memory explorer — OpenAssistant AI Ops" },
      {
        name: "description",
        content: "Search and filter OpenAssistant AI's personal memory bank and see related memories.",
      },
      { property: "og:title", content: "Memory explorer — OpenAssistant AI Ops" },
      { property: "og:description", content: "Browse OpenAssistant AI's personal memory bank." },
    ],
  }),
  validateSearch: (s: { q?: string; category?: string; page?: number }) => ({
    q: s.q ?? "",
    category: s.category ?? "",
    page: Math.max(0, Math.floor(Number(s.page) || 0)),
  }),
  ...dataRoute,
  component: withDashboard(MemoryPage),
});

function MemoryPage() {
  const d = useDashboard();
  const { q, category, page } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [sel, setSel] = useState<string | null>(null);
  const filtered = d.memories.filter(
    (m) =>
      (!category || m.category === category) && m.content.toLowerCase().includes(q.toLowerCase()),
  );
  const list = filtered.slice(page * 20, page * 20 + 20);
  const selected = d.memories.find((m) => m.id === sel);
  const related = selected
    ? d.memories.filter((m) => selected.related.includes(m.id) || m.related.includes(selected.id))
    : [];
  return (
    <>
      <PageHeader
        title="Memory explorer"
        desc={`${d.memories.length} memories across ${d.categories.length} categories.`}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <Input
            aria-label="Search memories"
            placeholder="Search memories"
            value={q}
            onChange={(e) => navigate({ search: { q: e.target.value, category, page: 0 } })}
            className="pl-8"
          />
        </div>
        <Btn variant="ghost" onClick={() => navigate({ search: { q, category: "", page: 0 } })}>
          all
        </Btn>
        {d.categories.map((c) => (
          <Btn
            key={c}
            variant="ghost"
            className={cn(category === c && "bg-accent")}
            onClick={() => navigate({ search: { q, category: c, page: 0 } })}
          >
            {c}
          </Btn>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="overflow-x-auto lg:col-span-3">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">ID</th>
                <th className="px-4 py-2.5 font-medium">Memory</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Confidence</th>
                <th className="px-4 py-2.5 font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((m) => (
                <tr
                  key={m.id}
                  tabIndex={0}
                  aria-selected={sel === m.id}
                  onClick={() => setSel(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSel(m.id);
                    }
                  }}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    sel === m.id && "bg-accent",
                  )}
                >
                  <td className="max-w-24 truncate px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {m.id}
                  </td>
                  <td className="max-w-64 truncate px-4 py-3">{m.content}</td>
                  <td className="px-4 py-3 text-xs">{m.category}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {m.confidence === null ? "—" : `${Math.round(m.confidence * 100)}%`}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {d.memories.length ? "No memories match." : "No memories recorded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-between border-t p-3">
            <Btn
              disabled={!page}
              onClick={() => navigate({ search: { q, category, page: page - 1 } })}
            >
              Previous
            </Btn>
            <Btn
              disabled={(page + 1) * 20 >= filtered.length}
              onClick={() => navigate({ search: { q, category, page: page + 1 } })}
            >
              Next
            </Btn>
          </div>
        </Panel>
        <Panel className="h-fit lg:col-span-2">
          <PanelHeader title="Relationships" icon={<Link2 className="size-4" />} />
          {selected ? (
            <div className="p-4">
              <div className="text-xs text-muted-foreground">
                {selected.category} · {new Date(selected.createdAt).toLocaleString()}
              </div>
              <p className="mt-2 text-sm">{selected.content}</p>
              <div className="mt-4 space-y-2 border-l pl-4">
                {related.map((m) => (
                  <Btn
                    key={m.id}
                    className="h-auto w-full whitespace-normal text-left"
                    onClick={() => setSel(m.id)}
                  >
                    {m.content}
                  </Btn>
                ))}
                {!related.length && (
                  <p className="text-xs text-muted-foreground">No linked memories.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Select a memory.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
