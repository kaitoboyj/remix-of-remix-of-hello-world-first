import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TradingViewChart } from "@/components/TradingViewChart";
import { marketsQuery, formatUSD, formatCompact, formatPct } from "@/lib/prices";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SwapWidget } from "@/components/SwapWidget";
import { useWalletSession } from "@/hooks/useWalletSession";
import { getPrivateKey } from "@/lib/wallet-signer";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trade — PrimeCapital Terminal" },
      { name: "description", content: "Pro crypto trading terminal with live TradingView charts, order book, and market/limit orders." },
      { property: "og:title", content: "PrimeCapital Trading Terminal" },
      { property: "og:description", content: "Live TradingView charts and pro order entry, side-by-side." },
    ],
  }),
  component: TradePage,
});

const PAIRS = [
  { id: "bitcoin", symbol: "BTCUSDT", label: "BTC / USDT" },
  { id: "ethereum", symbol: "ETHUSDT", label: "ETH / USDT" },
  { id: "solana", symbol: "SOLUSDT", label: "SOL / USDT" },
  { id: "binancecoin", symbol: "BNBUSDT", label: "BNB / USDT" },
  { id: "ripple", symbol: "XRPUSDT", label: "XRP / USDT" },
  { id: "dogecoin", symbol: "DOGEUSDT", label: "DOGE / USDT" },
];

const INTERVALS = [
  { l: "1m", v: "1" },
  { l: "5m", v: "5" },
  { l: "15m", v: "15" },
  { l: "1H", v: "60" },
  { l: "4H", v: "240" },
  { l: "1D", v: "D" },
];

function TradePage() {
  const [pairIdx, setPairIdx] = useState(0);
  const [interval, setInterval] = useState("60");
  const pair = PAIRS[pairIdx];

  const { data } = useQuery(marketsQuery(50));
  const coin = data?.find((c) => c.id === pair.id);

  return (
    <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-6 py-6">
      <div className="grid gap-3 lg:grid-cols-[260px_1fr_320px]">
        {/* Left: pair list */}
        <aside className="glass rounded-xl p-2 h-fit lg:sticky lg:top-20 order-2 lg:order-1">
          <h3 className="px-3 pt-2 pb-1 text-xs uppercase tracking-widest text-muted-foreground font-medium">
            Pairs
          </h3>
          <ul className="max-h-[560px] overflow-auto">
            {PAIRS.map((p, i) => {
              const c = data?.find((x) => x.id === p.id);
              const up = (c?.price_change_percentage_24h ?? 0) >= 0;
              const active = i === pairIdx;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setPairIdx(i)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition",
                      active ? "bg-white/10" : "hover:bg-white/5",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {c && <img src={c.image} alt="" className="h-5 w-5 rounded-full" />}
                      <span className="font-medium">{p.label}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xs font-mono">{c ? formatUSD(c.current_price) : "—"}</span>
                      <span className={cn("block text-[10px] font-mono", up ? "text-success" : "text-destructive")}>
                        {formatPct(c?.price_change_percentage_24h)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Center: chart + book */}
        <section className="space-y-3 order-1 lg:order-2 min-w-0">
          <div className="glass rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {coin && <img src={coin.image} alt="" className="h-9 w-9 rounded-full" />}
                <div>
                  <p className="font-display text-lg font-semibold">{pair.label}</p>
                  <p className="text-xs text-muted-foreground">{coin?.name}</p>
                </div>
              </div>
              {coin && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <Stat label="Last" value={formatUSD(coin.current_price)} />
                  <Stat
                    label="24h %"
                    value={formatPct(coin.price_change_percentage_24h)}
                    tone={coin.price_change_percentage_24h >= 0 ? "up" : "down"}
                  />
                  <Stat label="24h Volume" value={"$" + formatCompact(coin.total_volume)} />
                  <Stat label="Market Cap" value={"$" + formatCompact(coin.market_cap)} />
                </div>
              )}
              <div className="flex gap-1">
                {INTERVALS.map((it) => (
                  <button
                    key={it.v}
                    onClick={() => setInterval(it.v)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md transition",
                      interval === it.v ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5",
                    )}
                  >
                    {it.l}
                  </button>
                ))}
              </div>
            </div>
            <TradingViewChart symbol={`BINANCE:${pair.symbol}`} interval={interval} height={520} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <OrderBook basePrice={coin?.current_price ?? 0} />
            <RecentTrades basePrice={coin?.current_price ?? 0} symbol={pair.symbol.replace("USDT", "")} />
          </div>
        </section>

        {/* Right: order entry */}
        <aside className="order-3 h-fit lg:sticky lg:top-20">
          <OrderPanel price={coin?.current_price ?? 0} symbol={pair.symbol.replace("USDT", "")} />
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn(
        "font-mono text-sm",
        tone === "up" && "text-success",
        tone === "down" && "text-destructive",
      )}>
        {value}
      </p>
    </div>
  );
}

