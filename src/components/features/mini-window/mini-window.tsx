import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripHorizontal,
  X,
} from "lucide-react";
import { useBackendScopedPath } from "#/hooks/use-backend-scoped-path";
import {
  useMiniWindowStore,
  type MiniWindowEntry,
} from "#/stores/mini-window-store";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

interface MiniWindowFrameProps {
  entry: MiniWindowEntry;
  zIndex: number;
}

/**
 * A floating, read-only preview of another conversation. The iframe is
 * pointer-transparent so the user cannot type into or click through the live
 * chat; wheel scrolling is forwarded to the scrollable element inside the
 * frame so a running conversation can still be watched.
 */
function MiniWindowFrame({ entry, zIndex }: MiniWindowFrameProps) {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const backendScopedPath = useBackendScopedPath();
  const close = useMiniWindowStore((state) => state.close);
  const toggleCollapsed = useMiniWindowStore((state) => state.toggleCollapsed);
  const move = useMiniWindowStore((state) => state.move);
  const resize = useMiniWindowStore((state) => state.resize);
  const bringToFront = useMiniWindowStore((state) => state.bringToFront);

  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const dragState = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeState = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);

  const path = backendScopedPath(`/conversations/${entry.conversationId}`);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: entry.x,
      originY: entry.y,
    };
    bringToFront(entry.conversationId);
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (state?.pointerId !== event.pointerId) return;
    const maxX = Math.max(0, window.innerWidth - 80);
    const maxY = Math.max(0, window.innerHeight - 60);
    move(
      entry.conversationId,
      Math.min(Math.max(0, state.originX + event.clientX - state.startX), maxX),
      Math.min(Math.max(0, state.originY + event.clientY - state.startY), maxY),
    );
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: entry.width,
      originHeight: entry.height,
    };
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = resizeState.current;
    if (state?.pointerId !== event.pointerId) return;
    resize(
      entry.conversationId,
      Math.min(
        state.originWidth + event.clientX - state.startX,
        window.innerWidth - entry.x - 8,
      ),
      Math.min(
        state.originHeight + event.clientY - state.startY,
        window.innerHeight - entry.y - 8,
      ),
    );
  };

  const handleResizeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeState.current?.pointerId !== event.pointerId) return;
    resizeState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    const frameDocument = frameWindow.document;
    const target = frameDocument.elementFromPoint(
      entry.width / 2,
      entry.height / 2,
    );
    let node: HTMLElement | null =
      target instanceof HTMLElement ? target : null;
    while (node) {
      if (node.scrollHeight > node.clientHeight + 2) {
        node.scrollTop += event.deltaY;
        return;
      }
      node = node.parentElement;
    }
    frameWindow.scrollBy(0, event.deltaY);
  };

  const openFullChat = () => {
    navigate(path);
    close(entry.conversationId);
  };

  return (
    <div
      role="dialog"
      aria-label={`${t(I18nKey.MINI_WINDOW$TITLE)}: ${entry.title}`}
      data-testid="mini-window"
      data-conversation-id={entry.conversationId}
      className={cn(
        "pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl border border-white/15",
        "bg-base-secondary/95 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl",
      )}
      style={{
        left: entry.x,
        top: entry.y,
        width: entry.width,
        height: entry.collapsed ? 44 : entry.height,
        zIndex,
      }}
      onPointerDown={() => bringToFront(entry.conversationId)}
    >
      <div
        data-testid="mini-window-drag-handle"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        className="flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-white/10 bg-[linear-gradient(90deg,rgba(59,130,246,0.22),rgba(168,85,247,0.2),rgba(236,72,153,0.16))] px-2.5 active:cursor-grabbing"
      >
        <GripHorizontal className="h-4 w-4 shrink-0 text-white/50" />
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold text-contrast"
          title={entry.title}
        >
          {entry.title || t(I18nKey.MINI_WINDOW$TITLE)}
        </span>
        <span className="hidden shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/70 sm:inline">
          {t(I18nKey.MINI_WINDOW$READ_ONLY)}
        </span>
        <button
          type="button"
          onClick={openFullChat}
          aria-label={t(I18nKey.MINI_WINDOW$OPEN_FULL)}
          title={t(I18nKey.MINI_WINDOW$OPEN_FULL)}
          className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggleCollapsed(entry.conversationId)}
          aria-label={t(
            entry.collapsed
              ? I18nKey.MINI_WINDOW$EXPAND
              : I18nKey.MINI_WINDOW$COLLAPSE,
          )}
          className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {entry.collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => close(entry.conversationId)}
          aria-label={t(I18nKey.MINI_WINDOW$CLOSE)}
          className="rounded-md p-1 text-white/70 transition-colors hover:bg-danger/25 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!entry.collapsed ? (
        <div className="relative min-h-0 flex-1" onWheel={handleWheel}>
          <iframe
            ref={iframeRef}
            src={path}
            title={entry.title}
            tabIndex={-1}
            className="pointer-events-none h-full w-full border-0 bg-canvas-base"
          />
          <div
            data-testid="mini-window-resize-handle"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
            style={{
              background:
                "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.35) 50%)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function MiniWindowHost() {
  const windows = useMiniWindowStore((state) => state.windows);
  if (windows.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] hidden md:block">
      {windows.map((entry, index) => (
        <MiniWindowFrame
          key={entry.conversationId}
          entry={entry}
          zIndex={9998 + index}
        />
      ))}
    </div>
  );
}
