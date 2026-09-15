"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

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

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const type: readonly ConversationType[] =
    kind === "dm" ? ["DIRECT", "GROUP"] : ["CHANNEL"];
  const listParams = { type, search: debouncedSearch.trim() };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => gateway.listConversations(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const messagesQuery = useQuery({
    queryKey: keys.messages(selectedId ?? "", {}),
    queryFn: ({ signal }) => gateway.listMessages(selectedId!, {}, signal),
    enabled: selectedId !== null,
    retry: false,
    refetchOnWindowFocus: true,
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
  }

  const conversations = listQuery.data?.items ?? null;
  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  const messages = messagesQuery.data?.items ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ConversationFilters search={search} onSearchChange={setSearch} />
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

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[18rem_1fr]">
        <div className={selectedId ? "hidden sm:block" : ""}>
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
            />
          )}
        </div>

        <div className={selectedId ? "" : "hidden sm:block"}>
          {selected ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center justify-between gap-2 border-b pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:hidden"
                  onClick={() => selectConversation(null)}
                >
                  Back
                </Button>
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
              />

              <MessageComposer
                key={selected.id}
                replyTarget={replyTarget}
                onCancelReply={() => setReplyTarget(null)}
                onSend={async (values) => {
                  const outcome = await mutations.sendMessage.mutateAsync({
                    conversationId: selected.id,
                    values,
                  });
                  if (outcome.status === "success") {
                    void mutations.updateReadCursor.mutateAsync({
                      conversationId: selected.id,
                      messageId: outcome.message.id,
                    });
                    setAnnouncement("Message sent.");
                    setReplyTarget(null);
                  }
                  return outcome;
                }}
              />
            </div>
          ) : (
            <div className="text-muted-foreground flex h-full min-h-32 items-center justify-center rounded-xl border border-dashed text-sm">
              Select a {KIND_LABEL[kind]} to view messages.
            </div>
          )}
        </div>
      </div>

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
