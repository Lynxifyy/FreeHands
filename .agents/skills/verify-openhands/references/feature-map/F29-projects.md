# F29 — Projects

Projects group chats around a workspace and force the **Complex Code**
(OpenCode) agent for every chat started from them. The project list is
client-owned (localStorage) and the sidebar shows up to six shortcuts under
**PROJECTS**. Starting a project chat opens the home launcher with a project
chip (`<name> · COMPLEX CODE`), pins the project's workspace folder when one was
set, and records `projectId` on the conversation metadata so reopening it keeps
the Complex Code composer.

Source: `src/routes/projects.tsx`, `src/stores/projects-store.ts`, `src/components/features/sidebar/sidebar-projects-section.tsx`, `src/components/features/home/home-chat-launcher.tsx`, `src/api/conversation-metadata-store.ts`, `src/stores/conversation-store.ts`.

## Sub-features

- `F29.projects-page`: the sidebar **Projects** item opens `/projects` with a **Project name** field, an optional **Workspace folder** field, and **Create project**; an empty list reads `No projects yet. Create one to group chats and run Complex Code automatically.`
- `F29.create-project`: **Create project** adds the card, makes it active, and navigates to `/conversations?project=<id>`; the card shows the workspace path or `No workspace folder` and a **Complex Code** badge.
- `F29.project-launcher`: the launcher replaces the Code / Complex / Automate toggle with a project chip; the composer placeholder is still `What do you want to build?` and the LLM banner is not shown for the ACP-backed project chat.
- `F29.project-chat-mode`: submitting stores `conversationMode: "complex"` and `projectId` on the conversation; reopening the conversation restores Complex Code.
- `F29.sidebar-projects`: the expanded sidebar lists project shortcuts; selecting one opens that project's launcher. Deleting the last project removes the section.
- `F29.project-workspace`: a project with a workspace path passes it as `working_dir` on a local backend unless the composer has an explicit workspace selection.

## How to get to it (user POV)

- Sidebar **Projects** (`sidebar-projects-link`) opens `/projects`.
- The empty state's form: **Project name** (`project-name-input`), **Workspace folder** (`project-workspace-input`), **Create project** (`create-project-button`).
- A project card's **New chat** (`project-new-chat-<id>`) opens `/conversations?project=<id>`.
- Sidebar **PROJECTS** shortcuts (`sidebar-project-<id>`) open the same launcher.
- A project card's trash button (`project-delete-<id>`) removes the project.

## Driving it with control-openhands

Preconditions:

- Baseline state (`launch`, `doctor`, `onboard --skip`).
- Desktop viewport.
- No LLM is needed for the project page itself; the launcher recipes need a backend with agent profiles for Complex Code to apply.

- **Projects page (`F29.projects-page`).** Run `control-openhands browser goto /projects`; `browser visible 'testid=projects-screen'` is `true`, `browser text 'testid=projects-empty'` contains `No projects yet`.
- **Create a project (`F29.create-project`).** Fill `testid=project-name-input` with `QA_F29 Project`, click `testid=create-project-button` and `browser wait-url 'project='`; `browser count 'testid=project-card'` is `1`, the card shows `Complex Code`, and `browser visible 'testid=sidebar-project-*'` is `true`.
- **Project launcher (`F29.project-launcher`).** On the launcher, `browser text 'testid=home-chat-launcher'` contains `QA_F29 Project` and `COMPLEX CODE`; `browser count 'testid=home-launcher-mode-toggle'` is `0`; the LLM banner (`testid=home-llm-not-configured-banner`) is absent.
- **Project chat mode (`F29.project-chat-mode`).** Submit a message; `browser wait-url '/conversations/'`; read `localStorage['conversation-state-<id>']` and `localStorage['openhands-agent-server-conversation-metadata']`: the first has `"conversationMode":"complex"` and the second has the project id under the conversation id.
- **Cleanup.** Delete the project with `testid=project-delete-<id>` and confirm the card and sidebar shortcut are gone.

## Gotchas

- The project list is per browser profile (localStorage); a fresh browser shows an empty list.
- Complex Code needs the agent-profile API; on an older backend the launcher reports an error instead of silently launching the native agent.
- A project's workspace is only forwarded on a local backend and only when the composer has no explicit workspace selection.