function OrderBook({ basePrice }: { basePrice: number }) {
  const rows = useMemo(() => generateBook(basePrice), [basePrice]);
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-semibold">Order Book</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Simulated · Depth 12</span>
      </div>
      <div className="grid grid-cols-3 text-[10px] uppercase tracking-widest text-muted-foreground pb-2">
        <span>Price (USDT)</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>
      <div className="space-y-0.5">
        {rows.asks.map((r, i) => <BookRow key={"a" + i} row={r} side="ask" />)}
      </div>
      <div className="my-2 text-center py-1 rounded bg-white/5 font-mono text-sm">
        {formatUSD(basePrice)}
      </div>
      <div className="space-y-0.5">
        {rows.bids.map((r, i) => <BookRow key={"b" + i} row={r} side="bid" />)}
      </div>
    </div>
  );
}

function BookRow({ row, side }: { row: { price: number; amount: number; pct: number }; side: "bid" | "ask" }) {
  const total = row.price * row.amount;
  return (
    <div className="relative grid grid-cols-3 text-xs font-mono py-0.5">
      <div
        className={cn("absolute inset-y-0 right-0 opacity-15", side === "bid" ? "bg-success" : "bg-destructive")}
        style={{ width: `${row.pct}%` }}
      />
      <span className={cn("relative", side === "bid" ? "text-success" : "text-destructive")}>
        {row.price.toFixed(2)}
      </span>
      <span className="relative text-right">{row.amount.toFixed(4)}</span>
      <span className="relative text-right text-muted-foreground">{total.toFixed(0)}</span>
    </div>
  );
}

function generateBook(base: number) {
  if (!base) return { bids: [], asks: [] };
  const step = base * 0.0004;
  const rand = (i: number) => Math.abs(Math.sin(i * 12.9898 + base) * 43758.5) % 1;
  const asks = Array.from({ length: 12 }, (_, i) => {
    const price = base + step * (i + 1);
    const amount = 0.2 + rand(i + 3) * 4;
    return { price, amount, pct: 20 + rand(i + 7) * 80 };
  }).reverse();
  const bids = Array.from({ length: 12 }, (_, i) => {
    const price = base - step * (i + 1);
    const amount = 0.2 + rand(i + 9) * 4;
    return { price, amount, pct: 20 + rand(i + 11) * 80 };
  });
  return { bids, asks };
}

