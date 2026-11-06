/**
 * Deterministic Jetpack Compose → HTML transformer for the UI Preview tab.
 *
 * Compose is a Kotlin DSL and cannot be executed in a browser, so this is an
 * approximate, structural preview: it parses the composable function bodies of
 * a Kotlin source file and maps the common layout containers and Material
 * widgets onto flexbox boxes. It shows hierarchy, orientation, spacing, and
 * text — enough to catch a broken layout before a device build.
 *
 * The parser is deliberately narrow (no generics, no expressions) and always
 * fails safe: a node it cannot model becomes a labelled placeholder and a
 * warning, never a silent omission. All text is HTML-escaped and the caller
 * renders the output in a sandboxed iframe.
 */

export interface ComposeTransformResult {
  html: string;
  warnings: string[];
}

const MAX_DEPTH = 24;

interface ComposeNode {
  name: string;
  args: string;
  children: ComposeNode[];
}

type ContainerDir = "row" | "column";

const CONTAINERS: Record<
  string,
  { dir: ContainerDir; runtimeItems?: boolean }
> = {
  Column: { dir: "column" },
  Row: { dir: "row" },
  Box: { dir: "column" },
  Surface: { dir: "column" },
  Card: { dir: "column" },
  ElevatedCard: { dir: "column" },
  OutlinedCard: { dir: "column" },
  Scaffold: { dir: "column" },
  ConstraintLayout: { dir: "column" },
  FlowRow: { dir: "row" },
  FlowColumn: { dir: "column" },
  LazyColumn: { dir: "column", runtimeItems: true },
  LazyRow: { dir: "row", runtimeItems: true },
  LazyVerticalGrid: { dir: "column", runtimeItems: true },
  LazyHorizontalGrid: { dir: "row", runtimeItems: true },
};

const BUTTONS = new Set([
  "Button",
  "OutlinedButton",
  "TextButton",
  "ElevatedButton",
  "FilledTonalButton",
  "FilledIconButton",
  "IconButton",
]);

const TEXT_FIELDS = new Set([
  "TextField",
  "OutlinedTextField",
  "BasicTextField",
]);

const PROGRESS = new Set([
  "CircularProgressIndicator",
  "LinearProgressIndicator",
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function skipString(src: string, start: number): number {
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"') return i + 1;
    i += 1;
  }
  return src.length;
}

/** Returns the index just past the matching `close` for the `open` at `start`. */
function skipBalanced(
  src: string,
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') {
      i = skipString(src, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return src.length;
}

/** Bodies of every `fun … { … }` declaration, or the whole source if none. */
function extractFunctionBodies(src: string): string {
  const bodies: string[] = [];
  const re = /\bfun\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    let i = match.index + 3;
    while (i < src.length && src[i] !== "{") {
      if (src[i] === '"') i = skipString(src, i);
      else if (src[i] === "(") i = skipBalanced(src, i, "(", ")");
      else i += 1;
    }
    if (i >= src.length) break;
    const end = skipBalanced(src, i, "{", "}");
    bodies.push(src.slice(i + 1, end - 1));
    re.lastIndex = end;
  }
  return bodies.length > 0 ? bodies.join("\n") : src;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]*/;

function parseBody(text: string): ComposeNode[] {
  const nodes: ComposeNode[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i = skipString(text, i);
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/"))
        i += 1;
      i += 2;
      continue;
    }
    const identifier = IDENTIFIER.exec(text.slice(i));
    if (!identifier) {
      i += 1;
      continue;
    }
    const name = identifier[0];
    i += name.length;

    let args = "";
    let cursor = i;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    if (text[cursor] === "(") {
      const end = skipBalanced(text, cursor, "(", ")");
      args = text.slice(cursor + 1, end - 1);
      i = end;
    }

    // A trailing lambda may be introduced directly or after `=`.
    let braceAt = i;
    while (braceAt < text.length && /\s/.test(text[braceAt])) braceAt += 1;
    if (text[braceAt] === "=") {
      braceAt += 1;
      while (braceAt < text.length && /\s/.test(text[braceAt])) braceAt += 1;
    }

    let children: ComposeNode[] = [];
    if (text[braceAt] === "{") {
      const end = skipBalanced(text, braceAt, "{", "}");
      children = parseBody(text.slice(braceAt + 1, end - 1));
      i = end;
    }

    nodes.push({ name, args, children });
  }
  return nodes;
}

