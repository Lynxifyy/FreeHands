/**
 * Deterministic Android XML layout → HTML transformer for the UI Preview tab.
 *
 * This is an approximation, not a real Android renderer: it maps the layout
 * containers and the common widgets onto flexbox boxes so a developer can see
 * structure, nesting, orientation, and text at a glance. Anything it does not
 * understand is rendered as a labelled placeholder and reported in `warnings`
 * — the transformer never silently drops a node.
 *
 * All layout text is HTML-escaped, and the caller renders the result inside a
 * sandboxed iframe, so a layout cannot inject script into the Canvas.
 */

export interface XmlTransformOptions {
  /** `values/strings.xml` entries, keyed by name, for `@string/name` refs. */
  strings?: Record<string, string>;
}

export interface XmlTransformResult {
  html: string;
  warnings: string[];
}

const MAX_DEPTH = 24;

// Containers that lay their children out along one axis.
const FLEX_CONTAINERS: Record<string, "row" | "column"> = {
  LinearLayout: "column", // default orientation is horizontal, adjusted below
  FrameLayout: "column",
  RelativeLayout: "column",
  ConstraintLayout: "column",
  ScrollView: "column",
  NestedScrollView: "column",
  HorizontalScrollView: "row",
  TableLayout: "column",
  TableRow: "row",
  RadioGroup: "column",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAttribute(element: Element, name: string): string | null {
  // Android attributes are namespaced (`android:text`); `getAttribute` with
  // the literal qualified name is the portable way to read them in jsdom.
  const value = element.getAttribute(name);
  if (value !== null) return value;
  const local = name.includes(":") ? name.split(":")[1] : name;
  const android = element.getAttributeNS(
    "http://schemas.android.com/apk/res/android",
    local,
  );
  return android;
}

function dimension(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "match_parent" || trimmed === "fill_parent") return "100%";
  if (trimmed === "wrap_content") return "auto";
  const dp = /^(-?\d+(?:\.\d+)?)d(?:i)?p$/.exec(trimmed);
  if (dp) return `${dp[1]}px`;
  if (trimmed === "0dp" || trimmed === "0") return "0px";
  return null;
}

function boxStyle(element: Element): string {
  const styles: string[] = ["box-sizing:border-box"];
  const width = dimension(getAttribute(element, "android:layout_width"));
  const height = dimension(getAttribute(element, "android:layout_height"));
  if (width) styles.push(`width:${width}`);
  if (height && height !== "auto") styles.push(`min-height:${height}`);
  return styles.join(";");
}

function orientationOf(element: Element, fallback: "row" | "column") {
  const orientation = getAttribute(element, "android:orientation");
  if (orientation === "horizontal") return "row";
  if (orientation === "vertical") return "column";
  return fallback;
}

function resolveText(
  raw: string | null,
  strings: Record<string, string>,
  warnings: string[],
): string | null {
  if (raw === null) return null;
  const ref = /^@string\/(.+)$/.exec(raw.trim());
  if (ref) {
    const name = ref[1];
    const resolved = strings[name];
    if (resolved === undefined) {
      warnings.push(`Unresolved string reference @string/${name}`);
      return raw;
    }
    return resolved;
  }
  return raw;
}

function placeholder(type: string, warnings: string[], reason: string): string {
  warnings.push(`${type}: ${reason}`);
  return (
    `<div class="oh-xml-placeholder" data-android-type="${escapeHtml(type)}">` +
    `<span class="oh-xml-placeholder__type">${escapeHtml(type)}</span>` +
    `<span class="oh-xml-placeholder__note">${escapeHtml(reason)}</span>` +
    `</div>`
  );
}

function renderWidget(
  element: Element,
  strings: Record<string, string>,
  warnings: string[],
): string | null {
  const tag = element.tagName;
  const text = resolveText(
    getAttribute(element, "android:text"),
    strings,
    warnings,
  );
  const hint = resolveText(
    getAttribute(element, "android:hint"),
    strings,
    warnings,
  );

  switch (tag) {
    case "TextView":
      return `<div class="oh-xml-text" style="${boxStyle(element)}">${escapeHtml(
        text ?? "",
      )}</div>`;
    case "Button":
      return `<button type="button" disabled style="${boxStyle(
        element,
      )}">${escapeHtml(text ?? "")}</button>`;
    case "EditText":
    case "AutoCompleteTextView":
    case "TextInputEditText":
      return `<input type="text" disabled placeholder="${escapeHtml(
        hint ?? text ?? "",
      )}" style="${boxStyle(element)}" />`;
    case "CheckBox":
    case "Switch":
    case "SwitchCompat":
      return `<label class="oh-xml-check"><input type="checkbox" disabled /> ${escapeHtml(
        text ?? "",
      )}</label>`;
    case "RadioButton":
      return `<label class="oh-xml-check"><input type="radio" disabled /> ${escapeHtml(
        text ?? "",
      )}</label>`;
    case "ImageView":
    case "ImageButton":
      return `<div class="oh-xml-image" style="${boxStyle(
        element,
      )}" aria-hidden="true">🖼</div>`;
    case "ProgressBar":
      return `<div class="oh-xml-progress" style="${boxStyle(
        element,
      )}" role="progressbar"></div>`;
    case "RecyclerView":
    case "ListView":
    case "GridView":
    case "ViewPager":
    case "ViewPager2":
      return placeholder(tag, warnings, "items are supplied at runtime");
    case "include":
    case "merge":
      return placeholder(tag, warnings, "included at build time");
    case "View":
      return `<div class="oh-xml-divider" style="${boxStyle(element)}"></div>`;
    default:
      return null;
  }
}

function renderElement(
  element: Element,
  options: XmlTransformOptions,
  warnings: string[],
  depth: number,
): string {
  if (depth > MAX_DEPTH) {
    return placeholder(
      element.tagName,
      warnings,
      "exceeded preview depth limit",
    );
  }

  const widget = renderWidget(element, options.strings ?? {}, warnings);
  if (widget !== null) return widget;

  const tag = element.tagName;
  const isFlex = tag in FLEX_CONTAINERS;
  const children = Array.from(element.children)
    .map((child) => renderElement(child, options, warnings, depth + 1))
    .join("");

  if (isFlex) {
    const direction = orientationOf(element, FLEX_CONTAINERS[tag]);
    return (
      `<div class="oh-xml-container" data-android-type="${escapeHtml(tag)}" ` +
      `style="${boxStyle(element)};display:flex;flex-direction:${direction}">` +
      children +
      `</div>`
    );
  }

  // Unknown node: keep it visible as a placeholder, but still render children
  // so nested known widgets are not lost.
  return (
    placeholder(tag, warnings, "unsupported element") +
    (children ? `<div class="oh-xml-container">${children}</div>` : "")
  );
}

export function transformXmlLayoutToHtml(
  source: string,
  options: XmlTransformOptions = {},
): XmlTransformResult {
  const warnings: string[] = [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source, "application/xml");
  } catch (error) {
    warnings.push(`XML is not well-formed: ${String(error)}`);
    return { html: `<pre>${escapeHtml(source)}</pre>`, warnings };
  }

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    warnings.push(
      `XML is not well-formed: ${parseError.textContent?.trim() ?? "parse error"}`,
    );
    return { html: `<pre>${escapeHtml(source)}</pre>`, warnings };
  }

  const root = doc.documentElement;
  if (!root) {
    warnings.push("XML is not well-formed: no root element");
    return { html: `<pre>${escapeHtml(source)}</pre>`, warnings };
  }

  const body = renderElement(root, options, warnings, 0);
  return { html: `<div class="oh-xml-root">${body}</div>`, warnings };
}
