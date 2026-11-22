---
name: mobile-ui-review
description: Test a web app or APK on a real cloud Android phone, capture screenshots, and publish pass/fail evidence.
---

# Mobile UI review

Use this skill when the user asks to "test this on a phone", "check the mobile
layout", "run it on Android", or wants screenshots from a real device.

## Prerequisites

`MOBILESANDBOX_API_KEY` must be set in the environment. Never print the key,
never write it into a file, and never paste it into chat. If it is missing, ask
the user to set it and stop.

## Procedure

1. Create a phone with `scripts/phone.sh create <name>`. It prints the phone id
   and a live viewer URL. Keep the id: you must clean up at the end.
2. Read the screen with `GET /v1/phones/{id}/observe` (or the `observe` MCP
   tool). Each element has a ref, type, text and centre point.
3. Drive it with `POST /v1/phones/{id}/actions` (or `act`), batching steps you
   are sure of. To open a web app:
   - `open_app` with package `com.android.chrome`;
   - tap the address bar (observe first to get its ref or coordinates);
   - `type` the URL with `submit: true`;
   - `wait_for` a stable heading or text from the page.
4. Capture evidence with `GET /v1/phones/{id}/screenshot` (PNG). Save it in the
   workspace and reference it from the report.
5. Verify outcomes, not inputs: after each action that saves or navigates, read
   the new screen before claiming success. Toasts matter — a save often reports
   only there.
6. Write `MOBILE_REVIEW.md` with `file_builder`: what you tested, the steps, the
   screenshots, and every failure with the exact screen text.
7. Clean up: `scripts/phone.sh delete <id>`. Delete even when the test failed.
   Park (`scripts/phone.sh park <id>`) only when the user wants to resume.

## Rules

- One phone at a time unless the user asks otherwise. A ready phone costs money
  per minute; clean up promptly.
- If the page needs a login or 2FA, ask the user to take control via the viewer
  link. Never ask for their password.
- Treat screenshots as user data: keep them in the workspace, do not upload them
  anywhere the user did not ask for.
