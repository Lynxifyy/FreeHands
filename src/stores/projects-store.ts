import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** A named group of conversations that share a workspace and agent mode. */
export interface Project {
  id: string;
  name: string;
  /** Local workspace the project's chats open in, when one was chosen. */
  workspacePath: string | null;
  createdAt: string;
}

interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
  addProject: (input: {
    name: string;
    workspacePath?: string | null;
  }) => Project;
  removeProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  renameProject: (id: string, name: string) => void;
}

const STORAGE_KEY = "freehands-projects";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Client-owned project list. Projects group chats and force the Complex Code
 * agent, so they deliberately stay local (like the pinned-home preference)
 * rather than being written into agent settings.
 */
export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,

      addProject: ({ name, workspacePath = null }) => {
        const project: Project = {
          id: newId(),
          name: name.trim(),
          workspacePath: workspacePath?.trim() || null,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          projects: [project, ...state.projects],
          activeProjectId: project.id,
        }));
        return project;
      },

      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== id),
          activeProjectId:
            state.activeProjectId === id ? null : state.activeProjectId,
        })),

      setActiveProject: (activeProjectId) => set({ activeProjectId }),

      renameProject: (id, name) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === id ? { ...project, name: name.trim() } : project,
          ),
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);

/** Look up a project by id without subscribing to the whole list. */
export function getProjectById(id: string | null | undefined): Project | null {
  if (!id) return null;
  return useProjectsStore.getState().projects.find((p) => p.id === id) ?? null;
}
