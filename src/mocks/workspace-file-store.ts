/** Session-persistent demo workspace shared by mock listing, preview and editing. */
const initialFiles: Record<string, string> = {
  "README.md":
    "# Demo workspace\n\nOpen a file and choose Edit to make changes.\n",
  "src/app.ts":
    "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n",
  "src/styles.css": "body {\n  font-family: system-ui, sans-serif;\n}\n",
  "index.html":
    "<!doctype html>\n<html><body><h1>FreeHands workspace</h1></body></html>\n",
};
const STORAGE_KEY = "agent-canvas:mock-workspace-files";
function loadFiles(): Map<string, string> {
  try {
    const entries: unknown = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    if (Array.isArray(entries)) {
      return new Map(
        entries.filter(
          (entry): entry is [string, string] =>
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === "string" &&
            typeof entry[1] === "string",
        ),
      );
    }
  } catch {
    /* Storage is optional in the demo. */
  }
  return new Map();
}
const files =
  typeof sessionStorage === "undefined"
    ? new Map<string, string>()
    : loadFiles();
function persistFiles() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...files]));
  } catch {
    /* Quota/private mode must not break editing. */
  }
}
const key = (conversationId: string, path: string) =>
  `${conversationId}\0${path}`;
const relative = (path: string) =>
  path
    .replace(/^\/workspace\/project\/[^/]+\//, "")
    .replace(/^\/workspace\/project\//, "");
export function mockWorkspaceOwner(path: string): string {
  return /^\/workspace\/project\/([^/]+)\//.exec(path)?.[1] ?? "mock";
}
export function readMockWorkspaceFile(conversationId: string, path: string) {
  return (
    files.get(key(conversationId, relative(path))) ??
    files.get(key("mock", relative(path))) ??
    initialFiles[relative(path)]
  );
}
export function writeMockWorkspaceFile(
  conversationId: string,
  path: string,
  text: string,
) {
  files.set(key(conversationId, relative(path)), text);
  persistFiles();
}
export function listMockWorkspaceFiles(conversationId: string) {
  const paths = new Set(Object.keys(initialFiles));
  for (const entry of files.keys()) {
    const [owner, path] = entry.split("\0");
    if (owner === conversationId) paths.add(path);
  }
  return [...paths].sort();
}
export function resetMockWorkspaceFiles() {
  files.clear();
  persistFiles();
}
