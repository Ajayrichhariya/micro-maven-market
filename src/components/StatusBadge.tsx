import { cn } from "@/lib/utils";
import type { ApplicationStatus, CampaignStatus } from "@/lib/db";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  brand: "bg-primary/15 text-primary border-primary/30",
};

const applicationMeta: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  applied: { label: "Applied", tone: "info" },
  approved: { label: "In Progress", tone: "brand" },
  rejected: { label: "Rejected", tone: "danger" },
  submitted: { label: "Under Review", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
};

const campaignMeta: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  in_progress: { label: "In Progress", tone: "brand" },
  completed: { label: "Completed", tone: "info" },
};

export function StatusBadge({
  status,
  kind,
  className,
}: {
  status: ApplicationStatus | CampaignStatus;
  kind: "application" | "campaign";
  className?: string;
}) {
  const meta =
    kind === "application"
      ? applicationMeta[status as ApplicationStatus]
      : campaignMeta[status as CampaignStatus];

  if (!meta) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClass[meta.tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}
