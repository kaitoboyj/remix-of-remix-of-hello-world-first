import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, MessageCircle, RefreshCw, Send } from "lucide-react";
import {
  supportListThreads,
  supportLogin,
  supportLogout,
  supportReply,
  supportSetSettings,
  supportStatus,
  supportThread,
} from "@/lib/support.functions";
import { DEFAULT_CHAT_LABEL, type ChatMode, type SupportMessage, type SupportThreadSummary } from "@/lib/support";

export const Route = createFileRoute("/support-inbox")({
  head: () => ({
    meta: [
      { title: "Support Inbox — PrimeCapital" },
      { name: "description", content: "Internal support inbox for PrimeCapital staff." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Support Inbox — PrimeCapital" },
      { property: "og:description", content: "Internal support inbox for PrimeCapital staff." },
    ],
  }),
  component: SupportInboxPage,
});

function SupportInboxPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supportStatus()
      .then((r) => setUnlocked(r.unlocked))
      .catch(() => setUnlocked(false));
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await supportLogin({ data: { password } });
      if (res.ok) setUnlocked(true);
      else setError("Wrong password");
    } catch {
      setError("Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  if (unlocked === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-sm items-center px-4">
        <form onSubmit={login} className="w-full rounded-xl border border-border bg-card p-6">
          <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Lock className="h-4 w-4" /> Support Inbox
          </h1>
          <p className="mb-4 text-xs text-muted-foreground">Staff access only.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          {error && <p className="mb-3 text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return <Inbox onLock={() => setUnlocked(false)} />;
}

function Inbox({ onLock }: { onLock: () => void }) {
  const [threads, setThreads] = useState<SupportThreadSummary[] | null>(null);
  const [active, setActive] = useState<string>("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [mode, setMode] = useState<ChatMode>("auto");
  const [label, setLabel] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [issue, setIssue] = useState("");
  const bottom = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await supportListThreads();
      setThreads(res.threads as SupportThreadSummary[]);
      setIssue("");
    } catch (e) {
      setThreads([]);
      setIssue(e instanceof Error && e.message ? e.message : "Could not load conversations");
    }
  }, []);

  const loadThread = useCallback(async (address: string) => {
    if (!address) return;
    try {
      const res = await supportThread({ data: { wallet_address: address } });
      setMessages(res.messages);
      setMode(res.chat_mode);
      setLabel(res.custom_label ?? "");
      setIssue("");
    } catch (e) {
      setIssue(e instanceof Error && e.message ? e.message : "Could not load this conversation");
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    const id = setInterval(() => void loadThreads(), 20_000);
    return () => clearInterval(id);
  }, [loadThreads]);

  useEffect(() => {
    if (!active) return;
    void loadThread(active);
    const id = setInterval(() => void loadThread(active), 15_000);
    return () => clearInterval(id);
  }, [active, loadThread]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      await supportReply({ data: { wallet_address: active, body } });
      setDraft("");
      setIssue("");
      await loadThread(active);
      await loadThreads();
    } catch (e) {
      setIssue(e instanceof Error && e.message ? e.message : "Could not send the reply");
    } finally {
      setSending(false);
    }
  }

  async function saveSettings(next: { mode?: ChatMode; custom_label?: string | null }) {
    if (!active) return;
    try {
      await supportSetSettings({ data: { wallet_address: active, ...next } });
      setIssue("");
      await loadThreads();
    } catch (e) {
      setIssue(e instanceof Error && e.message ? e.message : "Could not save");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <MessageCircle className="h-5 w-5 text-primary" /> Support Inbox
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadThreads()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button
            type="button"
            onClick={async () => {
              await supportLogout().catch(() => {});
              onLock();
            }}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Lock
          </button>
        </div>
      </div>

      {issue && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {issue} — run SUPPORT_SETUP_SQL.sql in Supabase and check the database keys in Netlify.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <aside className="rounded-xl border border-border bg-card p-2">
          {threads === null && (
            <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          )}
          {threads?.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">No messages yet.</p>
          )}
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
            {(threads ?? []).map((t) => (
              <li key={t.wallet_address}>
                <button
                  type="button"
                  onClick={() => setActive(t.wallet_address)}
                  className={`w-full rounded-lg px-2 py-2 text-left ${
                    active === t.wallet_address ? "bg-primary/10" : "hover:bg-muted/40"
                  }`}
                >
                  <p className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{t.username || "guest"}</span>
                    {t.unread_admin > 0 && (
                      <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                        {t.unread_admin}
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {t.wallet_address}
                  </p>
                  {t.preview && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.preview}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="rounded-xl border border-border bg-card p-3">
          {!active && <p className="p-4 text-sm text-muted-foreground">Pick a conversation.</p>}
          {active && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
                <span className="font-mono text-xs text-muted-foreground">{active}</span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {(["auto", "on", "off"] as ChatMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        void saveSettings({ mode: m });
                      }}
                      className={
                        mode === m
                          ? "rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground"
                          : "rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      }
                    >
                      {m === "auto" ? "Automatic" : m === "on" ? "Always on" : "Off"}
                    </button>
                  ))}
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={DEFAULT_CHAT_LABEL}
                    maxLength={60}
                    className="w-40 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => void saveSettings({ custom_label: label.trim() || null })}
                    className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:border-primary"
                  >
                    Save label
                  </button>
                </div>
              </div>

              <div className="mb-3 max-h-[52vh] space-y-2 overflow-y-auto">
                {messages.map((m) => (
                  <div key={m.id} className={m.sender === "admin" ? "flex justify-end" : "flex justify-start"}>
                    <p
                      className={
                        m.sender === "admin"
                          ? "max-w-[75%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground"
                          : "max-w-[75%] whitespace-pre-wrap rounded-lg border border-border px-3 py-2 text-xs text-foreground"
                      }
                    >
                      {m.body}
                    </p>
                  </div>
                ))}
                <div ref={bottom} />
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder="Reply to this user…"
                  className="flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !draft.trim()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                  aria-label="Send reply"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
