import { beforeEach, describe, expect, it } from "vitest";
import { MAX_MINI_WINDOWS, useMiniWindowStore } from "./mini-window-store";

const open = (id: string) =>
  useMiniWindowStore.getState().open({ conversationId: id, title: id });

describe("useMiniWindowStore", () => {
  beforeEach(() => {
    useMiniWindowStore.getState().closeAll();
  });

  it("keeps only the most recent windows when the limit is exceeded", () => {
    ["a", "b", "c", "d"].forEach(open);

    const ids = useMiniWindowStore
      .getState()
      .windows.map((w) => w.conversationId);
    expect(ids).toHaveLength(MAX_MINI_WINDOWS);
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("re-opening an existing window moves it to the front without duplicating it", () => {
    ["a", "b"].forEach(open);
    useMiniWindowStore.getState().toggleCollapsed("a");

    open("a");

    const windows = useMiniWindowStore.getState().windows;
    expect(windows.map((w) => w.conversationId)).toEqual(["b", "a"]);
    expect(windows.at(-1)?.collapsed).toBe(false);
  });

  it("clamps a dragged window inside the viewport", () => {
    open("a");

    useMiniWindowStore.getState().move("a", -50, -20);

    const [window] = useMiniWindowStore.getState().windows;
    expect(window.x).toBe(0);
    expect(window.y).toBe(0);
  });

  it("enforces a minimum size when resized", () => {
    open("a");

    useMiniWindowStore.getState().resize("a", 10, 10);

    const [window] = useMiniWindowStore.getState().windows;
    expect(window.width).toBe(300);
    expect(window.height).toBe(180);
  });

  it("closing one window leaves the others open", () => {
    ["a", "b"].forEach(open);

    useMiniWindowStore.getState().close("a");

    expect(
      useMiniWindowStore.getState().windows.map((w) => w.conversationId),
    ).toEqual(["b"]);
  });
});
