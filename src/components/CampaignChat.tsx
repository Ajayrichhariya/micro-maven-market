import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Message = {
  id: string;
  campaign_id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export function CampaignChat({
  campaignId,
  peerId,
  peerLabel,
}: {
  campaignId: string;
  peerId: string;
  peerLabel: string;
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const queryKey = ["campaign-chat", campaignId, peerId];

  const messages = useQuery({
    queryKey,
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("campaign_messages")
        .select("*")
        .eq("campaign_id", campaignId)
        .or(`sender_id.eq.${peerId},receiver_id.eq.${peerId}`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${campaignId}-${peerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campaign_messages", filter: `campaign_id=eq.${campaignId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, peerId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.data?.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !user?.id) return;
    setSending(true);
    const { error } = await supabase.from("campaign_messages").insert({
      campaign_id: campaignId,
      sender_id: user.id,
      receiver_id: peerId,
      message: text,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft("");
    await queryClient.invalidateQueries({ queryKey });
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-panel">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">Chat with {peerLabel}</div>
      <div className="h-72 space-y-3 overflow-y-auto p-4">
        {messages.isPending ? (
          <Spinner />
        ) : (messages.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages yet. Say hello and share the brief details.
          </p>
        ) : (
          (messages.data ?? []).map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm " +
                    (mine
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-foreground")
                  }
                >
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  <p className={"mt-1 text-[10px] " + (mine ? "opacity-70" : "text-muted-foreground")}>
                    {new Date(m.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={draft}
          placeholder="Write a message…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button onClick={() => void send()} disabled={sending || !draft.trim()}>
          {sending ? <Spinner /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
