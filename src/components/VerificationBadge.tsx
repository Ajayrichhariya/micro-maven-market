import { BadgeCheck, Clock } from "lucide-react";

export function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
      <BadgeCheck className="size-3" /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Clock className="size-3" /> Unverified
    </span>
  );
}
