"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { addMember as defaultAddMember } from "../api/add-member";
import { createChannel as defaultCreateChannel } from "../api/create-channel";
import { deleteMessage as defaultDeleteMessage } from "../api/delete-message";
import { editMessage as defaultEditMessage } from "../api/edit-message";
import { listAssignablePeople as defaultListAssignablePeople } from "../api/list-assignable-people";
import { listChannelOwners as defaultListChannelOwners } from "../api/list-channel-owners";
import { listConversations as defaultListConversations } from "../api/list-conversations";
import { listMessages as defaultListMessages } from "../api/list-messages";
import { removeMember as defaultRemoveMember } from "../api/remove-member";
import { sendMessage as defaultSendMessage } from "../api/send-message";
import { setPin as defaultSetPin } from "../api/set-pin";
import { startConversation as defaultStartConversation } from "../api/start-conversation";
import { updateChannel as defaultUpdateChannel } from "../api/update-channel";
import { updateReadCursor as defaultUpdateReadCursor } from "../api/update-read-cursor";
import { ConversationFilters } from "./conversation-filters";
import { ConversationList } from "./conversation-list";
import { ConversationMembersDialog } from "./conversation-members-dialog";
import { CreateChannelDialog } from "./create-channel-dialog";
import { MessageComposer } from "./message-composer";
import { MessageThread } from "./message-thread";
import { NewConversationDialog } from "./new-conversation-dialog";
import type {
  AddMember,
  CreateChannel,
  DeleteMessage,
  EditMessage,
  RemoveMember,
  SendMessage,
  SetPin,
  StartConversation,
  UpdateChannel,
  UpdateReadCursor,
} from "../lib/discuss-outcome";
import type {
  Conversation,
  ConversationType,
  Message,
} from "../lib/discuss-types";
import type { ListAssignablePeople } from "../api/list-assignable-people";
import type { ListChannelOwners } from "../api/list-channel-owners";
import type { ListConversations } from "../api/list-conversations";
import type { ListMessages } from "../api/list-messages";

export interface DiscussManagerProps {
  kind: "dm" | "channel";
  viewerId: string;
  initialConversationId: string | null;
  listConversations?: ListConversations;
  listMessages?: ListMessages;
  listAssignablePeople?: ListAssignablePeople;
  listChannelOwners?: ListChannelOwners;
  startConversation?: StartConversation;
  createChannel?: CreateChannel;
  updateChannel?: UpdateChannel;
  addMember?: AddMember;
  removeMember?: RemoveMember;
  sendMessage?: SendMessage;
  editMessage?: EditMessage;
  deleteMessage?: DeleteMessage;
  setPin?: SetPin;
  updateReadCursor?: UpdateReadCursor;
}

const KIND_LABEL = { dm: "conversation", channel: "channel" } as const;

export function DiscussManager({
  kind,
  viewerId,
  initialConversationId,
  listConversations = defaultListConversations,
  listMessages = defaultListMessages,
  listAssignablePeople = defaultListAssignablePeople,
  listChannelOwners = defaultListChannelOwners,
  startConversation = defaultStartConversation,
  createChannel = defaultCreateChannel,
  updateChannel = defaultUpdateChannel,
  addMember = defaultAddMember,
  removeMember = defaultRemoveMember,
  sendMessage = defaultSendMessage,
  editMessage = defaultEditMessage,
  deleteMessage = defaultDeleteMessage,
  setPin = defaultSetPin,
  updateReadCursor = defaultUpdateReadCursor,
}: DiscussManagerProps) {
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversationId,
  );
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [conversationsReloadToken, setConversationsReloadToken] = useState(0);
  const [messagesReloadToken, setMessagesReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const type: readonly ConversationType[] =
      kind === "dm" ? ["DIRECT", "GROUP"] : ["CHANNEL"];
    const trimmedSearch = search.trim();
    listConversations({
      type,
      ...(trimmedSearch ? { search: trimmedSearch } : {}),
    })
      .then((page) => {
        if (cancelled) return;
        setConversations(page.items);
        setListError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setListError("We could not load the list. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [listConversations, search, kind, conversationsReloadToken]);

  function selectConversation(id: string | null) {
    setSelectedId(id);
    setReplyTarget(null);
  }

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    listMessages(selectedId, {})
      .then((page) => {
        if (cancelled) return;
        setMessages(page.items);
        setThreadError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setMessages(null);
        setThreadError("We could not load the messages. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, listMessages, messagesReloadToken]);

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  function upsertConversation(next: Conversation) {
    setConversations((current) => {
      const list = current ?? [];
      const index = list.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...list];
      const copy = [...list];
      copy[index] = next;
      return copy;
    });
  }

  function upsertMessage(next: Message) {
    setMessages((current) => {
      const list = current ?? [];
      const index = list.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...list];
      const copy = [...list];
      copy[index] = next;
      return copy;
    });
  }

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
          {listError ? (
            <div role="alert" className="space-y-2">
              <p>{listError}</p>
              <Button
                variant="outline"
                onClick={() =>
                  setConversationsReloadToken((token) => token + 1)
                }
              >
                Try again
              </Button>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              viewerId={viewerId}
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
                messages={messages}
                error={threadError}
                viewerId={viewerId}
                onRetry={() => setMessagesReloadToken((token) => token + 1)}
                onEdit={async (messageId, content) => {
                  const outcome = await editMessage(
                    selected.id,
                    messageId,
                    content,
                  );
                  if (outcome.status === "success") {
                    upsertMessage(outcome.message);
                    setAnnouncement("Message updated.");
                  }
                  return outcome;
                }}
                onDelete={async (messageId) => {
                  const outcome = await deleteMessage(selected.id, messageId);
                  if (outcome.status === "success") {
                    upsertMessage(outcome.message);
                    setAnnouncement("Message deleted.");
                  }
                  return outcome;
                }}
                onTogglePin={async (messageId, pinned) => {
                  const outcome = await setPin(selected.id, messageId, pinned);
                  if (outcome.status === "success") {
                    upsertMessage(outcome.message);
                    setAnnouncement(
                      pinned ? "Message pinned." : "Message unpinned.",
                    );
                  }
                  return outcome;
                }}
                onReply={setReplyTarget}
              />

              <MessageComposer
                key={selected.id}
                replyTarget={replyTarget}
                onCancelReply={() => setReplyTarget(null)}
                onSend={async (values) => {
                  const outcome = await sendMessage(selected.id, values);
                  if (outcome.status === "success") {
                    upsertMessage(outcome.message);
                    void updateReadCursor(selected.id, outcome.message.id);
                    setAnnouncement("Message sent.");
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
        listAssignablePeople={listAssignablePeople}
        onStart={startConversation}
        onStarted={(conversation) => {
          upsertConversation(conversation);
          selectConversation(conversation.id);
          setAnnouncement("Conversation started.");
        }}
      />

      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
        listChannelOwners={listChannelOwners}
        onCreate={createChannel}
        onCreated={(conversation) => {
          upsertConversation(conversation);
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
          listAssignablePeople={listAssignablePeople}
          onAddMember={addMember}
          onRemoveMember={removeMember}
          onUpdateChannel={(values) => updateChannel(selected.id, values)}
          onChanged={upsertConversation}
        />
      ) : null}
    </div>
  );
}
