"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, MessageSquare, ArrowLeft } from "lucide-react";
import { useRealtimeConnection } from "@/features/realtime";
import { uploadMessageFile } from "../api/message-files-gateway";
import { conversationTitle } from "../lib/discuss-types";
import { ChatAvatar } from "./chat-avatar";
import styles from "./discuss.module.css";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "../api/discuss-gateway";
import { DiscussRequestError } from "../api/discuss-gateway";
import { discussKeys, useDiscussMutations } from "../api/discuss-queries";
import { ConversationFilters } from "./conversation-filters";
import { ConversationList } from "./conversation-list";
import { ConversationMembersDialog } from "./conversation-members-dialog";
import { CreateChannelDialog } from "./create-channel-dialog";
import { MessageComposer } from "./message-composer";
import { MessageThread } from "./message-thread";
import { NewConversationDialog } from "./new-conversation-dialog";
import type { ConversationType, Message } from "../lib/discuss-types";

export interface DiscussManagerProps {
  kind: "dm" | "channel";
  access: CurrentAccess;
  initialConversationId: string | null;
}

const KIND_LABEL = { dm: "conversation", channel: "channel" } as const;
const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function DiscussManager({
  kind,
  access,
  initialConversationId,
}: DiscussManagerProps) {
  const client = useQueryClient();
  const keys = discussKeys(access, kind);
  const mutations = useDiscussMutations(access, kind);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversationId,
  );
  const [startOpen, setStartOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const layout = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = layout.current;
    if (!element) return;
    const fit = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      const shell = element.closest<HTMLElement>(".shell-workspace");
      const bottomInset = shell
        ? Number.parseFloat(getComputedStyle(shell).paddingBottom) || 0
        : 0;
      element.style.setProperty(
        "--chat-available-height",
        `${Math.max(256, height - Math.max(0, element.getBoundingClientRect().top) - bottomInset - 16)}px`,
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, []);
  const readCursor = useRef("");
  const reconcile = useCallback(() => {
    void client.invalidateQueries({
      queryKey: ["discuss", kind, access.userId],
    });
  }, [client, kind, access.userId]);
  const connection = useRealtimeConnection(undefined, (event, envelope) => {
    if (
      event === "discuss.invalidated" &&
      typeof envelope === "object" &&
      envelope !== null &&
      "version" in envelope &&
      envelope.version === 1
    )
      reconcile();
  });
  useEffect(() => {
    if (connection.state.status === "connected") reconcile();
  }, [connection.state.status, reconcile]);

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const type: readonly ConversationType[] =
    kind === "dm" ? ["DIRECT", "GROUP"] : ["CHANNEL"];
  const listParams = {
    type,
    search: debouncedSearch.trim(),
    pageSize: 25,
  };

  const listQuery = useInfiniteQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal, pageParam }) =>
      gateway.listConversations({ ...listParams, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.reduce((count, page) => count + page.items.length, 0) <
        last.total && last.items.length
        ? last.page + 1
        : undefined,
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: keys.messages(selectedId ?? "", {}),
    queryFn: ({ signal, pageParam }) =>
      gateway.listMessages(selectedId!, { page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: selectedId !== null,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof DiscussRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  function selectConversation(id: string | null) {
    setSelectedId(id);
    setReplyTarget(null);
    readCursor.current = "";
  }

  const conversations = listQuery.data
    ? [
        ...new Map(
          listQuery.data.pages
            .flatMap((page) => page.items)
            .map((c) => [c.id, c]),
        ).values(),
      ]
    : null;
  const selectedQuery = useQuery({
    queryKey: [...keys.all, "detail", selectedId],
    queryFn: ({ signal }) => gateway.getConversation(selectedId!, signal),
    enabled: selectedId !== null,
    retry: false,
  });
  const selected =
    conversations?.find((c) => c.id === selectedId) ??
    (selectedQuery.data?.id === selectedId ? selectedQuery.data : null);
  const messages = messagesQuery.data
    ? [
        ...new Map(
          messagesQuery.data.pages
            .flatMap((page) => page.items)
            .map((message) => [message.id, message]),
        ).values(),
      ]
    : null;
  const markRead = useCallback(
    (messageId: string) => {
      if (!selectedId || readCursor.current === `${selectedId}:${messageId}`)
        return;
      readCursor.current = `${selectedId}:${messageId}`;
      void gateway.updateReadCursor(selectedId, messageId).then((result) => {
        if (result.status === "success") reconcile();
        else readCursor.current = "";
      });
    },
    [selectedId, reconcile],
  );

  return (
    <div ref={layout} className={styles.layout}>
      <aside
        className={styles.sidebar}
        data-selected={Boolean(selectedId)}
        aria-label={kind === "dm" ? "Conversation sidebar" : "Channel sidebar"}
      >
        <div className={styles.sidebarHeader}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {kind === "dm" ? "Messages" : "Channels"}
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Your people. Your conversations.
              </p>
            </div>
            <Button
              type="button"
              onClick={() =>
                kind === "dm" ? setStartOpen(true) : setCreateChannelOpen(true)
              }
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              {kind === "dm" ? "New conversation" : "New channel"}
            </Button>
          </div>
          <div className="mt-4">
            <ConversationFilters
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
              }}
            />
          </div>
        </div>

        <p aria-live="polite" role="status" className="sr-only">
          {announcement}
        </p>

        <div className={styles.list}>
          {listQuery.isError ? (
            <div role="alert" className="space-y-2">
              <p>{(listQuery.error as Error).message}</p>
              <Button
                variant="outline"
                onClick={() => void listQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <ConversationList
              conversations={listQuery.isPending ? null : conversations}
              viewerId={access.userId}
              selectedId={selectedId}
              kind={kind}
              onSelect={selectConversation}
              searching={Boolean(debouncedSearch.trim())}
            />
          )}
          {listQuery.hasNextPage ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={listQuery.isFetching}
              onClick={() => void listQuery.fetchNextPage()}
            >
              Load more conversations
            </Button>
          ) : null}
        </div>
      </aside>

      <section
        className={styles.conversation}
        data-selected={Boolean(selectedId)}
        aria-label="Active conversation"
      >
        {selected ? (
          <>
            <div className={styles.header}>
              <Button
                type="button"
                variant="ghost"
                className="sm:hidden"
                onClick={() => selectConversation(null)}
              >
                <ArrowLeft aria-hidden="true" />
                <span className="sr-only">Back</span>
              </Button>
              <ChatAvatar
                name={conversationTitle(selected, access.userId)}
                kind={selected.type}
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold">
                  {conversationTitle(selected, access.userId)}
                </h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  {selected.type === "DIRECT"
                    ? "Direct message"
                    : `${selected.members.length} members`}
                  {connection.state.status !== "connected"
                    ? " · Reconnecting to live updates"
                    : ""}
                </p>
              </div>
              {selected.type !== "DIRECT" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMembersOpen(true)}
                >
                  Members ({selected.members.length})
                </Button>
              ) : null}
            </div>

            <MessageThread
              conversation={selected}
              messages={messagesQuery.isPending ? null : messages}
              error={
                messagesQuery.isError
                  ? "We could not load the messages. Try again."
                  : null
              }
              viewerId={access.userId}
              onRetry={() => void messagesQuery.refetch()}
              onEdit={(messageId, content) =>
                mutations.editMessage.mutateAsync({
                  conversationId: selected.id,
                  messageId,
                  content,
                })
              }
              onDelete={(messageId) =>
                mutations.deleteMessage.mutateAsync({
                  conversationId: selected.id,
                  messageId,
                })
              }
              onTogglePin={(messageId, pinned) =>
                mutations.setPin.mutateAsync({
                  conversationId: selected.id,
                  messageId,
                  pinned,
                })
              }
              onReply={setReplyTarget}
              attachmentScope={keys.all}
              onReadLatest={markRead}
              hasOlder={messagesQuery.hasNextPage}
              loadingOlder={messagesQuery.isFetchingNextPage}
              onLoadOlder={() => void messagesQuery.fetchNextPage()}
            />

            <MessageComposer
              key={selected.id}
              replyTarget={replyTarget}
              onCancelReply={() => setReplyTarget(null)}
              onUpload={(messageId, file) =>
                uploadMessageFile(selected.id, messageId, file)
              }
              onAttachmentsSent={reconcile}
              onSend={async (values) => {
                const outcome = await mutations.sendMessage.mutateAsync({
                  conversationId: selected.id,
                  values,
                });
                if (outcome.status === "success") {
                  setAnnouncement("Message sent.");
                  setReplyTarget(null);
                }
                return outcome;
              }}
            />
          </>
        ) : selectedId && selectedQuery.isPending ? (
          <div className={styles.empty} role="status">
            Loading conversation…
          </div>
        ) : selectedId && selectedQuery.isError ? (
          <div className={styles.empty}>
            <div role="alert" className="space-y-3">
              <p>{selectedQuery.error.message}</p>
              <Button
                variant="outline"
                onClick={() => void selectedQuery.refetch()}
              >
                Try again
              </Button>
              <Button variant="ghost" onClick={() => selectConversation(null)}>
                Back to conversations
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.empty}>
            <div>
              <MessageSquare
                aria-hidden="true"
                className="text-primary mx-auto mb-4 size-10"
              />
              <h2 className="text-foreground mb-2 font-semibold">
                A little conversation goes a long way
              </h2>
              <p className="text-sm">
                Select a {KIND_LABEL[kind]} to view messages.
              </p>
              {selectedId ? (
                <Button
                  variant="ghost"
                  onClick={() => selectConversation(null)}
                >
                  Back to conversations
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <NewConversationDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        listAssignablePeople={gateway.listAssignablePeople}
        onStart={mutations.startConversation.mutateAsync}
        onStarted={(conversation) => {
          selectConversation(conversation.id);
          setAnnouncement("Conversation started.");
        }}
      />

      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
        listChannelOwners={gateway.listChannelOwners}
        onCreate={mutations.createChannel.mutateAsync}
        onCreated={(conversation) => {
          selectConversation(conversation.id);
          setAnnouncement("Channel created.");
        }}
      />

      {selected && selected.type !== "DIRECT" ? (
        <ConversationMembersDialog
          key={selected.id}
          open={membersOpen}
          onOpenChange={setMembersOpen}
          conversation={selected}
          listAssignablePeople={gateway.listAssignablePeople}
          onAddMember={(conversationId, userId) =>
            mutations.addMember.mutateAsync({ conversationId, userId })
          }
          onRemoveMember={(conversationId, userId) =>
            mutations.removeMember.mutateAsync({ conversationId, userId })
          }
          onUpdateChannel={(values) =>
            mutations.updateChannel.mutateAsync({
              conversationId: selected.id,
              values,
            })
          }
          onChanged={() => void listQuery.refetch()}
        />
      ) : null}
    </div>
  );
}
