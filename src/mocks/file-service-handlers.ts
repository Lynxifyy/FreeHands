import { delay, http, HttpResponse } from "msw";
import {
  mockWorkspaceOwner,
  listMockWorkspaceFiles,
  readMockWorkspaceFile,
  writeMockWorkspaceFile,
} from "./workspace-file-store";

export const FILE_VARIANTS_1 = ["file1.txt", "file2.txt", "file3.txt"];
export const FILE_VARIANTS_2 = [
  "reboot_skynet.exe",
  "target_list.txt",
  "terminator_blueprint.txt",
];

const MOCK_FILE_BROWSER_HOME = {
  home: "/home/openhands",
  favorites: [{ label: "Downloads", path: "/home/openhands/Downloads" }],
  locations: [],
};

const MOCK_SUBDIRECTORIES_BY_PATH: Record<
  string,
  { name: string; path: string }[]
> = {
  "/projects": [
    { name: "demo-app", path: "/projects/demo-app" },
    { name: "sample-tools", path: "/projects/sample-tools" },
    { name: "notes-service", path: "/projects/notes-service" },
  ],
  "/projects/demo-app": [
    {
      name: "web-client",
      path: "/projects/demo-app/web-client",
    },
    {
      name: "api-service",
      path: "/projects/demo-app/api-service",
    },
  ],
  "/projects/demo-app/web-client": [],
};

const shouldReturnProjectMock =
  typeof import.meta.env.MODE === "string" && import.meta.env.MODE !== "test";

export const FILE_SERVICE_HANDLERS = [
  http.all("*/api/bash/execute_bash_command", async ({ request }) => {
    const body = (await request.json()) as { command?: string; cwd?: string };
    const command = body.command ?? "";
    const output =
      shouldReturnProjectMock && command.startsWith("find ")
        ? listMockWorkspaceFiles(mockWorkspaceOwner(`${body.cwd ?? ""}/`)).join(
            "\n",
          )
        : "";
    return HttpResponse.json({
      command,
      exit_code: 0,
      stdout: output,
      stderr: "",
    });
  }),
  http.get("*/api/file/download", ({ request }) => {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    const text = readMockWorkspaceFile(mockWorkspaceOwner(path), path);
    return text === undefined
      ? HttpResponse.json({ error: "File not found" }, { status: 404 })
      : new HttpResponse(text, {
          headers: { "Content-Type": "application/octet-stream" },
        });
  }),
  http.post("*/api/file/upload", async ({ request }) => {
    const url = new URL(request.url);
    const destination = url.searchParams.get("path");
    if (!destination?.startsWith("/workspace/project/"))
      return HttpResponse.json(
        { error: "Invalid workspace path" },
        { status: 400 },
      );
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob))
      return HttpResponse.json({ error: "Missing file" }, { status: 400 });
    writeMockWorkspaceFile(
      mockWorkspaceOwner(destination),
      destination,
      await file.text(),
    );
    return HttpResponse.json({ success: true });
  }),
  http.get(
    "*/api/conversations/:conversationId/workspace/*",
    ({ params, request }) => {
      const prefix = `/api/conversations/${params.conversationId}/workspace/`;
      const path = decodeURIComponent(
        new URL(request.url).pathname.split(prefix)[1] ?? "",
      );
      const text = readMockWorkspaceFile(String(params.conversationId), path);
      return text === undefined
        ? HttpResponse.json({ error: "File not found" }, { status: 404 })
        : new HttpResponse(text, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
    },
  ),

  http.get("*/api/file/home", async () =>
    HttpResponse.json(MOCK_FILE_BROWSER_HOME),
  ),

  http.get("*/api/file/search_subdirs", async ({ request }) => {
    const url = new URL(request.url);
    const path = url.searchParams.get("path") ?? "";
    const items = shouldReturnProjectMock
      ? (MOCK_SUBDIRECTORIES_BY_PATH[path] ?? [])
      : [];

    return HttpResponse.json({
      path,
      items,
      subdirs: items,
      next_page_id: null,
    });
  }),

  http.get("*/api/file/:path", async ({ params }) =>
    HttpResponse.json({
      path: `/${params.path?.toString() ?? "home"}`,
      subdirs: [],
    }),
  ),

  http.get(
    "/api/conversations/:conversationId/list-files",
    async ({ params }) => {
      await delay();

      const cid = params.conversationId?.toString();
      if (!cid) return HttpResponse.json(null, { status: 400 });

      return cid === "test-conversation-id-2"
        ? HttpResponse.json(FILE_VARIANTS_2)
        : HttpResponse.json(FILE_VARIANTS_1);
    },
  ),

  http.get(
    "/api/conversations/:conversationId/select-file",
    async ({ request }) => {
      await delay();

      const url = new URL(request.url);
      const file = url.searchParams.get("file")?.toString();
      if (file) {
        return HttpResponse.json({ code: `Content of ${file}` });
      }

      return HttpResponse.json(null, { status: 404 });
    },
  ),
];
