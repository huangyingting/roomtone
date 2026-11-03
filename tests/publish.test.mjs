import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandError, publish } from "../scripts/publish.mjs";

function harness(overrides = {}) {
  const calls = [];
  let repositoryExists = overrides.repositoryExists ?? false;
  let pagesExists = overrides.pagesExists ?? false;
  let dispatchAttempts = 0;
  const run = (command, args, settings = {}) => {
    calls.push([command, ...args]);
    const key = `${command} ${args.join(" ")}`;
    if (key === "git branch --show-current") return overrides.branch || "main";
    if (key === "git status --porcelain") return overrides.dirty ? " M file" : "";
    if (key === "git rev-parse HEAD") return "verified-commit";
    if (key === "git remote") return overrides.origin ? "origin" : "";
    if (key === "git remote get-url --push origin") return overrides.origin;
    if (key === "gh api user --jq .login") {
      if (overrides.unauthorized) throw new CommandError(command, args, { stderr: "gh: Bad credentials (HTTP 401)" });
      return "huangyingting";
    }
    if (key === "gh api repos/huangyingting/roomtone") {
      if (!repositoryExists) throw new CommandError(command, args, { stderr: "gh: Not Found (HTTP 404)" });
      return JSON.stringify({ private: overrides.private ?? false, permissions: { admin: true } });
    }
    if (command === "gh" && args[0] === "repo") { repositoryExists = true; return ""; }
    if (key === "gh api repos/huangyingting/roomtone/pages") {
      if (!pagesExists) throw new CommandError(command, args, { stderr: "gh: Not Found (HTTP 404)" });
      return JSON.stringify({ build_type: "workflow", html_url: "https://huangyingting.github.io/roomtone/" });
    }
    if (command === "gh" && args.includes("POST")) { pagesExists = true; return ""; }
    if (command === "gh" && args[0] === "workflow" && overrides.workflowForbidden) throw new CommandError(command, args, { stderr: "gh: Forbidden (HTTP 403)" });
    if (command === "gh" && args[0] === "workflow" && overrides.workflowDelayed && dispatchAttempts++ < 2) throw new CommandError(command, args, { stderr: "gh: Not Found (HTTP 404)" });
    if (command === "gh" && args[0] === "run" && args[1] === "list") {
      if (args.includes("push") && overrides.unregisteredPush) throw new CommandError(command, args, { stderr: "gh: Not Found (HTTP 404)" });
      if (args.includes("push")) return JSON.stringify(overrides.pushRun ? [{ databaseId: 456, createdAt: overrides.stalePush ? "2026-11-02T07:00:01Z" : "2026-11-03T07:00:01Z" }] : []);
      return JSON.stringify(overrides.missingRun ? [] : [{ databaseId: 123, createdAt: "2026-11-03T07:00:01Z" }]);
    }
    if (command === "gh" && args[0] === "run" && args[1] === "watch" && overrides.failedWorkflow) throw new CommandError(command, args, { stderr: "Workflow failed" });
    if (command === "git" && args.includes("push")) return "";
    if (command === "git" && args[0] === "remote" && args[1] === "add") return "";
    if (command === "gh" && ["workflow", "run"].includes(args[0])) return "";
    if (command === "npm" && args.join(" ") === "run test:e2e") {
      calls.push(["browser-url", settings.env?.PLAYWRIGHT_BASE_URL]);
      if (overrides.liveBrowserFailed) throw new CommandError(command, args, { stdout: "Live browser checks failed" });
      return "";
    }
    throw new Error(`Unexpected command: ${key}`);
  };
  const verify = async (url) => { calls.push(["verify", url]); };
  return { calls, options: { run, verify, sleep: async () => {}, now: () => new Date("2026-11-03T07:00:00Z"), log: () => {} } };
}
test("publication creates a public repository, enables Pages, pushes and verifies the deployment", async () => {
  const { calls, options } = harness();
  assert.equal(await publish(options), "https://huangyingting.github.io/roomtone/");
  assert.ok(calls.some((call) => call[0] === "gh" && call[1] === "repo" && call.includes("--public")));
  assert.ok(calls.some((call) => call.includes("POST") && call.includes("build_type=workflow")));
  assert.ok(calls.some((call) => call.includes("credential.helper=!gh auth git-credential")));
  assert.ok(calls.some((call) => call[0] === "verify" && call[1] === "https://huangyingting.github.io/roomtone/"));
  assert.deepEqual(calls.at(-1), ["browser-url", "https://huangyingting.github.io/roomtone/"]);
  assert.ok(calls.some((call) => call.includes("push") && call.includes("https://github.com/huangyingting/roomtone.git")));
});
test("authorization failure aborts before repository or remote changes", async () => {
  const { calls, options } = harness({ unauthorized: true });
  await assert.rejects(publish(options), /gh auth login/);
  assert.ok(!calls.some((call) => call.includes("create") || call.includes("add") || call.includes("push")));
});
test("publication preserves unrelated origin and private repository settings", async () => {
  const conflicting = harness({ origin: "https://github.com/someone/another-project.git" });
  await assert.rejects(publish(conflicting.options), /another repository/);
  assert.ok(!conflicting.calls.some((call) => call.includes("add") || call.includes("push")));
  const privateRepo = harness({ repositoryExists: true, private: true });
  await assert.rejects(publish(privateRepo.options), /privacy settings have not been changed/);
  assert.ok(!privateRepo.calls.some((call) => call.includes("push")));
});
test("existing repositories publish without duplicate creation or Pages enablement", async () => {
  const { calls, options } = harness({ repositoryExists: true, pagesExists: true, origin: "https://github.com/huangyingting/roomtone.git" });
  await publish(options);
  assert.ok(!calls.some((call) => call.includes("create") || call.includes("POST")));
});
test("dirty or non-main worktrees fail before contacting GitHub", async () => {
  for (const overrides of [{ dirty: true }, { branch: "other" }]) {
    const { calls, options } = harness(overrides);
    await assert.rejects(publish(options), /Commit all changes|main branch/);
    assert.ok(!calls.some((call) => call[0] === "gh"));
  }
});
test("workflow permission and deployment failures cannot report publication success", async () => {
  for (const overrides of [{ workflowForbidden: true }, { failedWorkflow: true }]) {
    const { calls, options } = harness(overrides);
    await assert.rejects(publish(options), /Forbidden|Workflow failed/);
    assert.ok(!calls.some((call) => call[0] === "verify"));
  }
});
test("live browser failures prevent reporting a fully verified publication", async () => {
  const { options } = harness({ liveBrowserFailed: true });
  await assert.rejects(publish(options), /Live browser checks failed/);
});
test("delayed workflow registration retries only 404 responses", async () => {
  const { calls, options } = harness({ workflowDelayed: true });
  await publish(options);
  assert.equal(calls.filter((call) => call[0] === "gh" && call[1] === "workflow").length, 3);
});
test("a missing deployment run times out without claiming success", async () => {
  const { calls, options } = harness({ missingRun: true });
  await assert.rejects(publish(options), /did not appear within one minute/);
  assert.equal(calls.filter((call) => call[0] === "gh" && call[1] === "run" && call[2] === "list" && call.includes("workflow_dispatch")).length, 30);
  assert.ok(!calls.some((call) => call[0] === "verify"));
});
test("a fresh push run is reused instead of dispatching a competing deployment", async () => {
  const { calls, options } = harness({ pushRun: true });
  await publish(options);
  assert.ok(!calls.some((call) => call[0] === "gh" && call[1] === "workflow"));
  assert.ok(calls.some((call) => call[0] === "gh" && call[1] === "run" && call[2] === "watch" && call[3] === "456"));
});
test("an older push run cannot substitute for a new publication request", async () => {
  const { calls, options } = harness({ pushRun: true, stalePush: true });
  await publish(options);
  assert.ok(calls.some((call) => call[0] === "gh" && call[1] === "workflow"));
  assert.ok(calls.some((call) => call[0] === "gh" && call[1] === "run" && call[2] === "watch" && call[3] === "123"));
});
test("an unregistered push workflow falls back to the retryable manual dispatch", async () => {
  const { calls, options } = harness({ unregisteredPush: true });
  await publish(options);
  assert.ok(calls.some((call) => call[0] === "gh" && call[1] === "workflow"));
});
