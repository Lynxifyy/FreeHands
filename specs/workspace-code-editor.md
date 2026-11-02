# Workspace code editor

### EDITOR-DRAFT-1: Explicit, recoverable saves

- [x] The Files tab shall offer an Edit mode backed by Monaco, with language awareness, line numbers, wrapping, keyboard save, and the active application theme.
- [x] Unsaved text shall be scoped to the active backend, conversation, and full workspace-relative path. Switching files or conversations shall not mix drafts.
- [x] Saving shall use the conversation's typed local/cloud runtime file APIs. A successful save shall invalidate the file listing/content and any affected diff.
- [x] Closing or discarding an unsaved draft shall be explicit. Binary content and text over 1 MiB shall remain outside the editable path.

### EDITOR-CONFLICT-1: Concurrent workspace changes

- [x] Before saving, the editor shall compare the current remote text with the baseline it loaded. A changed remote file shall produce a conflict, not silently overwrite the remote version.
- [x] The user shall be able to inspect the remote text/diff and explicitly choose to keep their draft. The draft shall survive a failed or conflicted save.
- [x] This is read-compare-write, not an atomic compare-and-swap. The current Agent Server upload API has no version/ETag precondition; a concurrent write in the final comparison/upload window remains possible.
- [x] Workspace paths shall be validated lexically before constructing a destination. This validation is not a server-side sandbox and does not replace backend authorization or filesystem containment.

### EDITOR-AGENT-1: Selection-to-chat context

- [x] A selected code range shall be appendable to the existing conversation composer with its file path, line range, language, and whether it came from an unsaved draft.
- [x] Existing chat text shall be preserved. Adding context shall not send a message or invoke the model automatically.
