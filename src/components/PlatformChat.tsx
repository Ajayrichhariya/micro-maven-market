import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CampaignChat } from "@/components/CampaignChat";
import { Spinner } from "@/components/Spinner";
import { getPlatformContact } from "@/lib/platform.functions";

/** Brands and creators only ever chat with the platform team, never with each other. */
export function PlatformChat({ campaignId }: { campaignId: string }) {
  const contactFn = useServerFn(getPlatformContact);
  const contact = useQuery({
    queryKey: ["platform-contact"],
    staleTime: 5 * 60 * 1000,
    queryFn: () => contactFn(),
  });

  if (contact.isPending) return <Spinner />;
  if (!contact.data)
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        The platform team is not available right now. Please try again later.
      </p>
    );

  return (
    <CampaignChat campaignId={campaignId} peerId={contact.data.id} peerLabel="Platform team" />
  );
}
