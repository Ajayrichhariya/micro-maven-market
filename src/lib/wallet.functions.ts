import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PLATFORM_FEE_RATE = 0.1;

type WalletRow = { user_id: string; current_balance: number; locked_escrow: number };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ensureWallet(userId: string): Promise<WalletRow> {
  const db = await admin();
  const { data } = await db
    .from("user_wallets")
    .select("user_id, current_balance, locked_escrow")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as WalletRow;

  const { data: created, error } = await db
    .from("user_wallets")
    .insert({ user_id: userId })
    .select("user_id, current_balance, locked_escrow")
    .single();
  if (error) throw new Error(error.message);
  return created as WalletRow;
}

async function writeLedger(entries: {
  user_id: string;
  amount: number;
  transaction_type: "deposit" | "escrow_lock" | "escrow_release" | "withdrawal" | "platform_fee" | "payout";
  reference_id?: string | null;
  note?: string | null;
}[]) {
  const db = await admin();
  const { error } = await db.from("wallet_ledger").insert(entries);
  if (error) throw new Error(error.message);
}

/** Wallet balance + recent ledger for the signed-in user. */
export const getWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wallet = await ensureWallet(context.userId);
    const db = await admin();
    const { data: ledger } = await db
      .from("wallet_ledger")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      balance: Number(wallet.current_balance),
      escrow: Number(wallet.locked_escrow),
      ledger: (ledger ?? []) as {
        id: string;
        amount: number;
        transaction_type: string;
        reference_id: string | null;
        note: string | null;
        status: string;
        created_at: string;
      }[],
    };
  });

/** Mock gateway top-up. Replace the simulated success with a Razorpay/Cashfree webhook later. */
export const depositFunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ amount: z.number().positive().max(10000000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const wallet = await ensureWallet(context.userId);
    const db = await admin();
    const next = Number(wallet.current_balance) + data.amount;
    const { error } = await db
      .from("user_wallets")
      .update({ current_balance: next })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    await writeLedger([
      {
        user_id: context.userId,
        amount: data.amount,
        transaction_type: "deposit",
        reference_id: `mock_${Date.now()}`,
        note: "Wallet top-up (test gateway)",
      },
    ]);
    return { balance: next };
  });

/** Creator/brand withdrawal request — settled instantly in test mode. */
export const withdrawFunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ amount: z.number().positive().max(10000000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const wallet = await ensureWallet(context.userId);
    if (Number(wallet.current_balance) < data.amount) throw new Error("Not enough balance");

    const db = await admin();
    const next = Number(wallet.current_balance) - data.amount;
    const { error } = await db
      .from("user_wallets")
      .update({ current_balance: next })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    await writeLedger([
      {
        user_id: context.userId,
        amount: -data.amount,
        transaction_type: "withdrawal",
        reference_id: `payout_${Date.now()}`,
        note: "Withdrawal to bank (test mode)",
      },
    ]);
    return { balance: next };
  });

/** Move a campaign's full budget from the brand's balance into locked escrow. */
export const lockCampaignEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, brand_id, payout_per_creator, max_creators_needed")
      .eq("id", data.campaign_id)
      .maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign || campaign.brand_id !== userId) throw new Error("Campaign not found");

    const db = await admin();
    const { data: existing } = await db
      .from("wallet_ledger")
      .select("id")
      .eq("reference_id", data.campaign_id)
      .eq("transaction_type", "escrow_lock")
      .limit(1);
    if (existing && existing.length > 0) throw new Error("Escrow is already funded for this campaign");

    const amount = Number(campaign.payout_per_creator) * campaign.max_creators_needed;
    const wallet = await ensureWallet(userId);
    if (Number(wallet.current_balance) < amount)
      throw new Error("Add money to your wallet to fund this campaign's escrow");

    const { error } = await db
      .from("user_wallets")
      .update({
        current_balance: Number(wallet.current_balance) - amount,
        locked_escrow: Number(wallet.locked_escrow) + amount,
      })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    await writeLedger([
      {
        user_id: userId,
        amount,
        transaction_type: "escrow_lock",
        reference_id: data.campaign_id,
        note: "Campaign budget locked in escrow",
      },
    ]);
    return { locked: amount };
  });

/** Internal: brand escrow -> creator balance, minus the platform fee. */
export async function settleEscrowPayout(params: {
  brandId: string;
  creatorUserId: string;
  amount: number;
  campaignId: string;
}) {
  const db = await admin();
  const brandWallet = await ensureWallet(params.brandId);
  const creatorWallet = await ensureWallet(params.creatorUserId);

  const locked = Number(brandWallet.locked_escrow);
  if (locked < params.amount)
    throw new Error("Not enough money in escrow for this campaign — fund the escrow first");

  const fee = Math.round(params.amount * PLATFORM_FEE_RATE * 100) / 100;
  const net = params.amount - fee;

  const { error: brandError } = await db
    .from("user_wallets")
    .update({ locked_escrow: locked - params.amount })
    .eq("user_id", params.brandId);
  if (brandError) throw new Error(brandError.message);

  const { error: creatorError } = await db
    .from("user_wallets")
    .update({ current_balance: Number(creatorWallet.current_balance) + net })
    .eq("user_id", params.creatorUserId);
  if (creatorError) throw new Error(creatorError.message);

  await writeLedger([
    {
      user_id: params.brandId,
      amount: -params.amount,
      transaction_type: "escrow_release",
      reference_id: params.campaignId,
      note: "Payout released to creator",
    },
    {
      user_id: params.creatorUserId,
      amount: net,
      transaction_type: "payout",
      reference_id: params.campaignId,
      note: `Campaign payout (after ${PLATFORM_FEE_RATE * 100}% platform fee)`,
    },
    {
      user_id: params.brandId,
      amount: -fee,
      transaction_type: "platform_fee",
      reference_id: params.campaignId,
      note: "Platform fee",
    },
  ]);

  return { net, fee };
}
