import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader, Spinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/constants";
import { depositFunds, getWallet, withdrawFunds } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet & escrow — AdBridge" },
      {
        name: "description",
        content:
          "Add money, keep campaign budgets safely in escrow and track every payout on AdBridge.",
      },
      { property: "og:title", content: "Wallet & escrow — AdBridge" },
      { property: "og:description", content: "Escrow-backed campaign payments and payout history." },
    ],
  }),
  component: WalletPage,
});

const LABELS: Record<string, string> = {
  deposit: "Money added",
  escrow_lock: "Locked in escrow",
  escrow_release: "Released to creator",
  withdrawal: "Withdrawn",
  platform_fee: "Platform fee",
  payout: "Campaign payout received",
};

function WalletPage() {
  const queryClient = useQueryClient();
  const fetchWallet = useServerFn(getWallet);
  const deposit = useServerFn(depositFunds);
  const withdraw = useServerFn(withdrawFunds);
  const [amount, setAmount] = useState("5000");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);

  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => fetchWallet() });

  const run = async (kind: "deposit" | "withdraw") => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(kind);
    try {
      if (kind === "deposit") await deposit({ data: { amount: value } });
      else await withdraw({ data: { amount: value } });
      toast.success(kind === "deposit" ? "Money added to your wallet" : "Withdrawal processed");
      await queryClient.invalidateQueries({ queryKey: ["wallet"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  if (wallet.isPending) return <PageLoader label="Loading your wallet" />;

  const data = wallet.data;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Wallet & escrow</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Test mode — payments are simulated, no real money moves. Campaign budgets stay locked in
        escrow until you verify the creator's post.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card label="Available balance" value={formatINR(data?.balance ?? 0)} />
        <Card label="Locked in escrow" value={formatINR(data?.escrow ?? 0)} />
        <Card
          label="Total held"
          value={formatINR((data?.balance ?? 0) + (data?.escrow ?? 0))}
        />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-panel">
        <Label htmlFor="amount">Amount (₹)</Label>
        <div className="mt-2 flex flex-wrap gap-3">
          <Input
            id="amount"
            className="max-w-40"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button onClick={() => run("deposit")} disabled={busy !== null}>
            {busy === "deposit" ? <Spinner /> : <ArrowDownToLine className="size-4" />} Add money
          </Button>
          <Button variant="outline" onClick={() => run("withdraw")} disabled={busy !== null}>
            {busy === "withdraw" ? <Spinner /> : <ArrowUpFromLine className="size-4" />} Withdraw
          </Button>
        </div>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Transaction history</h2>
      {(data?.ledger ?? []).length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Wallet}
            title="No transactions yet"
            description="Add money to your wallet to fund your first campaign escrow."
          />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-panel">
          {(data?.ledger ?? []).map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium">
                  {LABELS[entry.transaction_type] ?? entry.transaction_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.note} · {new Date(entry.created_at).toLocaleString("en-IN")}
                </p>
              </div>
              <span
                className={
                  "text-sm font-semibold " +
                  (Number(entry.amount) < 0 ? "text-muted-foreground" : "text-primary")
                }
              >
                {Number(entry.amount) < 0 ? "−" : "+"}
                {formatINR(Math.abs(Number(entry.amount)))}
              </span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-panel">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
