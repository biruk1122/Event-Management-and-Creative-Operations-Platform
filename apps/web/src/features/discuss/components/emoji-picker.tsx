"use client";
import { useRef, useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const EMOJIS = [
  ["😀", "smile happy"],
  ["😊", "blush happy"],
  ["😂", "laugh joy"],
  ["❤️", "heart love"],
  ["👍", "thumbs up yes"],
  ["👎", "thumbs down no"],
  ["🎉", "party celebrate"],
  ["🙌", "hooray hands"],
  ["🔥", "fire amazing"],
  ["👏", "clap applause"],
  ["🙏", "thanks pray"],
  ["✅", "done check"],
  ["👋", "hello wave"],
  ["👀", "eyes look"],
  ["💡", "idea light"],
  ["🚀", "rocket launch"],
  ["😍", "heart eyes"],
  ["🤔", "think question"],
  ["😢", "sad cry"],
  ["😮", "surprise wow"],
  ["💪", "strong muscle"],
  ["✨", "sparkles"],
  ["📅", "calendar event"],
  ["🎨", "art design"],
  ["📎", "attachment clip"],
  ["💯", "hundred perfect"],
  ["🤝", "handshake agreement"],
  ["🎯", "target goal"],
];
export function EmojiPicker({
  onSelect,
  disabled,
}: {
  onSelect: (emoji: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = useRef(false);
  const filtered = EMOJIS.filter(([, name]) =>
    name!.includes(search.toLowerCase()),
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Choose emoji"
          disabled={disabled}
        >
          <Smile aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={(event) => {
          if (selected.current) {
            event.preventDefault();
            selected.current = false;
          }
        }}
      >
        <p className="mb-3 text-sm font-semibold">Add a little expression</p>
        <Input
          aria-label="Search emojis"
          placeholder="Search emojis…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-3 grid grid-cols-7 gap-1">
          {filtered.map(([emoji, name]) => (
            <button
              type="button"
              key={emoji}
              aria-label={name}
              className="hover:bg-accent focus-visible:ring-ring rounded-lg p-1.5 text-xl focus-visible:ring-2"
              onClick={() => {
                selected.current = true;
                onSelect(emoji!);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
        {!filtered.length && (
          <p className="text-muted-foreground mt-3 text-sm">No emojis found.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
