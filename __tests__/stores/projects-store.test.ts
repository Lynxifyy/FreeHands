import { beforeEach, describe, expect, it } from "vitest";
import { useProjectsStore } from "#/stores/projects-store";

describe("useProjectsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectsStore.setState({ projects: [], activeProjectId: null });
  });

  it("adds a project and makes it active", () => {
    const project = useProjectsStore.getState().addProject({
      name: "Payments API",
      workspacePath: "/work/payments",
    });

    const state = useProjectsStore.getState();
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]).toMatchObject({
      name: "Payments API",
      workspacePath: "/work/payments",
    });
    expect(state.activeProjectId).toBe(project.id);
  });

  it("renames and removes a project", () => {
    const project = useProjectsStore.getState().addProject({ name: "Old" });
    useProjectsStore.getState().renameProject(project.id, "New");
    expect(useProjectsStore.getState().projects[0].name).toBe("New");

    useProjectsStore.getState().removeProject(project.id);
    expect(useProjectsStore.getState().projects).toHaveLength(0);
    expect(useProjectsStore.getState().activeProjectId).toBeNull();
  });

  it("trims empty workspace paths to null", () => {
    const project = useProjectsStore
      .getState()
      .addProject({ name: "  Notes  ", workspacePath: "   " });
    expect(project.name).toBe("Notes");
    expect(project.workspacePath).toBeNull();
  });
});