function firstStringLiteral(text: string): string | null {
  const start = text.indexOf('"');
  if (start === -1) return null;
  const end = skipString(text, start);
  return text
    .slice(start + 1, Math.max(start + 1, end - 1))
    .replace(/\\"/g, '"');
}

const COLOR_NAMES: Record<string, string> = {
  Red: "#e53935",
  Green: "#43a047",
  Blue: "#1e88e5",
  Yellow: "#fdd835",
  Gray: "#9e9e9e",
  Grey: "#9e9e9e",
  Black: "#000000",
  White: "#ffffff",
  Cyan: "#00acc1",
  Magenta: "#d81b60",
};

function dpToPx(value: string): string {
  const match = /(-?\d+(?:\.\d+)?)/.exec(value);
  return match ? `${match[1]}px` : "0px";
}

function namedOrPositionalSpacing(spec: string): string {
  // Positional form `padding(16.dp)` applies to all sides.
  if (!spec.includes("=")) return `padding:${dpToPx(spec)}`;
  const sides: string[] = [];
  const map: Record<string, string> = {
    horizontal: "padding-inline",
    vertical: "padding-block",
    start: "padding-inline-start",
    end: "padding-inline-end",
    top: "padding-top",
    bottom: "padding-bottom",
  };
  for (const part of spec.split(",")) {
    const [key, value] = part.split("=").map((piece) => piece.trim());
    const css = map[key];
    if (css && value) sides.push(`${css}:${dpToPx(value)}`);
  }
  return sides.join(";");
}

function modifierStyle(args: string): string {
  const styles: string[] = [];

  const padding = /\.padding\(\s*([^)]*)\)/.exec(args);
  if (padding) {
    const spacing = namedOrPositionalSpacing(padding[1]);
    if (spacing) styles.push(spacing);
  }

  if (/\.fillMaxWidth\(/.test(args)) styles.push("width:100%");
  if (/\.fillMaxHeight\(/.test(args)) styles.push("height:100%");
  if (/\.fillMaxSize\(/.test(args)) styles.push("width:100%;height:100%");

  const size = /\.size\(\s*([\d.]+)\.dp\s*\)/.exec(args);
  if (size) styles.push(`width:${size[1]}px;height:${size[1]}px`);
  const width = /\.width\(\s*([\d.]+)\.dp\s*\)/.exec(args);
  if (width) styles.push(`width:${width[1]}px`);
  const height = /\.height\(\s*([\d.]+)\.dp\s*\)/.exec(args);
  if (height) styles.push(`height:${height[1]}px`);

  if (/\.weight\(\s*[\d.]+f?\s*\)/.test(args)) styles.push("flex:1");

  const background = /\.background\(\s*Color\.([A-Za-z]+)/.exec(args);
  if (background) {
    styles.push(`background:${COLOR_NAMES[background[1]] ?? "#e0e0e0"}`);
  }

  return styles.join(";");
}

function spacingStyle(args: string): string {
  const spaced = /spacedBy\(\s*([\d.]+)\.dp/.exec(args);
  return spaced ? `gap:${spaced[1]}px` : "";
}

function joinStyles(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join(";");
}

function placeholder(name: string, reason: string, warnings: string[]): string {
  warnings.push(`${name}: ${reason}`);
  return (
    `<div class="oh-compose-placeholder" data-compose-type="${escapeHtml(name)}">` +
    `<span class="oh-compose-placeholder__type">${escapeHtml(name)}</span>` +
    `<span class="oh-compose-placeholder__note">${escapeHtml(reason)}</span>` +
    `</div>`
  );
}

function textContentOf(children: ComposeNode[]): string {
  return children
    .map((child) => {
      if (child.name === "Text") return firstStringLiteral(child.args) ?? "";
      return textContentOf(child.children);
    })
    .join(" ");
}

function fieldPlaceholder(args: string): string {
  const label =
    /label\s*=\s*(?:\{\s*Text\(\s*)?"([^"]*)"/.exec(args)?.[1] ??
    /placeholder\s*=\s*(?:\{\s*Text\(\s*)?"([^"]*)"/.exec(args)?.[1] ??
    firstStringLiteral(args) ??
    "";
  return escapeHtml(label);
}

function renderNode(
  node: ComposeNode,
  warnings: string[],
  depth: number,
): string {
  if (depth > MAX_DEPTH) {
    return placeholder(node.name, "exceeded preview depth limit", warnings);
  }

  const style = joinStyles(modifierStyle(node.args), spacingStyle(node.args));
  const children = () =>
    node.children
      .map((child) => renderNode(child, warnings, depth + 1))
      .join("");

  const container = CONTAINERS[node.name];
  if (container) {
    const inner = container.runtimeItems
      ? `<div class="oh-compose-note">items are supplied at runtime</div>` +
        children()
      : children();
    return `<div class="oh-compose-container" data-compose-type="${escapeHtml(
      node.name,
    )}" style="display:flex;flex-direction:${container.dir};${
      style ? `${style};` : ""
    }box-sizing:border-box">${inner}</div>`;
  }

  if (node.name === "Text") {
    const text = firstStringLiteral(node.args) ?? "";
    return `<div class="oh-compose-text" style="${joinStyles(
      style,
      "box-sizing:border-box",
    )}">${escapeHtml(text)}</div>`;
  }

  if (BUTTONS.has(node.name)) {
    const label = firstStringLiteral(node.args) ?? textContentOf(node.children);
    return `<button type="button" disabled style="${style}">${escapeHtml(
      label,
    )}</button>`;
  }

  if (TEXT_FIELDS.has(node.name)) {
    return `<input type="text" disabled placeholder="${fieldPlaceholder(
      node.args,
    )}" style="${style}" />`;
  }

  if (node.name === "Checkbox" || node.name === "Switch") {
    return `<label class="oh-compose-check"><input type="checkbox" disabled /> ${escapeHtml(
      textContentOf(node.children),
    )}</label>`;
  }

  if (node.name === "RadioButton") {
    return `<label class="oh-compose-check"><input type="radio" disabled /> ${escapeHtml(
      textContentOf(node.children),
    )}</label>`;
  }

  if (
    node.name === "Icon" ||
    node.name === "Image" ||
    node.name === "AsyncImage"
  ) {
    return `<div class="oh-compose-image" style="${style}" aria-hidden="true">🖼</div>`;
  }

  if (node.name === "Spacer") {
    return `<div class="oh-compose-spacer" style="${joinStyles(
      style,
      "flex:0 0 auto",
    )}"></div>`;
  }

  if (node.name === "Divider" || node.name === "HorizontalDivider") {
    return `<hr class="oh-compose-divider" style="${style}" />`;
  }

  if (PROGRESS.has(node.name)) {
    return `<div class="oh-compose-progress" role="progressbar" style="${style}"></div>`;
  }

  // Unknown composable: keep it visible, and keep any nested known widgets so
  // a wrapped child is not lost.
  return (
    placeholder(node.name, "unsupported composable", warnings) +
    (node.children.length > 0
      ? `<div class="oh-compose-container" style="display:flex;flex-direction:column">${children()}</div>`
      : "")
  );
}

export function transformComposeToHtml(source: string): ComposeTransformResult {
  const warnings: string[] = [];
  const body = extractFunctionBodies(source);
  const nodes = parseBody(body);
  const html = nodes.map((node) => renderNode(node, warnings, 0)).join("\n");
  return { html: `<div class="oh-compose-root">${html}</div>`, warnings };
}
