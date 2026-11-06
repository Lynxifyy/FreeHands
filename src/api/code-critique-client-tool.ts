import {
  CODE_CRITIQUE_RESULT_PREFIX,
  CODE_CRITIQUE_TOOL_NAME,
} from "#/constants/code-critique";
import type { ClientToolSpec } from "./canvas-ui-client-tool";

const CODE_CRITIQUE_DESCRIPTION = `Ask for an immediate review of code you just wrote, before you tell the user you are done.

Use it as a self-check on the file you are working on — a UI file, a snippet, or
any code you are unsure about. It catches the three failure modes that matter
most: "this won't work" (a real error — malformed markup, unbalanced
delimiters, Compose used outside a @Composable), "this is wrong" (structure or
accessibility problems), and "this is incomplete" (TODO/FIXME markers,
placeholder bodies, not-implemented throws).

Pass either a workspace-relative \`path\` (the file is read for you) or inline
\`code\` for a snippet. Prefer \`path\` when the code is already on disk. Call it
after writing a UI file and before your final summary, and act on anything it
reports with severity "error".

This is a static check, not a compiler or a test run: it does not execute your
code and cannot catch runtime-only bugs. When it passes, still verify with the
project's own build/tests. A clean result means "no obvious problems found",
not "guaranteed correct".

What comes back: this tool is acknowledged immediately and the findings arrive
as a follow-up message starting with "${CODE_CRITIQUE_RESULT_PREFIX.trim()}"
carrying a verdict (pass | warn | fail), a summary, and a list of issues with
file line numbers, severity and a hint.`;

export const CODE_CRITIQUE_CLIENT_TOOL: ClientToolSpec = {
  name: CODE_CRITIQUE_TOOL_NAME,
  description: CODE_CRITIQUE_DESCRIPTION,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: {
        type: "string",
        description:
          "Workspace-relative path of the file to review. Provide this or `code`, not both.",
      },
      code: {
        type: "string",
        description:
          "Inline source to review when it is not a file on disk. Provide this or `path`.",
      },
      language: {
        type: "string",
        description:
          "Optional language override (html, xml, kotlin, typescript, javascript, python, css). Detected from the path or content otherwise.",
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
