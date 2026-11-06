/**
 * Language identification for the `code_critique` tool. Extension first, then
 * a small content sniff so a snippet without a path (or with a generic `.txt`)
 * still gets the right analyzers.
 */

const EXTENSION_LANGUAGES: Record<string, string> = {
  html: "html",
  htm: "html",
  svg: "xml",
  xml: "xml",
  kt: "kotlin",
  kts: "kotlin",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  css: "css",
  scss: "css",
  json: "json",
  md: "markdown",
  java: "java",
};

function getExtension(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

function sniff(content: string): string {
  if (
    /xmlns:android|^<\?xml|\bres\/(layout|values)\b/.test(content) ||
    /^\s*<[A-Za-z]/.test(content)
  ) {
    return "xml";
  }
  if (
    /@Composable|setContent\s*\{|^import\s+androidx\.compose\./m.test(content)
  ) {
    return "kotlin";
  }
  return "text";
}

export function detectLanguage(path: string, content = ""): string {
  const fromExtension = EXTENSION_LANGUAGES[getExtension(path)];
  if (fromExtension) return fromExtension;
  if (content.trim().length > 0) return sniff(content);
  return "text";
}
