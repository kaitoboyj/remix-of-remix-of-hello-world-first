import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { WithdrawButton } from "@/lib/withdraw";

export function WithdrawButtonControl({
  current,
  currentFee,
  currentSupportMessage,
  onSet,
}: {
  current: WithdrawButton;
  currentFee: number;
  currentSupportMessage?: string | null;
  onSet: (button: WithdrawButton, fee: number, supportMessage: string) => Promise<unknown>;
}) {
  const [fee, setFee] = useState(currentFee ? String(currentFee) : "");
  const [supportMessage, setSupportMessage] = useState(
    currentSupportMessage ?? "Please contact support to rectify the issue with your withdrawal.",
  );
  const [busy, setBusy] = useState<WithdrawButton | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const feeNum = Number(fee);
  const feeValid = fee !== "" && Number.isFinite(feeNum) && feeNum > 0;

  const run = async (button: WithdrawButton) => {
    setBusy(button);
    setErr(null);
    try {
      await onSet(button, feeValid ? feeNum : 0, supportMessage.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Withdraw button (home page)</span>
        <span className="text-xs text-muted-foreground">
          Active:{" "}
          {current === "none"
            ? "none"
            : current === "blue"
              ? "blue"
              : current === "red"
                ? "red (support)"
                : `green · fee $${currentFee.toLocaleString()}`}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Only one button shows at a time. Green requires a fee amount. Red opens support and does not require a fee.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          inputMode="decimal"
          placeholder="Fee amount (USD)"
          className="w-40 glass rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("blue")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy === "blue" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show blue button
        </button>
        <button
          type="button"
          disabled={busy !== null || !feeValid}
          onClick={() => run("green")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          title={feeValid ? "" : "Enter the fee amount first"}
        >
          {busy === "green" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show green button
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("red")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 shadow-glow"
        >
          {busy === "red" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show support button
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("none")}
          className="rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Hide button
        </button>
      </div>
      <label className="mt-3 block text-[11px] text-muted-foreground">
        Red-mode support message
        <textarea
          value={supportMessage}
          onChange={(e) => setSupportMessage(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
        />
      </label>
      {!feeValid && <p className="mt-2 text-[11px] text-muted-foreground">Enter a fee amount only when enabling the green button.</p>}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
