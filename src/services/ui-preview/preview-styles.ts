/**
 * Inline stylesheet injected into the sandboxed iframe that renders UI
 * Preview content. Kept as one string so every transformed format (XML
 * layout, Compose, SVG wrapper) shares the same neutral, dark-friendly
 * baseline and the preview does not depend on the Canvas theme.
 */
export const PREVIEW_STYLESHEET = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    color: #1f2328;
    background: #ffffff;
  }
  .oh-preview-warnings {
    margin: 0 0 12px;
    padding: 8px 10px;
    border: 1px solid #d9a441;
    border-radius: 6px;
    background: #fff8e6;
    color: #6b4e00;
    font-size: 12px;
  }
  .oh-preview-warnings ul { margin: 4px 0 0; padding-left: 18px; }
  .oh-xml-root, .oh-compose-root { display: block; }
  .oh-xml-container, .oh-compose-container { gap: 4px; }
  .oh-xml-text, .oh-compose-text { min-height: 1.2em; }
  button, input, .oh-xml-check, .oh-compose-check { font: inherit; }
  button:disabled, input:disabled { opacity: 0.85; }
  .oh-xml-placeholder, .oh-compose-placeholder {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border: 1px dashed #8b949e;
    border-radius: 6px;
    background: #f6f8fa;
    color: #57606a;
    font-size: 12px;
  }
  .oh-xml-placeholder__type, .oh-compose-placeholder__type { font-weight: 600; }
  .oh-xml-image, .oh-compose-image {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    background: #f6f8fa;
  }
  .oh-xml-divider, .oh-compose-divider {
    height: 1px;
    margin: 4px 0;
    border: 0;
    background: #d0d7de;
  }
  .oh-compose-spacer { min-width: 8px; min-height: 8px; }
  .oh-compose-note {
    padding: 4px 6px;
    color: #57606a;
    font-size: 11px;
    font-style: italic;
  }
  .oh-xml-progress, .oh-compose-progress {
    min-width: 32px;
    min-height: 8px;
    border-radius: 4px;
    background: repeating-linear-gradient(
      90deg, #58a6ff 0 8px, #d0d7de 8px 16px
    );
  }
`;
