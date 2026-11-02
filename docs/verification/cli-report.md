# Verification ledger — run 2026-11-02T0124-8c17e5

Revision `e78c81322b49398da91fecb1ca29316725281498`, local mode, Agent Server 1.55.0, base http://127.0.0.1:18800.

Checks: 2 — pass 2, fail 0, blocked 0, not-run 0, xfail 0, xpass 0. Families: 2.

## Families

| Family | pass | fail | blocked | not-run | xfail | xpass |
|---|---|---|---|---|---|---|
| EDI | 1 | 0 | 0 | 0 | 0 | 0 |
| TER | 1 | 0 | 0 | 0 | 0 | 0 |

## Checks

| Feature/check | Entry point | Expected → actual | Result | Note | Evidence |
|---|---|---|---|---|---|
| EDITOR-DRAFT-1 | Files > README.md > Edit > Save | Saved text reaches the real workspace file → Keyboard edit saved through production ingress; disk grep matched the edited text; no page errors | pass |  | `evidence/EDITOR-DRAFT-1/real-save-verified.png` |
| TERMINAL-ERROR-1 | Terminal > command > Send | Real command output appears in the terminal → cli-terminal-ok rendered through the production ingress and real Agent Server | pass |  | `evidence/TERMINAL-ERROR-1/real-terminal.png` |
