import { useState } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import type { DisplayFlags } from "@/lib/display-flags";

/**
 * Controls the extra badges on the user's balance cards:
 *  - a 24h change percentage on the Initial balance card (bullish + / bearish -)
 *  - the "You are now eligible for yield" line under the yield percentages
 */
export function DisplayFlagsControl({
  current,
  onSet,
}: {
  current: DisplayFlags;
  onSet: (flags: Partial<DisplayFlags>) => Promise<unknown>;
}) {
  const [pct, setPct] = useState(current.change24hEnabled ? String(current.change24hPct) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const num = Number(pct);
  const valid = pct !== "" && Number.isFinite(num);

  const run = async (tag: string, flags: Partial<DisplayFlags>) => {
    setBusy(tag);
    setErr(null);
    try {
      await onSet(flags);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Balance card badges</span>
        <span className="text-xs text-muted-foreground">
          24h:{" "}
          {current.change24hEnabled
            ? `${current.change24hPct >= 0 ? "+" : ""}${current.change24hPct}%`
            : "hidden"}{" "}
          · yield notice: {current.yieldEligible ? "shown" : "hidden"}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        The 24h percentage shows on the Initial balance card. Use a negative number for a bearish
        move and a positive one for bullish.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 4.25 or -3.1"
          className="w-40 glass rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          disabled={busy !== null || !valid}
          onClick={() => run("up", { change24hEnabled: true, change24hPct: Math.abs(num) })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy === "up" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
          Bullish +
        </button>
        <button
          type="button"
          disabled={busy !== null || !valid}
          onClick={() => run("down", { change24hEnabled: true, change24hPct: -Math.abs(num) })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy === "down" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingDown className="h-3.5 w-3.5" />}
          Bearish −
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("off", { change24hEnabled: false })}
          className="rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Remove percentage
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <span className="text-xs text-muted-foreground">
          &ldquo;You are now eligible for yield&rdquo; notice
        </span>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("yes", { yieldEligible: true })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy === "yes" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show text
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("no", { yieldEligible: false })}
          className="rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Remove text
        </button>
      </div>

      {!valid && pct !== "" && <p className="mt-2 text-[11px] text-destructive">Enter a valid number.</p>}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
