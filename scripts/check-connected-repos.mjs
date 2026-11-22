#!/usr/bin/env node
/**
 * Verify the repositories FreeHands installs its backend from.
 *
 * `config/defaults.json` is the single source of truth for the SDK and litellm
 * forks (repo URL + pinned commit). This script proves those connections are
 * live: each repo is public, and each pinned ref resolves. Run it before a
 * release, or when a fresh install fails to fetch the backend.
 *
 * Usage:
 *   node scripts/check-connected-repos.mjs
 *   node scripts/check-connected-repos.mjs --json
 *
 * Set GITHUB_TOKEN to raise the API rate limit (optional; public repos work
 * without it).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function parseGitHubRepo(url) {
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url ?? "");
  return match ? { owner: match[1], repo: match[2] } : null;
}

async function api(path) {
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${response.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function checkSource(name, source) {
  const repo = parseGitHubRepo(source?.gitRepo);
  if (!repo) {
    return { name, ok: false, error: `not a GitHub repo URL: ${source?.gitRepo}` };
  }
  try {
    const meta = await api(`/repos/${repo.owner}/${repo.repo}`);
    const commit = await api(
      `/repos/${repo.owner}/${repo.repo}/commits/${source.gitRef}`,
    );
    return {
      name,
      ok: true,
      repo: `${repo.owner}/${repo.repo}`,
      defaultBranch: meta.default_branch,
      ref: source.gitRef,
      resolved: commit.sha,
      date: commit.commit?.committer?.date ?? null,
      message: (commit.commit?.message ?? "").split("\n")[0],
    };
  } catch (error) {
    return { name, ok: false, repo: `${repo.owner}/${repo.repo}`, error: error.message };
  }
}

const config = JSON.parse(readFileSync(resolve(root, "config/defaults.json"), "utf8"));
const results = [];
for (const [name, source] of [
  ["sdk", config.sdkSource],
  ["litellm", config.litellmSource],
]) {
  if (!source) {
    results.push({ name, ok: false, error: "missing from config/defaults.json" });
    continue;
  }
  results.push(await checkSource(name, source));
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const result of results) {
    if (result.ok) {
      console.log(`✓ ${result.name}: ${result.repo} @ ${result.ref}`);
      console.log(`  resolved ${result.resolved} (${result.date})`);
      console.log(`  ${result.message}`);
    } else {
      console.error(`✗ ${result.name}: ${result.error}`);
    }
  }
}

if (results.some((result) => !result.ok)) process.exitCode = 1;
