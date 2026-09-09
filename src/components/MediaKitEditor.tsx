import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Globe } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CreatorProfile } from "@/lib/db";
import { saveMediaKit } from "@/lib/mediakit.functions";

type CreatorWithKit = CreatorProfile & {
  username: string | null;
  bio: string;
  youtube_handle: string | null;
  portfolio_links: string[];
  is_public: boolean;
};

export function MediaKitEditor({ creator }: { creator: CreatorProfile }) {
  const kit = creator as CreatorWithKit;
  const save = useServerFn(saveMediaKit);
  const queryClient = useQueryClient();

  const [username, setUsername] = useState(kit.username ?? "");
  const [bio, setBio] = useState(kit.bio ?? "");
  const [youtube, setYoutube] = useState(kit.youtube_handle ?? "");
  const [links, setLinks] = useState((kit.portfolio_links ?? []).join("\n"));
  const [isPublic, setIsPublic] = useState(kit.is_public ?? true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await save({
        data: {
          username: username.trim(),
          bio: bio.trim(),
          youtube_handle: youtube.trim() || null,
          portfolio_links: links
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          is_public: isPublic,
        },
      });
      toast.success("Media kit updated");
      await queryClient.invalidateQueries({ queryKey: ["creator-profile"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your media kit");
    } finally {
      setBusy(false);
    }
  };

  const publicUrl =
    typeof window !== "undefined" && kit.username
      ? `${window.location.origin}/creator/${kit.username}`
      : null;

  return (
    <div className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-6 shadow-panel">
      <div>
        <h2 className="text-lg font-semibold">Public media kit</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A shareable page brands can view without logging in. Followers, engagement and your
          starting rate are shown; your email and phone are never public.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mk-username">Public username</Label>
        <Input
          id="mk-username"
          value={username}
          placeholder="rohit-fitness"
          onChange={(e) => setUsername(e.target.value)}
        />
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3" /> {publicUrl}
          </a>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="mk-bio">Short bio</Label>
        <Textarea
          id="mk-bio"
          rows={4}
          value={bio}
          placeholder="What you create, the audience you reach and the brands you've worked with."
          onChange={(e) => setBio(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mk-youtube">YouTube handle (optional)</Label>
        <Input
          id="mk-youtube"
          value={youtube}
          placeholder="yourchannel"
          onChange={(e) => setYoutube(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mk-links">Featured work links (one per line)</Label>
        <Textarea
          id="mk-links"
          rows={3}
          value={links}
          placeholder="https://www.instagram.com/reel/XXXXXXX/"
          onChange={(e) => setLinks(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 text-sm">
          <Globe className="size-4 text-primary" /> Show my media kit publicly
        </div>
        <Switch checked={isPublic} onCheckedChange={setIsPublic} />
      </div>

      <Button onClick={submit} disabled={busy}>
        {busy && <Spinner />} Save media kit
      </Button>
    </div>
  );
}
