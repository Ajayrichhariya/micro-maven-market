import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  IndianRupee,
  Instagram,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import heroImage from "@/assets/hero.jpg";
import { Logo } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AdBridge — Micro-Influencer Ad Exchange for Brands & Creators" },
      {
        name: "description",
        content:
          "AdBridge is the escrow-style middleman between brands and micro-influencers: post a campaign, approve creators, verify reels, release payouts.",
      },
      { property: "og:title", content: "AdBridge — Micro-Influencer Ad Exchange" },
      {
        property: "og:description",
        content:
          "Post a campaign, approve vetted creators, verify Instagram deliverables, release payment on proof.",
      },
    ],
  }),
  component: Landing,
});

const brandSteps = [
  {
    icon: Building2,
    title: "Post a campaign brief",
    body: "Set your niche, target city, budget, payout per creator and how many creators you need.",
  },
  {
    icon: Users,
    title: "AdBridge picks the creators",
    body: "Our team shortlists and assigns vetted creators for you — no DMs, no negotiation, no chasing.",
  },
  {
    icon: ShieldCheck,
    title: "Pay AdBridge, we pay creators",
    body: "Your budget sits with us until every reel is live and verified. Then we release creator payouts.",
  },
];

const promotionReasons = [
  {
    icon: IndianRupee,
    title: "Cheaper than agency ads",
    body: "Pay a fixed rupee amount per reel instead of bidding on impressions you cannot verify.",
  },
  {
    icon: Users,
    title: "Local, niche audiences",
    body: "Reach buyers in your city and category through creators their followers actually trust.",
  },
  {
    icon: BarChart3,
    title: "Proof and numbers, always",
    body: "Every reel comes back with a live link plus views, likes and comments in one ROI report.",
  },
  {
    icon: ShieldCheck,
    title: "Zero coordination work",
    body: "One dashboard, one point of contact. AdBridge handles briefs, follow-ups and payouts.",
  },
];

const creatorSteps = [
  {
    icon: Instagram,
    title: "Onboard in 60 seconds",
    body: "Add your handle, niche, city and follower bracket. Set the minimum you'll accept per post.",
  },
  {
    icon: Sparkles,
    title: "Apply in one click",
    body: "Browse only the campaigns that match your niche and city. No cold DMs, no negotiation loops.",
  },
  {
    icon: Wallet,
    title: "Submit and get paid",
    body: "Drop your reel link, upload proof, and track payout status from review to paid.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background bg-aurora">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> The middleman layer for micro-influencer ads
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Brands post budgets. <span className="text-brand-gradient">Creators deliver reels.</span>{" "}
            AdBridge holds it together.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Stop chasing influencers over DMs and stop chasing brands for payment. AdBridge matches
            campaigns to vetted micro-influencers, verifies every deliverable, and releases payout
            only against proof.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth/register" search={{ role: "brand" }}>
                I'm a brand <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth/register" search={{ role: "creator" }}>
                I'm a creator
              </Link>
            </Button>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-6">
            {[
              { k: "Payout protection", v: "100%" },
              { k: "Niches covered", v: "10+" },
              { k: "Setup time", v: "60 sec" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-xs text-muted-foreground">{s.k}</dt>
                <dd className="text-xl font-semibold">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-2xl border border-border shadow-glow">
            <img
              src={heroImage}
              alt="Network of creators and brands connected through the AdBridge exchange"
              width={1280}
              height={960}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-6 left-6 hidden rounded-xl border border-border bg-card/95 p-4 shadow-panel backdrop-blur sm:block">
            <div className="flex items-center gap-3">
              <BadgeCheck className="size-5 text-success" />
              <div>
                <p className="text-sm font-medium">Payment released</p>
                <p className="text-xs text-muted-foreground">Reel verified · @fitwithria</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-semibold">
                <Building2 className="size-5 text-primary" /> For brands
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Buy reach the way you buy ads — priced, tracked and verified.
              </p>
              <ul className="mt-8 space-y-6">
                {brandSteps.map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
                      <step.icon className="size-5" />
                    </span>
                    <div>
                      <p className="font-medium">
                        <span className="mr-2 text-muted-foreground">0{i + 1}</span>
                        {step.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="flex items-center gap-2 text-2xl font-semibold">
                <Instagram className="size-5 text-primary" /> For creators
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Turn 10K followers into predictable monthly income.
              </p>
              <ul className="mt-8 space-y-6">
                {creatorSteps.map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
                      <step.icon className="size-5" />
                    </span>
                    <div>
                      <p className="font-medium">
                        <span className="mr-2 text-muted-foreground">0{i + 1}</span>
                        {step.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold">Why a middleman at all?</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: IndianRupee,
              title: "Escrow-style payouts",
              body: "Budget is committed at campaign creation and released per creator after verification.",
            },
            {
              icon: BarChart3,
              title: "Reach you can forecast",
              body: "Estimated reach is calculated from creators × average views before you spend a rupee.",
            },
            {
              icon: CheckCircle2,
              title: "Verified creator pool",
              body: "Admins verify handles and engagement, so brands aren't buying inflated follower counts.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border border-border bg-card p-6 shadow-panel">
              <c.icon className="size-5 text-primary" />
              <p className="mt-4 font-medium">{c.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="rounded-2xl border border-primary/30 bg-brand-gradient p-10 text-center shadow-glow">
          <h2 className="text-3xl font-semibold text-primary-foreground">
            Your next campaign is 3 clicks away
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">
            Join brands and micro-influencers running verified, proof-backed collaborations on
            AdBridge.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8">
            <Link to="/auth/register">
              Create your free account <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} AdBridge. Built for micro-influencer commerce.</p>
        </div>
      </footer>
    </div>
  );
}
