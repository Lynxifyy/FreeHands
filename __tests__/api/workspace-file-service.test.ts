import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadTextFile: vi.fn(),
  uploadTextFile: vi.fn(),
  close: vi.fn(),
  getHome: vi.fn(),
  readCloudFile: vi.fn(),
  isCloud: false,
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  FileClient: class {
    downloadTextFile = mocks.downloadTextFile;
    uploadTextFile = mocks.uploadTextFile;
    getHome = mocks.getHome;
    close = mocks.close;
  },
}));
vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: () => ({
    backend: { kind: mocks.isCloud ? "cloud" : "local" },
  }),
  getEffectiveLocalBackend: () => ({
    id: "local",
    host: "http://localhost:8000",
    apiKey: "key",
  }),
}));
vi.mock("#/api/cloud/conversation-service.api", () => ({
  readCloudConversationFile: mocks.readCloudFile,
}));

import {
  resolveWorkspaceFilePath,
  saveWorkspaceFile,
  WorkspaceFileConflictError,
} from "#/api/workspace-file-service";
import { clearAgentServerHomeDirCache } from "#/api/agent-server-home";

const conversation = {
  id: "conversation-1",
  conversation_url: "http://localhost:8000/api/conversations/conversation-1",
  session_api_key: "session-key",
  workspace: { working_dir: "workspace/project/demo" },
};

describe("workspace file service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearAgentServerHomeDirCache();
    mocks.isCloud = false;
    mocks.getHome.mockResolvedValue({ home: "/home/agent" });
    mocks.downloadTextFile.mockResolvedValue("original");
  });

  it.each([
    "../secret",
    "/etc/passwd",
    "src/../../secret",
    "C:\\secret",
    "src\\..\\secret",
    "",
    ".",
  ])("rejects a path outside the workspace: %s", async (path) => {
    await expect(
      saveWorkspaceFile(conversation, path, "original", "changed"),
    ).rejects.toThrow();
    expect(mocks.uploadTextFile).not.toHaveBeenCalled();
  });

  it("saves through the typed file client at the resolved workspace path", async () => {
    await saveWorkspaceFile(
      conversation,
      "./src/app.ts",
      "original",
      "changed\n",
    );

    expect(mocks.downloadTextFile).toHaveBeenCalledWith(
      "/home/agent/workspace/project/demo/src/app.ts",
    );
    expect(mocks.uploadTextFile).toHaveBeenCalledWith(
      "changed\n",
      "/home/agent/workspace/project/demo/src/app.ts",
      "app.ts",
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("preserves the editor draft when an agent changed the file since it was opened", async () => {
    mocks.downloadTextFile.mockResolvedValue("agent change");

    await expect(
      saveWorkspaceFile(conversation, "app.ts", "original", "my draft"),
    ).rejects.toMatchObject({
      name: "WorkspaceFileConflictError",
      remoteText: "agent change",
    });
    expect(mocks.uploadTextFile).not.toHaveBeenCalled();
  });

  it("uses the cloud file transport for the conflict check and the conversation runtime for saving", async () => {
    mocks.isCloud = true;
    mocks.readCloudFile.mockResolvedValue("original");

    await saveWorkspaceFile(conversation, "app.ts", "original", "cloud change");

    expect(mocks.readCloudFile).toHaveBeenCalledWith(
      "conversation-1",
      "/home/agent/workspace/project/demo/app.ts",
    );
    expect(mocks.uploadTextFile).toHaveBeenCalledWith(
      "cloud change",
      "/home/agent/workspace/project/demo/app.ts",
      "app.ts",
    );
    expect(mocks.downloadTextFile).not.toHaveBeenCalled();
  });

  it("closes the client and keeps the draft recoverable when saving fails", async () => {
    mocks.uploadTextFile.mockRejectedValue(new Error("offline"));

    await expect(
      saveWorkspaceFile(conversation, "app.ts", "original", "draft"),
    ).rejects.toThrow("offline");
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(WorkspaceFileConflictError).toBeDefined();
  });

  it("rejects binary replacement before touching the server", async () => {
    await expect(
      saveWorkspaceFile(conversation, "app.ts", "original", "bad\0content"),
    ).rejects.toThrow();
    expect(mocks.downloadTextFile).not.toHaveBeenCalled();
  });

  it("resolves an absolute workspace without asking for a home directory", async () => {
    await expect(
      resolveWorkspaceFilePath(
        { ...conversation, workspace: { working_dir: "/projects/demo" } },
        "src/a.ts",
      ),
    ).resolves.toBe("/projects/demo/src/a.ts");
    expect(mocks.getHome).not.toHaveBeenCalled();
  });
});
