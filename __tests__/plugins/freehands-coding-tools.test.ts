import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const pluginDir = resolve(root, "plugins/freehands-coding-tools");

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("freehands-coding-tools plugin", () => {
  it("has a valid Agent Plugins manifest", () => {
    const manifest = readJson(resolve(pluginDir, "plugin.json"));
    expect(manifest.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
    expect(manifest.name).toBe("freehands-coding-tools");
    expect(manifest.version).toBe("1.0.0");
  });

  it("starts the server over stdio from the plugin root", () => {
    const mcp = readJson(resolve(pluginDir, "mcp.json"));
    const server = mcp.mcpServers["freehands-coding-tools"];
    expect(mcp.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    );
    expect(server.type).toBe("stdio");
    expect(server.command).toBe("python3");
    expect(server.args).toContain("${PLUGIN_ROOT}/server.py");
  });

  it("registers at least 30 real tools", () => {
    const server = readFileSync(resolve(pluginDir, "server.py"), "utf8");
    const tools = [...server.matchAll(/@mcp\.tool\(\)\s*\ndef\s+(\w+)/g)].map(
      (match) => match[1],
    );
    expect(tools.length).toBeGreaterThanOrEqual(30);
    for (const name of [
      "git_status",
      "run_tests",
      "dependency_audit",
      "secret_scan",
      "workspace_info",
      "mobilebox_create_phone",
      "mobilebox_watch",
      "mobilebox_delete",
    ]) {
      expect(tools).toContain(name);
    }
  });

  it("is listed in the FreeHands marketplace", () => {
    const marketplace = readJson(resolve(root, ".plugin/marketplace.json"));
    expect(
      marketplace.plugins.some(
        (plugin: { name: string }) => plugin.name === "freehands-coding-tools",
      ),
    ).toBe(true);
  });
});
