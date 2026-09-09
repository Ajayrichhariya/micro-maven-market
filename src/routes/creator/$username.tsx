import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, ExternalLink, Instagram, MapPin, Youtube } from "lucide-react";

import { Logo } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { formatCompact, formatINR } from "@/lib/constants";
import { getPublicMediaKit } from "@/lib/mediakit.functions";

const mediaKitQuery = (username: string) =>
  queryOptions({
    queryKey: ["media-kit", username],
    queryFn: () => getPublicMediaKit({ data: { username } }),
  });

export const Route = createFileRoute("/creator/$username")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(mediaKitQuery(params.username)),
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Creator media kit | AdBridge` },
      {
        name: "description",
        content: `Media kit for @${params.username}: audience size, niche, engagement rate and collaboration pricing on AdBridge.`,
      },
      { property: "og:title", content: `@${params.username} — Creator media kit` },
      { property: "og:type", content: "profile" },
      {
        property: "og:description",
        content: "Audience, engagement and pricing for brand collaborations.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => <Shell><p className="text-muted-foreground">This media kit could not be loaded.</p></Shell>,
  notFoundComponent: () => <Shell><p className="text-muted-foreground">Media kit not found.</p></Shell>,
  component: MediaKitPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background bg-aurora">
      <header className="border-b border-border/70 px-4 py-4 sm:px-6">
        <Link to="/">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}

function MediaKitPage() {
  const { username } = Route.useParams();
  const { data } = useSuspenseQuery(mediaKitQuery(username));

  if (!data)
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Media kit not available</h1>
        <p className="mt-2 text-muted-foreground">
          @{username} hasn't published a public media kit yet.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Back to home</Link>
        </Button>
      </Shell>
    );

  return (
    <Shell>
      <div className="rounded-2xl border border-border bg-card p-8 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              @{data.instagram_handle}
              {data.is_verified && <BadgeCheck className="size-6 text-primary" />}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border border-border px-2.5 py-1">{data.niche}</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {data.city}
                {data.state ? `, ${data.state}` : ""}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a
                href={`https://instagram.com/${data.instagram_handle.replace("@", "")}`}
                target="_blank"
                rel="noreferrer"
              >
                <Instagram className="size-4" /> Instagram
              </a>
            </Button>
            {data.youtube_handle && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`https://youtube.com/@${data.youtube_handle.replace("@", "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Youtube className="size-4" /> YouTube
                </a>
              </Button>
            )}
          </div>
        </div>

        {data.bio && <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{data.bio}</p>}

        <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6 sm:grid-cols-4">
          <Stat label="Followers" value={formatCompact(data.follower_count)} />
          <Stat label="Avg views / reel" value={formatCompact(data.avg_views)} />
          <Stat label="Engagement rate" value={`${data.engagement_rate}%`} />
          <Stat label="Starting rate" value={formatINR(data.min_rate_per_post)} />
        </div>

        {data.portfolio_links.length > 0 && (
          <div className="mt-8 border-t border-border pt-6">
            <h2 className="text-sm font-semibold">Featured work</h2>
            <ul className="mt-3 space-y-2">
              {data.portfolio_links.map((link) => (
                <li key={link}>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/10 p-5">
          <p className="text-sm font-medium">Want to work with this creator?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Post a campaign on AdBridge — budgets stay in escrow until the reel goes live.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link to="/auth/register">Start a campaign</Link>
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
