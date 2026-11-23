import React from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban, Plus, Sparkles, Trash2 } from "lucide-react";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";
import { useProjectsStore } from "#/stores/projects-store";
import { cn } from "#/utils/utils";

/**
 * Projects group chats around a workspace. Every chat started from a project
 * runs the Complex Code agent, so the page is the deliberate entry point for
 * "this is real engineering work" rather than a quick one-off.
 */
export default function ProjectsScreen() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const projects = useProjectsStore((state) => state.projects);
  const addProject = useProjectsStore((state) => state.addProject);
  const removeProject = useProjectsStore((state) => state.removeProject);
  const setActiveProject = useProjectsStore((state) => state.setActiveProject);
  const [name, setName] = React.useState("");
  const [workspace, setWorkspace] = React.useState("");

  const openProject = (id: string) => {
    setActiveProject(id);
    navigate(`/conversations?project=${encodeURIComponent(id)}`);
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = addProject({ name: trimmed, workspacePath: workspace });
    setName("");
    setWorkspace("");
    openProject(project.id);
  };

  return (
    <div
      data-testid="projects-screen"
      className="custom-scrollbar-always h-full overflow-y-auto px-4 py-6 md:px-8"
    >
      <div className="mx-auto flex w-full max-w-200 flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-white/8 text-contrast ring-1 ring-white/15">
              <FolderKanban className="size-5" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-contrast">
              {t(I18nKey.PROJECTS$TITLE)}
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-tertiary-light">
            {t(I18nKey.PROJECTS$SUBTITLE)}
          </p>
        </header>

        <form
          onSubmit={handleCreate}
          className="sidebar-glass flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-end"
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-muted">
            {t(I18nKey.PROJECTS$NAME)}
            <input
              data-testid="project-name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t(I18nKey.PROJECTS$NAME_PLACEHOLDER)}
              className="h-9 rounded-lg border border-white/15 bg-black/20 px-3 text-sm text-contrast outline-none placeholder:text-muted focus:border-white/35"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-muted">
            {t(I18nKey.PROJECTS$WORKSPACE)}
            <input
              data-testid="project-workspace-input"
              value={workspace}
              onChange={(event) => setWorkspace(event.target.value)}
              placeholder={t(I18nKey.PROJECTS$WORKSPACE_PLACEHOLDER)}
              className="h-9 rounded-lg border border-white/15 bg-black/20 px-3 font-mono text-xs text-contrast outline-none placeholder:text-muted focus:border-white/35"
            />
          </label>
          <BrandButton
            testId="create-project-button"
            type="submit"
            variant="primary"
            isDisabled={!name.trim()}
            className="h-9 shrink-0"
          >
            <Plus className="mr-1.5 size-4" aria-hidden />
            {t(I18nKey.PROJECTS$CREATE)}
          </BrandButton>
        </form>

        {projects.length === 0 ? (
          <div
            data-testid="projects-empty"
            className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-10 text-center text-sm text-tertiary-light"
          >
            {t(I18nKey.PROJECTS$EMPTY)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <article
                key={project.id}
                data-testid="project-card"
                className={cn(
                  "group flex flex-col gap-3 rounded-2xl border border-white/12",
                  "bg-white/[0.04] p-4 transition-colors hover:border-white/25 hover:bg-white/[0.06]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-contrast">
                      {project.name}
                    </h2>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                      {project.workspacePath ??
                        t(I18nKey.PROJECTS$NO_WORKSPACE)}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-contrast">
                    <Sparkles className="size-3" aria-hidden />
                    {t(I18nKey.PROJECTS$COMPLEX_BADGE)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <BrandButton
                    testId={`project-new-chat-${project.id}`}
                    type="button"
                    variant="primary"
                    onClick={() => openProject(project.id)}
                  >
                    {t(I18nKey.PROJECTS$NEW_CHAT)}
                  </BrandButton>
                  <button
                    type="button"
                    data-testid={`project-delete-${project.id}`}
                    aria-label={t(I18nKey.PROJECTS$DELETE)}
                    onClick={() => removeProject(project.id)}
                    className="ml-auto inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-status-error/15 hover:text-status-error"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
