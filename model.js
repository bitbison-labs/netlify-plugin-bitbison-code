// What the Netlify plugin makes of a build, apart from index.js, which may
// export nothing but the build's events. Pure.

// The fail_on values bitbison ci takes.
export const FAIL_ON = ["never", "denied", "uncovered"];

// The plugin's inputs as it runs with them: the organization and the
// deployment named, the target branch, whether it asks for grants and
// reviews, when a result fails the deploy. `{ ok, why }` and the values.
export function inputsOf(inputs = {}) {
  const org = String(inputs.org || "").trim();
  const url = String(inputs.url || "").trim().replace(/\/+$/, "");
  const target = String(inputs.target || "main").trim();
  const request = inputs.request === true || inputs.request === "true";
  const failOn = FAIL_ON.includes(inputs.fail_on) ? inputs.fail_on : "never";
  if (!/^[0-9a-f-]{36}$/i.test(org)) return { ok: false, why: "the org input is not the organization's id" };
  if (!/^https:\/\/[^\s/]+$/i.test(url)) return { ok: false, why: "the url input is not a Bitbison deployment's address (https://…)" };
  return { ok: true, org, url, target, request, failOn };
}

// What the run is, as bitbison ci reads it: the client reads a Netlify build
// itself (NETLIFY, CONTEXT, REVIEW_ID, BRANCH, REPOSITORY_URL) but for the
// branch a deploy preview's pull request merges into, which Netlify does not
// name, so it is told that (and the default branch, for a client that reads
// only BITBISON_CI_* variables). Null for a build that names neither.
export function runOf(env, target) {
  const repository = String(env.REPOSITORY_URL || "").replace(/\.git$/, "").match(/[/:]([^/:]+\/[^/]+)$/)?.[1] || "";
  const common = { BITBISON_CI_REPOSITORY: repository, BITBISON_CI_DEFAULT_BRANCH: target, BITBISON_CI_TARGET: target };
  if (env.CONTEXT === "deploy-preview" && /^\d+$/.test(String(env.REVIEW_ID || ""))) return { ...common, BITBISON_CI_PULL_REQUEST: String(env.REVIEW_ID) };
  return env.BRANCH ? { ...common, BITBISON_CI_REF: `refs/heads/${env.BRANCH}` } : null;
}

// The arguments bitbison ci is run with.
export const argsOf = ({ request, failOn }, summaryFile) => [
  "ci", ...(request ? ["--reviews"] : ["--read-only"]), "--fail-on", failOn, "--json", "--summary", summaryFile
];

// The summary's one line, from what the check found.
export function headlineOf(doc, change) {
  if (doc.skipped) return doc.skipped;
  const n = (key) => Number(doc[key]) || 0;
  if (n("changes") === 0) return change ? "The change adds or upgrades no direct dependency." : "No direct dependency needs a decision.";
  if (n("denied") > 0) return `${n("denied")} direct dependency change(s) your organization has denied.`;
  if (n("uncovered") > 0) return `${n("uncovered")} direct dependency change(s) wait on a person.`;
  return "Every direct dependency change is covered.";
}
