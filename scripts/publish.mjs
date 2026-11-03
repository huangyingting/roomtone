import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class CommandError extends Error {
  constructor(command, args, error) {
    super(`${command} ${args.join(" ")} failed:\n${error.stderr || error.stdout || error.message}`);
    this.stderr = String(error.stderr || "");
  }
}
function execute(command, args, options = {}) {
  try { return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: options.env || process.env }).trim(); }
  catch (error) { throw new CommandError(command, args, error); }
}
function optionalApi(run, path) {
  try { return JSON.parse(run("gh", ["api", path])); }
  catch (error) {
    if (error instanceof CommandError && /\bHTTP 404\b/.test(error.stderr)) return null;
    throw error;
  }
}
function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`GitHub returned invalid ${name} metadata.`);
  return value;
}
const wait = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
async function verifyUrl(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Live Pages request failed with HTTP ${response.status}: ${url}`);
  const html = await response.text();
  if (!html.includes("Roomtone") || !html.includes("/_next/static/")) throw new Error(`The live URL does not contain the Roomtone application: ${url}`);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  if (!scripts.length) throw new Error("The live site has no application JavaScript.");
  await Promise.all(scripts.map(async (src) => {
    const assetUrl = new URL(src, url);
    if (assetUrl.origin !== new URL(url).origin) throw new Error(`Unexpected external application asset: ${assetUrl}`);
    const asset = await fetch(assetUrl, { signal: AbortSignal.timeout(15_000) });
    if (!asset.ok || !/javascript/.test(asset.headers.get("content-type") || "")) throw new Error(`Application JavaScript is unavailable: ${assetUrl}`);
  }));
}

export async function publish({
  run = execute,
  verify = verifyUrl,
  sleep = wait,
  log = console.log,
  now = () => new Date(),
  repositoryName = "roomtone",
} = {}) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(repositoryName) || repositoryName === "." || repositoryName === "..") throw new Error("Use a valid GitHub repository name.");
  if (run("git", ["branch", "--show-current"]) !== "main") throw new Error("Publication requires the main branch.");
  if (run("git", ["status", "--porcelain"])) throw new Error("Commit all changes before publishing.");
  const commit = run("git", ["rev-parse", "HEAD"]);
  let owner;
  try { owner = run("gh", ["api", "user", "--jq", ".login"]); }
  catch (error) {
    if (error instanceof CommandError && /HTTP 401|gh auth login|not logged into/.test(error.stderr)) throw new Error(`GitHub authorization is required. Run gh auth login, then npm run publish.\n${error.message}`);
    throw error;
  }
  if (!/^[a-zA-Z0-9-]+$/.test(owner)) throw new Error("GitHub did not return a valid account name.");
  const repository = `${owner}/${repositoryName}`;
  const remote = `https://github.com/${repository}.git`;
  const origin = run("git", ["remote"]).split("\n").includes("origin")
    ? run("git", ["remote", "get-url", "--push", "origin"])
    : null;
  if (origin && origin !== remote && origin !== `git@github.com:${repository}.git`) throw new Error(`Origin points to another repository (${origin}). It has not been changed.`);

  const existing = optionalApi(run, `repos/${repository}`);
  if (existing) {
    const metadata = requireRecord(existing, "repository");
    if (metadata.private !== false) throw new Error("The destination repository is private. Choose a public repository; privacy settings have not been changed.");
    if (metadata.permissions?.admin !== true) throw new Error("Repository administration permission is required to configure Pages.");
  } else {
    log(`Creating public repository ${repository}…`);
    run("gh", ["repo", "create", repository, "--public", "--description", "A relaxing 3D home builder using Next.js and Three.js."]);
  }
  if (!origin) run("git", ["remote", "add", "origin", remote]);
  log("Pushing the verified application…");
  // Use the authorized CLI credential helper without changing global Git configuration.
  run("git", ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", "push", "-u", remote, "main"]);
  const pages = optionalApi(run, `repos/${repository}/pages`);
  if (!pages) run("gh", ["api", "--method", "POST", `repos/${repository}/pages`, "-f", "build_type=workflow"]);
  else if (requireRecord(pages, "Pages").build_type !== "workflow") run("gh", ["api", "--method", "PUT", `repos/${repository}/pages`, "-f", "build_type=workflow"]);
  const dispatchedAfter = Math.floor(now().getTime() / 1000) * 1000;
  let dispatched = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      run("gh", ["workflow", "run", "pages.yml", "--repo", repository, "--ref", "main"]);
      dispatched = true;
      break;
    } catch (error) {
      if (!(error instanceof CommandError) || !/\bHTTP 404\b/.test(error.stderr)) throw error;
      await sleep(2000);
    }
  }
  if (!dispatched) throw new Error("GitHub has not registered the Pages workflow yet. Run npm run publish again.");
  let runId;
  for (let attempt = 0; attempt < 30; attempt++) {
    const runs = JSON.parse(run("gh", ["run", "list", "--repo", repository, "--workflow", "pages.yml", "--commit", commit, "--event", "workflow_dispatch", "--limit", "5", "--json", "databaseId,createdAt"]));
    if (!Array.isArray(runs)) throw new Error("GitHub returned an invalid workflow-run list.");
    const workflow = runs.find((entry) => Number.isInteger(entry.databaseId) && Date.parse(entry.createdAt) >= dispatchedAfter);
    if (workflow) { runId = workflow.databaseId; break; }
    await sleep(2000);
  }
  if (!runId) throw new Error("The deployment run did not appear within one minute. Check gh run list.");
  log(`Waiting for Pages workflow ${runId}…`);
  run("gh", ["run", "watch", String(runId), "--repo", repository, "--exit-status"]);
  const deployed = requireRecord(JSON.parse(run("gh", ["api", `repos/${repository}/pages`])), "Pages");
  if (typeof deployed.html_url !== "string" || !deployed.html_url.startsWith("https://")) throw new Error("GitHub did not return an HTTPS Pages URL.");
  await verify(deployed.html_url);
  log("Exercising the live site in Chromium…");
  run("npm", ["run", "test:e2e"], { env: { ...process.env, PLAYWRIGHT_BASE_URL: deployed.html_url } });
  log(`Published and verified: ${deployed.html_url}`);
  return deployed.html_url;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (resolve(process.cwd()) !== resolve(root)) {
    console.error("Run npm run publish from the Roomtone repository root.");
    process.exitCode = 1;
  } else {
    publish({ repositoryName: process.argv[2] || "roomtone" }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