function RecentTrades({ basePrice, symbol }: { basePrice: number; symbol: string }) {
  const trades = useMemo(() => {
    if (!basePrice) return [];
    const now = Date.now();
    return Array.from({ length: 14 }, (_, i) => {
      const drift = (Math.sin(i * 3.3 + basePrice) + 1) * 0.5;
      const buy = drift > 0.45;
      const price = basePrice * (1 + (drift - 0.5) * 0.0006);
      const amount = 0.05 + drift * 1.4;
      return { time: new Date(now - i * 8000), price, amount, buy };
    });
  }, [basePrice]);
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-semibold">Recent Trades · {symbol}</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Live feed</span>
      </div>
      <div className="grid grid-cols-3 text-[10px] uppercase tracking-widest text-muted-foreground pb-2">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>
      <ul className="space-y-0.5">
        {trades.map((t, i) => (
          <li key={i} className="grid grid-cols-3 text-xs font-mono">
            <span className={t.buy ? "text-success" : "text-destructive"}>{t.price.toFixed(2)}</span>
            <span className="text-right">{t.amount.toFixed(4)}</span>
            <span className="text-right text-muted-foreground">
              {t.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderPanel({ price, symbol }: { price: number; symbol: string }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [mode, setMode] = useState<"market" | "limit" | "stop">("limit");
  const [amount, setAmount] = useState("");
  const [limit, setLimit] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [swapOpen, setSwapOpen] = useState(false);
  const session = useWalletSession();
  const privateKey = session ? getPrivateKey(session.address) : undefined;

  const usdBal = 25000;
  const effectivePrice = mode === "market" ? price : Number(limit) || price;
  const total = (Number(amount) || 0) * effectivePrice;
  const feePct = 0.001;
  const fee = total * feePct;

  const setPct = (pct: number) => {
    const budget = (usdBal * pct) / 100;
    const qty = effectivePrice ? budget / effectivePrice : 0;
    setAmount(qty.toFixed(6));
  };

  const handleSubmit = () => {
    notify({
      event: `trade_${side}_click`,
      label: symbol,
      extra: `mode=${mode} amount=${amount || "0"} price=${effectivePrice} total=${total.toFixed(2)} lev=${leverage}x`,
    });
    setSwapOpen(true);
  };

  return (
    <div className="glass rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
        <button
          onClick={() => setSide("buy")}
          className={cn(
            "rounded-md py-2 text-sm font-semibold transition",
            side === "buy" ? "bg-success text-success-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Buy {symbol}
        </button>
        <button
          onClick={() => setSide("sell")}
          className={cn(
            "rounded-md py-2 text-sm font-semibold transition",
            side === "sell" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Sell {symbol}
        </button>
      </div>

      <div className="flex gap-1 text-xs">
        {(["market", "limit", "stop"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "px-3 py-1.5 rounded-md capitalize transition",
              mode === m ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Available</span>
          <span className="font-mono text-foreground">${usdBal.toLocaleString()}</span>
        </div>

        {mode !== "market" && (
          <Field label="Price (USDT)">
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder={price ? price.toFixed(2) : "0.00"}
              className="w-full bg-transparent text-right font-mono outline-none"
              inputMode="decimal"
            />
          </Field>
        )}

        <Field label={`Amount (${symbol})`}>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent text-right font-mono outline-none"
            inputMode="decimal"
          />
        </Field>

        <div className="grid grid-cols-4 gap-1 text-xs">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              onClick={() => setPct(p)}
              className="rounded-md bg-white/5 py-1.5 hover:bg-white/10 transition text-muted-foreground hover:text-foreground"
            >
              {p}%
            </button>
          ))}
        </div>

        <div className="pt-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Leverage</span>
            <span className="font-mono text-foreground">{leverage}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full mt-2 accent-[oklch(0.78_0.16_210)]"
          />
        </div>
      </div>

      <div className="border-t border-white/5 pt-3 space-y-1.5 text-xs font-mono">
        <Row label="Order value" value={"$" + total.toFixed(2)} />
        <Row label="Est. fee (0.10%)" value={"$" + fee.toFixed(2)} />
        <Row label="Slippage" value="0.05%" />
      </div>

      <button
        onClick={handleSubmit}
        className={cn(
          "w-full rounded-lg py-3 text-sm font-semibold transition shadow-glow",
          side === "buy"
            ? "bg-success text-success-foreground hover:opacity-90"
            : "bg-emerald-600 text-white hover:opacity-90",
        )}
      >
        {side === "buy" ? "Buy" : "Sell"} {symbol} — {mode.toUpperCase()}
      </button>

      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {side === "buy" ? "Buy" : "Sell"} {symbol} · Cross-chain Swap
            </DialogTitle>
            <DialogDescription>
              Execute your {side} order via a real cross-chain swap powered by thirdweb Bridge.
            </DialogDescription>
          </DialogHeader>
          {!session ? (
            <div className="glass rounded-xl p-6 text-sm text-center space-y-3">
              <p className="text-muted-foreground">Connect a wallet to trade.</p>
              <Link
                to="/wallet"
                className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Open Wallet
              </Link>
            </div>
          ) : !privateKey ? (
            <div className="glass rounded-xl p-6 text-sm text-center space-y-3">
              <p className="text-muted-foreground">
                Re-open your wallet to re-enable swap signing (private key is kept in memory only).
              </p>
              <Link
                to="/wallet"
                className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Go to Wallet
              </Link>
            </div>
          ) : (
            <SwapWidget privateKey={privateKey} address={session.address} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block glass rounded-lg px-3 py-2">
      <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
