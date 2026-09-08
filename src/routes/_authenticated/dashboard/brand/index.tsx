import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, Plus, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader, Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CITIES, FOLLOWER_BRACKETS, NICHES, formatCompact, formatINR } from "@/lib/constants";
import type { Campaign } from "@/lib/db";
import { createCampaign } from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/dashboard/brand/")({
  head: () => ({
    meta: [
      { title: "Brand dashboard — AdBridge" },
      {
        name: "description",
        content:
          "Launch micro-influencer campaigns, review applicants and release payouts after verifying deliverables.",
      },
      { property: "og:title", content: "Brand dashboard — AdBridge" },
      {
        property: "og:description",
        content: "Launch campaigns and manage creators on AdBridge.",
      },
    ],
  }),
  component: BrandDashboard,
});

const AVG_VIEWS =
  FOLLOWER_BRACKETS.reduce((sum, b) => sum + b.avgViews, 0) / FOLLOWER_BRACKETS.length;

const formSchema = z.object({
  title: z.string().trim().min(4, "Title must be at least 4 characters").max(120),
  description: z.string().trim().min(20, "Describe the campaign in at least 20 characters").max(2000),
  niche_requirement: z.string().min(1, "Pick a niche"),
  target_city: z.string().min(1, "Pick a target city"),
  total_budget: z.coerce.number().positive("Budget must be greater than 0"),
  payout_per_creator: z.coerce.number().positive("Payout must be greater than 0"),
  max_creators_needed: z.coerce.number().int().min(1, "At least 1 creator").max(500),
  guidelines: z.string().trim().min(10, "Add content guidelines").max(4000),
});

function BrandDashboard() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  const campaigns = useQuery({
    queryKey: ["brand-campaigns", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("brand_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const applications = useQuery({
    queryKey: ["brand-application-counts", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_applications")
        .select("campaign_id, status, campaigns!inner(brand_id)")
        .eq("campaigns.brand_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const countFor = (campaignId: string) =>
    (applications.data ?? []).filter((a) => a.campaign_id === campaignId).length;

  const totalSpend = (campaigns.data ?? []).reduce(
    (sum, c) => sum + Number(c.payout_per_creator) * countFor(c.id),
    0,
  );

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brand dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish briefs, approve micro-influencers and pay only after verified delivery.
          </p>
        </div>
        <CampaignWizard open={open} onOpenChange={setOpen} />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Metric label="Campaigns" value={String(campaigns.data?.length ?? 0)} />
        <Metric label="Total applications" value={String(applications.data?.length ?? 0)} />
        <Metric label="Committed payouts" value={formatINR(totalSpend)} />
      </div>

      {campaigns.isPending ? (
        <PageLoader label="Loading campaigns" />
      ) : (campaigns.data ?? []).length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create your first brief to start receiving applications from matching micro-influencers."
          action={<Button onClick={() => setOpen(true)}>Create campaign</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.data!.map((campaign) => (
            <Link
              key={campaign.id}
              to="/dashboard/brand/campaigns/$id"
              params={{ id: campaign.id }}
              className="rounded-xl border border-border bg-card p-5 shadow-panel transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{campaign.title}</h3>
                <StatusBadge status={campaign.status} kind="campaign" />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {campaign.description}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs">
                <Stat label="Payout" value={formatINR(campaign.payout_per_creator)} />
                <Stat label="Slots" value={String(campaign.max_creators_needed)} />
                <Stat label="Applicants" value={String(countFor(campaign.id))} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-panel">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  );
}

function CampaignWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createCampaign);

  const form = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      niche_requirement: "",
      target_city: "",
      total_budget: 50000,
      payout_per_creator: 2500,
      max_creators_needed: 10,
      guidelines: "",
    },
  });

  const creators = Number(form.watch("max_creators_needed")) || 0;
  const payout = Number(form.watch("payout_per_creator")) || 0;
  const budget = Number(form.watch("total_budget")) || 0;
  const estimatedReach = Math.round(creators * AVG_VIEWS);

  const mutation = useMutation({
    mutationFn: async (values: z.output<typeof formSchema>) =>
      create({ data: { ...values, status: "active" as const } }),
    onSuccess: async () => {
      toast.success("Campaign published — creators can apply now");
      form.reset();
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["brand-campaigns"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a campaign</DialogTitle>
          <DialogDescription>
            Define the brief, budget and audience. Creators matching your niche and city see it
            first.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign title</FormLabel>
                  <FormControl>
                    <Input placeholder="Launch reels for our protein bar" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="What are we promoting and why?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="niche_requirement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Niche</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a niche" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NICHES.map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target city</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a city" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CITIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="total_budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total budget (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="payout_per_creator"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payout / creator (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="max_creators_needed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Creators needed</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="guidelines"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content guidelines</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Mention the product in the first 3 seconds, tag @brand, use #ad…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <TrendingUp className="size-4" /> Campaign summary
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="Estimated reach" value={formatCompact(estimatedReach)} />
                <Stat label="Creators" value={String(creators)} />
                <Stat label="Committed" value={formatINR(creators * payout)} />
                <Stat label="Budget" value={formatINR(budget)} />
              </div>
              {creators * payout > budget && (
                <p className="mt-3 text-xs text-destructive">
                  Your budget doesn't cover payout × creators. Increase the budget to publish.
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner />}
              Publish campaign
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
