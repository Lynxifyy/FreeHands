import { describe, expect, it } from "vitest";
import { getMobileboxViewerUrl } from "#/components/conversation-events/chat/event-message-components/generic-event-message-wrapper";
import type { OpenHandsEvent } from "#/types/agent-server/core";

function eventWith(value: unknown): OpenHandsEvent {
  return { id: "e1", kind: "ObservationEvent", value } as unknown as OpenHandsEvent;
}

describe("getMobileboxViewerUrl", () => {
  it("extracts a viewer URL from a Mobilebox tool result", () => {
    const url =
      "https://mobilebox.dev/watch#v1.ph_abc.prj_xyz.123.token-abc";
    expect(
      getMobileboxViewerUrl(eventWith({ observation: { content: { viewer_url: url } } })),
    ).toBe(url);
  });

  it("returns null for an ordinary tool result", () => {
    expect(
      getMobileboxViewerUrl(eventWith({ observation: { content: "done" } })),
    ).toBeNull();
  });
});
