import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BarChart3, Lock, Rocket, ShieldCheck, Sparkles, Wallet2, Zap } from "lucide-react";
import { ChangeBadge } from "@/components/ChangeBadge";
import { MarketTicker } from "@/components/MarketTicker";
import { Sparkline } from "@/components/Sparkline";
import { CopyButton } from "@/components/CopyButton";
import { marketsQuery, formatUSD, formatCompact, formatPct } from "@/lib/prices";
import { fetchBalance, type Balance } from "@/lib/balances";
import { useWalletSession } from "@/hooks/useWalletSession";
import { cn } from "@/lib/utils";
import { getDisplayBalances } from "@/lib/admin.functions";
import { useYieldDisplay } from "@/hooks/useYieldDisplay";
import { readWithdraw } from "@/lib/withdraw";
import { readDisplayFlags } from "@/lib/display-flags";
import { YieldEligibleNote } from "@/components/YieldEligibleNote";
import { fetchWalletTokens, type WalletToken } from "@/lib/tokens";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PrimeCapital | Crypto Markets & Self-Custody Wallets" },
      { name: "description", content: "Explore live crypto markets, trading tools, and self-custody wallets with PrimeCapital." },
      { property: "og:title", content: "PrimeCapital | Crypto Markets & Self-Custody Wallets" },
      { property: "og:description", content: "Explore live crypto markets, trading tools, and self-custody wallets with PrimeCapital." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <>
      <Hero />
      <MarketTicker />
      <HomeWalletBalances />
      <TrendingSection />
      <FeatureGrid />
      <StatsBand />
      <CTASection />
    </>
  );
}

const PRICE_SYMBOL: Record<string, string> = {
  BTC: "btc",
  BTC_LEGACY: "btc",
  ETH: "eth",
  BNB: "bnb",
  MATIC: "pol",
  BASE: "eth",
  ARB: "eth",
  OP: "eth",
  AVAX: "avax",
};

interface DisplayOverrides {
  usd_balance: number | null;
  yield_balance: number;
  live_balance_frozen: boolean;
  frozen_live_balance: number | null;
  mock_live_balance: number;
  token_overrides: Record<string, number>;
}

