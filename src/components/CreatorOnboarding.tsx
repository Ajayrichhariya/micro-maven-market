import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Spinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CITIES, FOLLOWER_BRACKETS, NICHES, formatCompact, formatINR } from "@/lib/constants";

const stepSchemas = [
  z.object({
    instagram_handle: z
      .string()
      .trim()
      .min(2, "Enter your Instagram handle")
      .max(40)
      .regex(/^@?[A-Za-z0-9._]+$/, "Handles can only contain letters, numbers, dots and underscores"),
  }),
  z.object({
    niche: z.string().min(1, "Pick your primary niche"),
    city: z.string().min(1, "Pick your city"),
    state: z.string().trim().min(2, "Enter your state").max(60),
  }),
  z.object({
    bracket: z.string().min(1, "Pick your follower bracket"),
    engagement_rate: z.coerce.number().min(0, "Cannot be negative").max(100, "Must be under 100%"),
    min_rate_per_post: z.coerce.number().min(0, "Cannot be negative").max(10000000),
  }),
];

const STEPS = ["Instagram", "Audience", "Rates"];

export function CreatorOnboarding() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState({
    instagram_handle: "",
    niche: "",
    city: "",
    state: "",
    bracket: "",
    engagement_rate: "3.5",
    min_rate_per_post: "1500",
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const bracket = FOLLOWER_BRACKETS.find((b) => b.label === values.bracket);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const chosen = FOLLOWER_BRACKETS.find((b) => b.label === values.bracket)!;
      const { error } = await supabase.from("creator_profiles").insert({
        user_id: user.id,
        instagram_handle: values.instagram_handle.replace(/^@/, ""),
        niche: values.niche,
        city: values.city,
        state: values.state,
        follower_count: chosen.value,
        avg_views: chosen.avgViews,
        engagement_rate: Number(values.engagement_rate),
        min_rate_per_post: Number(values.min_rate_per_post),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Creator profile created — start applying to campaigns");
      await queryClient.invalidateQueries({ queryKey: ["creator-profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const validateStep = () => {
    const result = stepSchemas[step]!.safeParse(values);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return false;
    }
    setErrors({});
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else mutation.mutate();
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-panel">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Set up your creator profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Brands use this to decide whether you match their campaign. It takes under a minute.
        </p>
        <Progress value={((step + 1) / STEPS.length) * 100} className="mt-6" />

        <div className="mt-8 space-y-5">
          {step === 0 && (
            <div className="space-y-2">
              <Label htmlFor="handle">Instagram handle</Label>
              <Input
                id="handle"
                placeholder="@fitwithria"
                value={values.instagram_handle}
                onChange={(e) => set("instagram_handle", e.target.value)}
              />
              {errors['instagram_handle'] && (
                <p className="text-sm text-destructive">{errors['instagram_handle']}</p>
              )}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Primary niche</Label>
                <Select value={values.niche} onValueChange={(v) => set("niche", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a niche" />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors['niche'] && <p className="text-sm text-destructive">{errors['niche']}</p>}
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Select value={values.city} onValueChange={(v) => set("city", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose your city" />
                  </SelectTrigger>
                  <SelectContent>
                    {CITIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors['city'] && <p className="text-sm text-destructive">{errors['city']}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  placeholder="Maharashtra"
                  value={values.state}
                  onChange={(e) => set("state", e.target.value)}
                />
                {errors['state'] && <p className="text-sm text-destructive">{errors['state']}</p>}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Follower bracket</Label>
                <Select value={values.bracket} onValueChange={(v) => set("bracket", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose your bracket" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOWER_BRACKETS.map((b) => (
                      <SelectItem key={b.label} value={b.label}>
                        {b.label} followers
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bracket && (
                  <p className="text-xs text-muted-foreground">
                    Estimated average views per reel: {formatCompact(bracket.avgViews)}
                  </p>
                )}
                {errors['bracket'] && <p className="text-sm text-destructive">{errors['bracket']}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="er">Engagement rate (%)</Label>
                <Input
                  id="er"
                  type="number"
                  step="0.1"
                  value={values.engagement_rate}
                  onChange={(e) => set("engagement_rate", e.target.value)}
                />
                {errors['engagement_rate'] && (
                  <p className="text-sm text-destructive">{errors['engagement_rate']}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">Minimum payout per post (₹)</Label>
                <Input
                  id="rate"
                  type="number"
                  value={values.min_rate_per_post}
                  onChange={(e) => set("min_rate_per_post", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  You'll be shown campaigns paying {formatINR(Number(values.min_rate_per_post) || 0)}{" "}
                  or more prominently.
                </p>
                {errors['min_rate_per_post'] && (
                  <p className="text-sm text-destructive">{errors['min_rate_per_post']}</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || mutation.isPending}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button onClick={next} disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {step === STEPS.length - 1 ? (
              <>
                <CheckCircle2 className="size-4" /> Finish
              </>
            ) : (
              <>
                Continue <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
