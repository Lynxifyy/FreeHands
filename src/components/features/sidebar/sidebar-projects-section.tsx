import { useTranslation } from "react-i18next";
import { FolderKanban } from "lucide-react";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";
import { useProjectsStore } from "#/stores/projects-store";

interface SidebarProjectsSectionProps {
  collapsed: boolean;
}

/**
 * Compact project shortcuts under the primary nav. Selecting one opens the
 * launcher scoped to that project, where Complex Code is forced on.
 */
export function SidebarProjectsSection({
  collapsed,
}: SidebarProjectsSectionProps) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const projects = useProjectsStore((state) => state.projects);
  const setActiveProject = useProjectsStore((state) => state.setActiveProject);

  if (collapsed || projects.length === 0) return null;

  return (
    <div
      data-testid="sidebar-projects-section"
      className="mt-1 flex shrink-0 flex-col gap-0.5 px-2.5"
    >
      <span className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
        {t(I18nKey.SIDEBAR$PROJECTS)}
      </span>
      {projects.slice(0, 6).map((project) => (
        <button
          key={project.id}
          type="button"
          data-testid={`sidebar-project-${project.id}`}
          onClick={() => {
            setActiveProject(project.id);
            navigate(
              `/conversations?project=${encodeURIComponent(project.id)}`,
            );
          }}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-white/8 hover:text-contrast"
        >
          <FolderKanban className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{project.name}</span>
        </button>
      ))}
    </div>
  );
}
