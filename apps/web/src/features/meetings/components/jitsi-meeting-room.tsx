"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JitsiSession } from "../api/jitsi-gateway";

/** The subset of the real `JitsiMeetExternalAPI` surface this component
 * actually uses - kept narrow and local rather than depending on Jitsi's own
 * (unofficial, unpublished) type definitions. */
export interface JitsiMeetApi {
  addEventListener(event: string, listener: () => void): void;
  executeCommand(command: string): void;
  dispose(): void;
}

export type JitsiExternalApiConstructor = new (
  domain: string,
  options: {
    roomName: string;
    parentNode: HTMLElement;
    jwt?: string;
    userInfo: { displayName: string };
    configOverwrite: Record<string, unknown>;
    interfaceConfigOverwrite: Record<string, unknown>;
  },
) => JitsiMeetApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiExternalApiConstructor;
  }
}

/** Loads the self-hosted deployment's own IFrame API script exactly once per
 * domain and caches the in-flight/resolved promise at module scope, so
 * repeated mounts (e.g. switching between meetings) never re-fetch it. */
const scriptPromises = new Map<string, Promise<JitsiExternalApiConstructor>>();

function loadExternalApiScript(
  domain: string,
): Promise<JitsiExternalApiConstructor> {
  const cached = scriptPromises.get(domain);
  if (cached) return cached;
  const promise = new Promise<JitsiExternalApiConstructor>(
    (resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://${domain}/external_api.js`;
      script.async = true;
      script.onload = () => {
        if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI);
        else reject(new Error("Jitsi external API script did not load"));
      };
      script.onerror = () =>
        reject(new Error("Could not load the Jitsi meeting script"));
      document.head.append(script);
    },
  );
  scriptPromises.set(domain, promise);
  return promise;
}

type RoomState = "loading-script" | "connecting" | "ready" | "error";

export function JitsiMeetingRoom({
  session,
  meetingTitle,
  onLeave,
  canEndForEveryone,
  onEndForEveryone,
  endingForEveryone = false,
  loadExternalApi = loadExternalApiScript,
}: {
  session: JitsiSession;
  meetingTitle: string;
  onLeave: () => void;
  canEndForEveryone: boolean;
  onEndForEveryone: () => void;
  endingForEveryone?: boolean;
  loadExternalApi?: (domain: string) => Promise<JitsiExternalApiConstructor>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetApi | null>(null);
  const [state, setState] = useState<RoomState>("loading-script");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(
    () => typeof document !== "undefined" && !document.fullscreenEnabled,
  );

  // The browser already exits fullscreen on Escape on its own; this just
  // keeps our own control's icon/label in sync with that (and with any
  // other way fullscreen state can change, e.g. the OS taskbar).
  useEffect(() => {
    function handleChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  async function toggleFullscreen() {
    if (!stageRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current.requestFullscreen();
    } catch {
      // A permissions-policy or user-gesture restriction can still reject
      // the request even when `fullscreenEnabled` reported true upfront -
      // hide the control rather than leave a button that silently does
      // nothing.
      setFullscreenUnavailable(true);
    }
  }

  // Latest callbacks are read through refs rather than listed as effect
  // dependencies - the effect below must only re-run when the room's own
  // identity changes, never on every parent re-render (which would tear
  // down and rebuild the live room on every unrelated state change).
  const onLeaveRef = useRef(onLeave);
  useEffect(() => {
    onLeaveRef.current = onLeave;
  }, [onLeave]);
  const loadExternalApiRef = useRef(loadExternalApi);
  useEffect(() => {
    loadExternalApiRef.current = loadExternalApi;
  }, [loadExternalApi]);

  useEffect(() => {
    let cancelled = false;
    loadExternalApiRef
      .current(session.domain)
      .then((Api) => {
        if (cancelled || !containerRef.current) return;
        setState("connecting");
        const api = new Api(session.domain, {
          roomName: session.roomName,
          parentNode: containerRef.current,
          ...(session.jwt ? { jwt: session.jwt } : {}),
          userInfo: { displayName: session.displayName },
          configOverwrite: {
            startWithVideoMuted: true,
            prejoinPageEnabled: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            // "fullscreen" is deliberately omitted - it would fullscreen
            // only Jitsi's own iframe, bypassing our header/leave/end
            // controls. Our own control above fullscreens the whole stage
            // instead, so those stay reachable per the requirement that
            // meeting controls remain accessible in full-screen mode.
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "desktop",
              "hangup",
              "tileview",
              "chat",
              "raisehand",
            ],
          },
        });
        apiRef.current = api;
        api.addEventListener("videoConferenceJoined", () => {
          if (!cancelled) setState("ready");
        });
        api.addEventListener("videoConferenceLeft", () => onLeaveRef.current());
        api.addEventListener("readyToClose", () => onLeaveRef.current());
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      // Always dispose, even if the script/API never finished loading - this
      // is the one line that prevents duplicate instances/memory leaks on
      // every remount (including React Strict Mode's dev double-invoke).
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [session.domain, session.roomName, session.jwt, session.displayName]);

  function leave() {
    apiRef.current?.executeCommand("hangup");
    onLeave();
  }

  // Renders inline, inside whatever space the caller gives it (the active
  // meeting panel) - joining a meeting must not itself take over the whole
  // screen. The Fullscreen API toggle below is how a user opts into a
  // full-viewport view; the browser's own fullscreen layout (not any
  // `fixed`/`z-50` styling of ours) handles expanding this element to fill
  // the screen once requested.
  return (
    <div
      ref={stageRef}
      data-jitsi-room
      className="bg-background flex h-[70vh] flex-col overflow-hidden rounded-lg border"
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="min-w-0 truncate text-base font-semibold">
          {meetingTitle}
        </h2>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!fullscreenUnavailable ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void toggleFullscreen()}
              aria-label={
                isFullscreen ? "Exit full screen" : "Enter full screen"
              }
            >
              {isFullscreen ? (
                <Minimize2 aria-hidden="true" />
              ) : (
                <Maximize2 aria-hidden="true" />
              )}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={leave}>
            Leave meeting
          </Button>
          {canEndForEveryone ? (
            <Button
              type="button"
              variant="destructive"
              disabled={endingForEveryone}
              aria-busy={endingForEveryone}
              onClick={onEndForEveryone}
            >
              {endingForEveryone ? "Ending…" : "End meeting for everyone"}
            </Button>
          ) : null}
        </div>
      </header>
      {state === "loading-script" || state === "connecting" ? (
        <p role="status" className="text-muted-foreground px-4 py-2 text-sm">
          {state === "loading-script"
            ? "Loading the meeting room…"
            : "Connecting…"}
        </p>
      ) : null}
      {state === "error" ? (
        <p role="alert" className="text-destructive px-4 py-2 text-sm">
          Could not connect to the meeting room. Try again.
        </p>
      ) : null}
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