function HomeWalletBalances() {
  const session = useWalletSession();
  const addresses = session?.wallet?.addresses ?? [];
  const walletKey = session?.address ?? "";
  const { data: markets } = useQuery(marketsQuery(100));
  const getDisplay = useServerFn(getDisplayBalances);
  const [balances, setBalances] = useState<Record<string, Balance | "loading">>({});
  const [display, setDisplay] = useState<DisplayOverrides | null>(null);
  const [tokens, setTokens] = useState<WalletToken[]>([]);

  useEffect(() => {
    if (!walletKey || addresses.length === 0) return;
    let cancelled = false;
    fetchWalletTokens(walletKey, addresses).then((t) => { if (!cancelled) setTokens(t); });
    return () => { cancelled = true; };
  }, [addresses, walletKey]);

  useEffect(() => {
    if (addresses.length === 0) return;
    let cancelled = false;
    setBalances(Object.fromEntries(addresses.map((a) => [a.chain, "loading"])));
    addresses.forEach((a) => {
      fetchBalance(a.chain, a.address, walletKey).then((balance) => {
        if (!cancelled) setBalances((prev) => ({ ...prev, [a.chain]: balance }));
      });
    });
    return () => { cancelled = true; };
  }, [addresses, walletKey]);

  useEffect(() => {
    if (!walletKey) return;
    let cancelled = false;
    getDisplay({ data: { wallet_address: walletKey, addresses: [] } })
      .then((r) => {
        if (!cancelled) setDisplay(r.overrides);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [getDisplay, walletKey]);

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const coin of markets ?? []) map.set(coin.symbol.toLowerCase(), coin.current_price);
    // Polygon rebranded MATIC -> POL on CoinGecko; keep both keys resolvable.
    const pol = map.get("pol") ?? map.get("matic");
    if (pol != null) { map.set("pol", pol); map.set("matic", pol); }
    return map;
  }, [markets]);

  const rows = addresses.map((address) => {
    const balance = balances[address.chain];
    const amount = balance && balance !== "loading" ? balance.amount : null;
    const symbol = balance && balance !== "loading" ? balance.symbol : address.chain.replace("BTC_LEGACY", "BTC");
    const price = priceBySymbol.get(PRICE_SYMBOL[address.chain] ?? symbol.toLowerCase()) ?? 0;
    const usd = amount == null ? null : amount * price;
    return { address, amount, symbol, usd, loading: balance === "loading" || balance === undefined };
  });
  const tokensUsd = tokens.reduce((sum, t) => sum + (t.usd ?? 0), 0);
  const realTotal = rows.reduce((sum, row) => sum + (row.usd ?? 0), 0) + tokensUsd;
  const initialBalance = display?.live_balance_frozen && display.frozen_live_balance != null
    ? display.frozen_live_balance
    : realTotal + (display?.mock_live_balance ?? 0);
  const animatedYield = useYieldDisplay(display?.yield_balance ?? 0);
  const total = initialBalance + animatedYield.value;
  const flags = readDisplayFlags(display?.token_overrides);

  if (!session?.wallet || addresses.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10">
      <div className="glass-strong rounded-2xl p-5 md:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-primary/90 font-medium">Total balance</p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold break-words">{formatUSD(total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
          </div>
          <p className="min-w-0 text-sm text-muted-foreground break-words md:text-right">
            {session.wallet.label} · <span className="font-semibold text-foreground">{session.username}</span>
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <BalanceStat
            title="Initial balance"
            value={initialBalance}
            caption={display?.live_balance_frozen ? "Frozen display" : ""}
            changePct={flags.change24hEnabled ? flags.change24hPct : null}
          />
          <BalanceStat
            title="Yield"
            value={animatedYield.value}
            caption={`${animatedYield.pct >= 0 ? "+" : ""}${animatedYield.pct.toFixed(2)}%`}
            tone={animatedYield.pct >= 0 ? "up" : "down"}
            totalPct={initialBalance > 0 ? (animatedYield.value / initialBalance) * 100 : 0}
            showYieldEligible={flags.yieldEligible}
          />
          <BalanceStat title="Combined total" value={total} caption="Initial + yield" />
        </div>
        <WithdrawCta
          tokens={display?.token_overrides}
          username={session.username}
          yieldValue={animatedYield.value}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row) => (
            <div key={row.address.chain} className="glass min-w-0 overflow-hidden rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.address.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{row.symbol}</p>
                </div>
                <p className="shrink-0 font-mono text-sm text-right">
                  {row.loading ? "Loading" : `${(row.amount ?? 0).toFixed(6)}`}
                </p>
              </div>
              <div className="mt-3 flex min-w-0 items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{row.address.address}</p>
                <span className="shrink-0"><CopyButton value={row.address.address} label="" /></span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{row.usd == null ? "$—" : formatUSD(row.usd, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WithdrawCta({
  tokens,
  username,
  yieldValue,
}: {
  tokens?: Record<string, number>;
  username?: string | null;
  yieldValue: number;
}) {
  const { button } = readWithdraw(tokens);
  const [open, setOpen] = useState(false);
  if (button === "none") return null;

  const name = username || "User";
  void yieldValue;

  if (button === "green" || button === "red") {
    const linkClass =
      button === "green"
        ? "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
        : "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90";
    return (
      <div className="mt-5 flex justify-center">
        <Link
          to="/withdraw"
          className={linkClass}
        >
          <Wallet2 className="h-4 w-4" /> Withdraw
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-5 flex justify-center">
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90",
          "bg-blue-600",
        )}
      >
        <Wallet2 className="h-4 w-4" /> Withdraw yield
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass-strong w-full max-w-md rounded-2xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-semibold">Withdrawal eligibility</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{name}</span> is not eligible to
              withdraw yield at this time.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-lg glass px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function BalanceStat({ title, value, caption, tone, totalPct, changePct, showYieldEligible }: { title: string; value: number; caption: string; tone?: "up" | "down"; totalPct?: number; changePct?: number | null; showYieldEligible?: boolean }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</p>
        {changePct != null && <ChangeBadge pct={changePct} />}
      </div>
      <p className="mt-1 font-display text-xl font-semibold">{formatUSD(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        <span className={cn("text-xs text-muted-foreground", tone === "up" && "text-success", tone === "down" && "text-destructive")}>{caption}</span>
        {totalPct !== undefined && (
          <span className={cn("text-[10px] font-mono rounded px-1.5 py-0.5", totalPct >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
            Total {totalPct >= 0 ? "+" : ""}{totalPct.toFixed(2)}%
          </span>
        )}
      </div>
      {showYieldEligible && <YieldEligibleNote />}
    </div>
  );
}


function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ backgroundImage: "var(--gradient-hero)" }} />
      <div className="absolute inset-0 -z-10 grid-bg opacity-60" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-20 md:pt-28 md:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mt-6 font-display text-[2rem] leading-[1.1] sm:text-5xl md:text-7xl font-semibold sm:leading-[1.02] tracking-tight break-words">
            Trade crypto like a{" "}
            <span className="text-gradient">professional.</span>
            <br />
            Custody it like a paranoid.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-muted-foreground">
            PrimeCapital combines an institutional trading terminal with a browser-native HD wallet.
            Real prices. Real keys. No middleman.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/trade"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-brand)] px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition"
            >
              Launch Terminal <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/wallet"
              className="inline-flex items-center justify-center gap-2 rounded-lg glass-strong px-6 py-3 text-sm font-semibold hover:bg-white/10 transition"
            >
              <Wallet2 className="h-4 w-4" /> Create a Wallet
            </Link>
          </div>
        </div>

        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  const { data } = useQuery(marketsQuery(5));
  const coins = data ?? [];
  return (
    <div className="relative mx-auto mt-16 max-w-5xl">
      <div className="absolute -inset-x-20 -top-10 h-64 bg-[image:var(--gradient-brand)] opacity-20 blur-3xl -z-10" />
      <div className="glass-strong rounded-2xl p-4 md:p-6 shadow-elev">
        <div className="flex items-center justify-between px-2 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
            </div>
            <span className="ml-3 text-xs text-muted-foreground font-mono">prime.terminal / BTC-USDT</span>
          </div>
          <div className="hidden sm:flex gap-1 text-xs text-muted-foreground">
            {["1m", "5m", "15m", "1H", "4H", "1D"].map((t, i) => (
              <span key={t} className={cn("rounded px-2 py-1", i === 3 && "bg-white/10 text-foreground")}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <div className="rounded-xl bg-black/40 p-4 h-72 md:h-80 relative overflow-hidden border border-white/5">
            {coins[0] && (
              <div className="absolute inset-0 flex flex-col p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">BTC / USDT</p>
                    <p className="mt-1 font-display text-4xl font-semibold">{formatUSD(coins[0].current_price)}</p>
                    <p className={cn("mt-1 text-sm font-mono", coins[0].price_change_percentage_24h >= 0 ? "text-success" : "text-destructive")}>
                      {formatPct(coins[0].price_change_percentage_24h)} · 24h
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground space-y-1">
                    <p>Vol · {formatCompact(coins[0].total_volume)}</p>
                    <p>Cap · {formatCompact(coins[0].market_cap)}</p>
                  </div>
                </div>
                <div className="mt-auto -mx-5 -mb-5">
                  <Sparkline
                    data={coins[0].sparkline_in_7d?.price ?? []}
                    up={coins[0].price_change_percentage_24h >= 0}
                    width={800}
                    height={140}
                    className="w-full h-36"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="rounded-xl bg-black/30 border border-white/5 divide-y divide-white/5">
            {coins.slice(0, 5).map((c) => {
              const up = c.price_change_percentage_24h >= 0;
              return (
                <div key={c.id} className="flex items-center gap-3 px-3 py-3">
                  <img src={c.image} alt="" className="h-6 w-6 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.symbol.toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{formatUSD(c.current_price)}</p>
                    <p className={cn("text-xs font-mono", up ? "text-success" : "text-destructive")}>
                      {formatPct(c.price_change_percentage_24h)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendingSection() {
  const { data, isLoading } = useQuery(marketsQuery(8));
  const coins = data ?? [];
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary/90 font-medium">Live Markets</p>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-semibold">Trending right now</h2>
        </div>
        <Link to="/markets" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          All markets <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(isLoading ? Array.from({ length: 8 }) : coins).map((c: any, i) => (
          <TrendingCard key={c?.id ?? i} coin={c} />
        ))}
      </div>
    </section>
  );
}

function TrendingCard({ coin }: { coin: any }) {
  if (!coin) {
    return <div className="glass rounded-xl h-40 animate-pulse" />;
  }
  const up = coin.price_change_percentage_24h >= 0;
  return (
    <Link
      to="/trade"
      className="group glass rounded-xl p-4 hover:bg-white/[.06] transition-all hover:-translate-y-0.5 relative overflow-hidden"
    >
      <div className="flex items-center gap-3">
        <img src={coin.image} alt="" className="h-8 w-8 rounded-full" />
        <div>
          <p className="text-sm font-semibold">{coin.symbol.toUpperCase()}</p>
          <p className="text-xs text-muted-foreground">{coin.name}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <p className="font-display text-xl font-semibold">{formatUSD(coin.current_price)}</p>
        <span className={cn("text-xs font-mono px-1.5 py-0.5 rounded", up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
          {formatPct(coin.price_change_percentage_24h)}
        </span>
      </div>
      <div className="mt-3 -mx-4 -mb-4">
        <Sparkline data={coin.sparkline_in_7d?.price ?? []} up={up} width={280} height={56} className="w-full h-14" />
      </div>
    </Link>
  );
}

const FEATURES = [
  {
    icon: BarChart3,
    title: "Pro trading terminal",
    body: "Full TradingView charts, 50+ indicators, drawing tools, and multiple timeframes.",
  },
  {
    icon: Wallet2,
    title: "Browser-native HD wallets",
    body: "BIP39 mnemonics, BIP32/44/84 derivation for BTC, ETH, and every EVM chain.",
  },
  {
    icon: Lock,
    title: "Non-custodial by default",
    body: "Keys are encrypted with AES and stored only in your browser. Ever.",
  },
  {
    icon: Rocket,
    title: "Real-time everywhere",
    body: "Live prices, live order books, live sparklines. Updated every second.",
  },
  {
    icon: ShieldCheck,
    title: "Institutional security",
    body: "2FA-ready, device tracking, anti-phishing codes and withdrawal whitelists.",
  },
  {
    icon: Sparkles,
    title: "Zero clutter",
    body: "A design tuned for hours of screen time. Bloomberg density, Apple polish.",
  },
];

function FeatureGrid() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-primary/90 font-medium">Why PrimeCapital</p>
        <h2 className="mt-2 font-display text-3xl md:text-4xl font-semibold">
          Everything a trader needs.
          <br />
          Nothing they don't.
        </h2>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="glass rounded-xl p-6 hover:bg-white/[.05] transition group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)]/20 border border-primary/20 text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsBand() {
  const stats = [
    { k: "$142B+", v: "24h volume across venues" },
    { k: "500+", v: "listed assets" },
    { k: "7", v: "supported chains" },
    { k: "0.01%", v: "maker fee, VIP tier" },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="glass-strong rounded-2xl p-8 md:p-10 grid gap-6 md:grid-cols-4 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-secondary/30 blur-3xl" />
        {stats.map((s) => (
          <div key={s.k}>
            <p className="font-display text-3xl md:text-4xl font-semibold text-gradient">{s.k}</p>
            <p className="mt-2 text-sm text-muted-foreground">{s.v}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="relative overflow-hidden rounded-3xl glass-strong p-10 md:p-16 text-center">
        <div className="absolute inset-0 -z-10 opacity-70" style={{ backgroundImage: "var(--gradient-hero)" }} />
        <Zap className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-4 font-display text-3xl md:text-5xl font-semibold">
          Ready when you are.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
          Generate a wallet in under 10 seconds. Trade on the same page. No email required.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/wallet" className="rounded-lg bg-[image:var(--gradient-brand)] px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow">
            Create a wallet
          </Link>
          <Link to="/markets" className="rounded-lg glass-strong px-6 py-3 text-sm font-semibold">
            Explore markets
          </Link>
        </div>
      </div>
    </section>
  );
}
