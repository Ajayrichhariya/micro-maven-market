import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FileText,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageLoader, Spinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Conversation = Tables<"direct_conversations">;
type DirectMessage = Tables<"direct_messages">;
type ChatContact = {
  id: string;
  full_name: string;
  role: Tables<"profiles">["role"];
  avatar_url: string | null;
};

const CHAT_QUERY_KEY = ["direct-chat"] as const;
const ATTACHMENT_LIMIT = 25 * 1024 * 1024;

export function DirectChat() {
  const { data: profile, user, isPending: profilePending } = useProfile();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const userId = user?.id;

  const contacts = useQuery({
    queryKey: [...CHAT_QUERY_KEY, "contacts", userId],
    enabled: Boolean(userId && profile?.account_status === "approved"),
    queryFn: async (): Promise<ChatContact[]> => {
      const { data, error } = await supabase.rpc("list_approved_chat_contacts");
      if (error) throw error;
      return data ?? [];
    },
  });

  const conversations = useQuery({
    queryKey: [...CHAT_QUERY_KEY, "conversations", userId],
    enabled: Boolean(userId && profile?.account_status === "approved"),
    queryFn: async (): Promise<Conversation[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("direct_conversations")
        .select("*")
        .or(`participant_one.eq.${userId},participant_two.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const conversationIds = (conversations.data ?? []).map((conversation) => conversation.id);
  const unreadMessages = useQuery({
    queryKey: [...CHAT_QUERY_KEY, "unread", userId, conversationIds],
    enabled: Boolean(userId && conversationIds.length),
    queryFn: async () => {
      if (!userId || conversationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("direct_messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .eq("is_read", false)
        .neq("sender_id", userId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const previews = useQuery({
    queryKey: [...CHAT_QUERY_KEY, "previews", userId, conversationIds],
    enabled: Boolean(userId && conversationIds.length),
    queryFn: async () => {
      if (conversationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("direct_messages")
        .select("conversation_id,content,media_path,created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeConversation = (conversations.data ?? []).find(
    (conversation) => conversation.id === selectedId,
  );
  const activePeerId = activeConversation
    ? activeConversation.participant_one === userId
      ? activeConversation.participant_two
      : activeConversation.participant_one
    : null;
  const activeContact = (contacts.data ?? []).find((contact) => contact.id === activePeerId);

  const messages = useQuery({
    queryKey: [...CHAT_QUERY_KEY, "messages", selectedId],
    enabled: Boolean(selectedId && profile?.account_status === "approved"),
    queryFn: async (): Promise<DirectMessage[]> => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!userId || profile?.account_status !== "approved") return;
    const channel = supabase
      .channel(`direct-chat-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: CHAT_QUERY_KEY });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.account_status, queryClient, userId]);

  useEffect(() => {
    const rows = messages.data ?? [];
    let cancelled = false;
    const refreshUrls = async () => {
      const entries = await Promise.all(
        rows.filter((message) => message.media_path).map(async (message) => {
          const path = message.media_path;
          if (!path) return [message.id, ""] as const;
          const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path, 600);
          return [message.id, error ? "" : data.signedUrl] as const;
        }),
      );
      if (!cancelled) {
        setMediaUrls(Object.fromEntries(entries.filter(([, url]) => url)));
      }
    };
    void refreshUrls();
    endRef.current?.scrollIntoView({ block: "nearest" });
    return () => {
      cancelled = true;
    };
  }, [messages.data]);

  useEffect(() => {
    if (!selectedId || !userId || markingRead) return;
    const unread = (messages.data ?? []).some((message) => !message.is_read && message.sender_id !== userId);
    if (!unread) return;
    setMarkingRead(true);
    void supabase
      .from("direct_messages")
      .update({ is_read: true })
      .eq("conversation_id", selectedId)
      .eq("is_read", false)
      .neq("sender_id", userId)
      .then(({ error }) => {
        if (error) toast.error("Could not update read status");
        void queryClient.invalidateQueries({ queryKey: [...CHAT_QUERY_KEY, "unread"] });
        void queryClient.invalidateQueries({ queryKey: [...CHAT_QUERY_KEY, "messages", selectedId] });
        setMarkingRead(false);
      });
  }, [markingRead, messages.data, queryClient, selectedId, userId]);

  const unreadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of unreadMessages.data ?? []) {
      counts.set(message.conversation_id, (counts.get(message.conversation_id) ?? 0) + 1);
    }
    return counts;
  }, [unreadMessages.data]);

  const previewByConversation = useMemo(() => {
    const latest = new Map<string, (typeof previews.data extends (infer T)[] | undefined ? T : never)>();
    for (const message of previews.data ?? []) {
      if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message);
    }
    return latest;
  }, [previews.data]);

  const visibleConversations = (conversations.data ?? []).filter((conversation) => {
    const peerId = conversation.participant_one === userId
      ? conversation.participant_two
      : conversation.participant_one;
    const name = (contacts.data ?? []).find((contact) => contact.id === peerId)?.full_name ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });
  const visibleContacts = (contacts.data ?? []).filter((contact) =>
    `${contact.full_name} ${contact.role}`.toLowerCase().includes(search.toLowerCase()),
  );

  const startConversation = useMutation({
    mutationFn: async (peerId: string) => {
      if (!userId) throw new Error("Sign in to start a conversation");
      const [participant_one, participant_two] = [userId, peerId].sort();
      const { data: existing, error: findError } = await supabase
        .from("direct_conversations")
        .select("id")
        .eq("participant_one", participant_one)
        .eq("participant_two", participant_two)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) return existing.id;
      const { data, error } = await supabase
        .from("direct_conversations")
        .insert({ created_by: userId, participant_one, participant_two })
        .select("id")
        .single();
      if (error) {
        const { data: raced, error: raceError } = await supabase
          .from("direct_conversations")
          .select("id")
          .eq("participant_one", participant_one)
          .eq("participant_two", participant_two)
          .maybeSingle();
        if (raceError || !raced) throw error;
        return raced.id;
      }
      return data.id;
    },
    onSuccess: async (conversationId) => {
      setSelectedId(conversationId);
      setMobileThreadOpen(true);
      setShowNewMessage(false);
      setSearch("");
      await queryClient.invalidateQueries({ queryKey: [...CHAT_QUERY_KEY, "conversations", userId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!selectedId || !userId) throw new Error("Select a conversation first");
      const content = draft.trim();
      if (!content && !attachment) throw new Error("Write a message or attach a file");
      let mediaPath: string | null = null;
      if (attachment) {
        const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
        mediaPath = `${userId}/${selectedId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage.from("chat-media").upload(mediaPath, attachment, {
          contentType: attachment.type || "application/octet-stream",
          upsert: false,
        });
        if (error) throw error;
      }
      const { error } = await supabase.from("direct_messages").insert({
        conversation_id: selectedId,
        sender_id: userId,
        content,
        media_path: mediaPath,
        media_type: attachment?.type || null,
      });
      if (error) {
        if (mediaPath) await supabase.storage.from("chat-media").remove([mediaPath]);
        throw error;
      }
    },
    onSuccess: async () => {
      setDraft("");
      setAttachment(null);
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({ queryKey: CHAT_QUERY_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (profilePending) return <PageLoader label="Loading secure inbox" />;
  if (!profile || profile.account_status !== "approved") {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Your inbox is locked</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Private messages are available after your account is approved by the AdBridge team.
        </p>
      </div>
    );
  }

  const openConversation = (conversationId: string) => {
    setSelectedId(conversationId);
    setMobileThreadOpen(true);
  };

  const onChooseContact = (contactId: string) => {
    const existing = (conversations.data ?? []).find(
      (conversation) =>
        conversation.participant_one === contactId || conversation.participant_two === contactId,
    );
    if (existing) {
      openConversation(existing.id);
      setShowNewMessage(false);
      return;
    }
    startConversation.mutate(contactId);
  };

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private one-to-one conversations between approved AdBridge members.
        </p>
      </div>

      <div className="grid h-[min(72dvh,48rem)] min-h-[32rem] overflow-hidden rounded-lg border border-border bg-card md:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className={mobileThreadOpen ? "hidden border-r border-border md:flex md:flex-col" : "flex flex-col border-r border-border"}>
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Inbox</h2>
              <Button
                size="sm"
                variant={showNewMessage ? "outline" : "default"}
                onClick={() => {
                  setShowNewMessage((value) => !value);
                  setSearch("");
                }}
              >
                {showNewMessage ? "Back" : "New message"}
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={showNewMessage ? "Find an approved member" : "Search conversations"}
                className="pl-9"
                aria-label="Search conversations or approved members"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {showNewMessage ? (
              visibleContacts.length ? visibleContacts.map((contact) => (
                <Button
                  key={contact.id}
                  variant="ghost"
                  className="mb-1 h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                  disabled={startConversation.isPending}
                  onClick={() => onChooseContact(contact.id)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserRound className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{contact.full_name || "AdBridge member"}</span>
                    <span className="block text-xs capitalize text-muted-foreground">{contact.role}</span>
                  </span>
                </Button>
              )) : (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {contacts.isPending ? "Loading approved members…" : "No members match this search."}
                </p>
              )
            ) : visibleConversations.length ? visibleConversations.map((conversation) => {
              const peerId = conversation.participant_one === userId
                ? conversation.participant_two
                : conversation.participant_one;
              const contact = (contacts.data ?? []).find((item) => item.id === peerId);
              const preview = previewByConversation.get(conversation.id);
              const unread = unreadCounts.get(conversation.id) ?? 0;
              return (
                <Button
                  key={conversation.id}
                  variant="ghost"
                  className={`mb-1 h-auto w-full justify-start gap-3 px-3 py-3 text-left ${selectedId === conversation.id ? "bg-muted" : ""}`}
                  onClick={() => openConversation(conversation.id)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserRound className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{contact?.full_name || "AdBridge member"}</span>
                      {unread > 0 && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{unread}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {preview?.media_path && !preview.content ? "Attachment" : preview?.content || "Start a conversation"}
                    </span>
                  </span>
                </Button>
              );
            }) : (
              <div className="px-4 py-10 text-center">
                <MessageSquare className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No conversations yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Start a private chat with an approved member.</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" /> Only approved accounts can use this inbox.
          </div>
        </aside>

        <div className={mobileThreadOpen ? "flex min-w-0 flex-col" : "hidden min-w-0 flex-col md:flex"}>
          {activeConversation ? (
            <>
              <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Back to inbox"
                  onClick={() => setMobileThreadOpen(false)}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UserRound className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{activeContact?.full_name || "AdBridge member"}</p>
                  <p className="text-xs capitalize text-muted-foreground">{activeContact?.role ?? "approved member"}</p>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {messages.isPending ? <Spinner /> : messages.isError ? (
                  <p className="py-8 text-center text-sm text-destructive">Could not load messages. Try again.</p>
                ) : (messages.data ?? []).length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <MessageSquare className="size-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Say hello</p>
                    <p className="mt-1 text-xs text-muted-foreground">Your messages and attachments stay private.</p>
                  </div>
                ) : (messages.data ?? []).map((message) => {
                  const mine = message.sender_id === userId;
                  const mediaUrl = mediaUrls[message.id];
                  const attachmentName = message.media_path?.split("/").at(-1)?.replace(/^[0-9a-f-]+-/i, "") || "Attachment";
                  return (
                    <div key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                      <div className={mine ? "max-w-[85%] rounded-lg bg-primary px-3.5 py-2.5 text-primary-foreground" : "max-w-[85%] rounded-lg border border-border bg-background px-3.5 py-2.5"}>
                        {message.content && <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>}
                        {message.media_path && mediaUrl && (
                          <div className={message.content ? "mt-2" : ""}>
                            {message.media_type?.startsWith("image/") ? (
                              <a href={mediaUrl} target="_blank" rel="noreferrer">
                                <img src={mediaUrl} alt={attachmentName} className="max-h-64 max-w-full rounded object-contain" />
                              </a>
                            ) : message.media_type?.startsWith("video/") ? (
                              <video src={mediaUrl} controls className="max-h-64 max-w-full rounded" />
                            ) : message.media_type?.startsWith("audio/") ? (
                              <audio src={mediaUrl} controls className="max-w-full" />
                            ) : (
                              <a href={mediaUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 rounded border border-current/20 px-2.5 py-2 text-sm underline-offset-2 hover:underline">
                                <FileText className="size-4 shrink-0" />
                                <span className="truncate">{attachmentName}</span>
                              </a>
                            )}
                          </div>
                        )}
                        {message.media_path && !mediaUrl && <p className="mt-1 text-xs opacity-70">Preparing attachment…</p>}
                        <p className={mine ? "mt-1.5 text-right text-[10px] opacity-70" : "mt-1.5 text-right text-[10px] text-muted-foreground"}>
                          {new Date(message.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <form
                className="border-t border-border p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage.mutate();
                }}
              >
                {attachment && (
                  <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Remove attachment" onClick={() => setAttachment(null)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (!file) return;
                      if (file.size > ATTACHMENT_LIMIT) {
                        toast.error("Choose a file smaller than 25 MB");
                        event.target.value = "";
                        return;
                      }
                      setAttachment(file);
                    }}
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label="Attach a file" title="Attach a file" onClick={() => fileInput.current?.click()}>
                    <Paperclip className="size-4" />
                  </Button>
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write a message…"
                    maxLength={10000}
                    aria-label="Write a message"
                  />
                  <Button type="submit" size="icon" aria-label="Send message" disabled={sendMessage.isPending || (!draft.trim() && !attachment)}>
                    {sendMessage.isPending ? <Spinner /> : <Send className="size-4" />}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <MessageSquare className="size-9 text-muted-foreground" />
              <p className="font-medium">Choose a conversation</p>
              <p className="max-w-xs text-sm text-muted-foreground">Select someone from your inbox or start a new private message.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}