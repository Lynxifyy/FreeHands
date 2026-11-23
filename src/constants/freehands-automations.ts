import type { RecommendedAutomation } from "@openhands/extensions/automations";

/**
 * FreeHands' own automation templates. The published catalog covers the
 * common integrations; these add the day-to-day maintenance work a repository
 * owner actually wants on a schedule, all runnable without connecting an
 * external service.
 */
export const FREEHANDS_AUTOMATIONS: readonly RecommendedAutomation[] = [
  {
    id: "freehands-repo-health",
    name: "Repository health sweep",
    category: "Code quality",
    icon: "activity",
    description:
      "Runs the repository's install, lint, type-check, test and build commands, " +
      "then fixes the failures it can prove are safe and reports the rest with " +
      "the exact command that failed.",
    requires: { integrations: {} },
    popularityRank: 96,
    estimatedSetupMinutes: 2,
    exampleImplementation:
      "Detect the project's toolchain, run the standard verification commands, " +
      "group failures by root cause, fix mechanical breakage, and leave a short " +
      "report of anything that needs a human decision.",
  },
  {
    id: "freehands-static-audit",
    name: "Static correctness audit",
    category: "Code quality",
    icon: "circle-alert",
    description:
      "Reads every source file and reports wiring that cannot work: dead imports, " +
      "unreachable branches, mismatched types, missing handlers, broken build " +
      "paths, and better alternatives for each finding.",
    requires: { integrations: {} },
    popularityRank: 93,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Walk the tree file by file, trace each symbol to its definition and call " +
      "sites, and produce a ranked list of defects with file, line, why it fails, " +
      "and the smallest correct fix.",
  },
  {
    id: "freehands-test-gap-finder",
    name: "Test gap finder",
    category: "Testing",
    icon: "sparkles",
    description:
      "Finds behaviour that no test exercises, ranks the gaps by risk, and writes " +
      "the highest-value missing tests using the repository's existing test style.",
    requires: { integrations: {} },
    popularityRank: 90,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Map exported behaviour to tests, identify untested error paths and edge " +
      "cases, add focused tests that fail before the fix and pass after it.",
  },
  {
    id: "freehands-dependency-guard",
    name: "Dependency and CVE guard",
    category: "Security",
    icon: "circle-alert",
    description:
      "Audits dependencies for known vulnerabilities and outdated pins, upgrades " +
      "the safe ones, and lists anything with a breaking change for review.",
    requires: { integrations: {} },
    popularityRank: 88,
    estimatedSetupMinutes: 4,
    exampleImplementation:
      "Run the ecosystem audit command, read each advisory and changelog, apply " +
      "patch and minor upgrades with a lockfile update, then verify the build.",
  },
  {
    id: "freehands-pr-shepherd",
    name: "PR shepherd",
    category: "Delivery",
    icon: "bot",
    description:
      "Watches open pull requests, reproduces failing checks locally, pushes the " +
      "smallest fix, and re-runs the failing job until the branch is green.",
    requires: { integrations: {} },
    popularityRank: 86,
    estimatedSetupMinutes: 5,
    exampleImplementation:
      "For each red pull request, read the failing log, reproduce the command, " +
      "fix the cause rather than the symptom, and summarize what changed.",
  },
  {
    id: "freehands-release-notes",
    name: "Release notes writer",
    category: "Delivery",
    icon: "timer",
    description:
      "Turns the commits since the last tag into grouped release notes with " +
      "breaking changes first, then features, fixes and chores.",
    requires: { integrations: {} },
    popularityRank: 84,
    estimatedSetupMinutes: 2,
    exampleImplementation:
      "Read the git log since the previous tag, classify each change, and write " +
      "a changelog a user can act on without reading the diff.",
  },
];

/**
 * Launch instructions for the host automations. The published catalog derives
 * these from a skill trigger; these templates have no skill of their own, so
 * they state the work directly.
 */
export const FREEHANDS_AUTOMATION_PROMPTS: Readonly<Record<string, string>> = {
  "freehands-repo-health":
    "Run a full repository health sweep: detect the toolchain, install dependencies, " +
    "then run lint, type-check, tests and build. Fix every mechanical failure you can " +
    "verify is safe, re-run until green, and report anything that needs a human " +
    "decision with the exact failing command and output.",
  "freehands-static-audit":
    "Perform a static correctness audit of every source file. For each file, trace " +
    "imports, types, handlers and build wiring, and report anything that cannot work " +
    "at runtime with the file, line, reason, and a better implementation. Then fix " +
    "the defects that are unambiguous.",
  "freehands-test-gap-finder":
    "Find untested behaviour, rank the gaps by user impact and risk, and write the " +
    "highest-value missing tests in the repository's existing test framework and " +
    "style. Verify each new test fails without the intended fix and passes with it.",
  "freehands-dependency-guard":
    "Audit dependencies for known vulnerabilities and stale pins. Apply safe patch " +
    "and minor upgrades with the lockfile, run the full verification suite after each " +
    "group, and list upgrades with breaking changes for the user to approve.",
  "freehands-pr-shepherd":
    "Inspect every open pull request with a failing check, reproduce the failure " +
    "locally, fix the root cause, push the smallest correct change, and re-run the " +
    "failing job until it passes.",
  "freehands-release-notes":
    "Write release notes for the commits since the previous tag: breaking changes " +
    "first, then features, fixes and chores. Group related commits and describe the " +
    "user-visible effect of each.",
};
