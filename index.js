// Bitbison on Netlify: where a build's dependency changes stand, as
// `bitbison ci` says it, in the deploy's summary. The client is fetched from
// the organization's channel and checked against the channel's sums, as
// every CI system's step does, and runs as `bitbison ci` runs in any job:
// read-only by default, beside the repository's own CI, which asks for the
// grants and reviews; with `request`, it asks itself. It fails the deploy
// only where `fail_on` says a result should; what it cannot read it says,
// and the deploy goes on. The site's BITBISON_TOKEN, the organization's CI
// token, signs it in. Netlify installs the site's dependencies before any
// plugin runs, so the install goes through the organization's registry by
// the repository's .npmrc, never by this.
//
// Netlify reads every export of this file as one of the build's events:
// the rest is in model.js.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { arch, tmpdir } from "node:os";
import { join } from "node:path";
import { argsOf, headlineOf, inputsOf, runOf } from "./model.js";

const TITLE = "Bitbison";

// The client for this machine, from the organization's channel, checked against the channel's sums.
async function client(dir, org) {
  const machine = { x64: "x86_64", arm64: "aarch64" }[arch()] || arch();
  const base = `https://packages.bitbison.io/${org}/bitbison/latest/static/linux/${machine}`;
  const get = async (name) => {
    const answer = await fetch(`${base}/${name}`);
    if (!answer.ok) throw new Error(`the client's ${name} could not be fetched (${answer.status})`);
    return Buffer.from(await answer.arrayBuffer());
  };
  const [binary, sums] = await Promise.all([get("bitbison"), get("SHA256SUMS")]);
  const line = sums.toString("utf8").split("\n").map((l) => l.trim()).find((l) => /^[0-9a-f]{64} {2}bitbison$/.test(l));
  if (!line) throw new Error("the channel's sums name no client");
  if (createHash("sha256").update(binary).digest("hex") !== line.slice(0, 64)) throw new Error("the client is not the one the channel's sums name");
  const path = join(dir, "bitbison");
  writeFileSync(path, binary);
  chmodSync(path, 0o755);
  return path;
}

export const onPreBuild = async ({ utils, inputs }) => {
  const env = process.env;
  const given = inputsOf(inputs);
  if (!given.ok) return utils.status.show({ title: TITLE, summary: `Not checked: ${given.why}.` });
  const run = runOf(env, given.target);
  if (!env.BITBISON_TOKEN) return utils.status.show({ title: TITLE, summary: "Not checked: this site has no BITBISON_TOKEN." });
  if (!run) return utils.status.show({ title: TITLE, summary: "Not checked: this build names no pull request or branch." });
  const dir = mkdtempSync(join(tmpdir(), "bitbison-"));
  let failed = null;
  try {
    const bin = await client(dir, given.org);
    const summaryFile = join(dir, "summary.md");
    const result = spawnSync(bin, argsOf(given, summaryFile), {
      env: { ...env, ...run, BITBISON_URL: given.url },
      encoding: "utf8",
      timeout: given.request ? 600000 : 300000
    });
    if (result.stderr) console.error(result.stderr.trim());
    let doc = null;
    try { doc = JSON.parse(String(result.stdout || "").trim().split("\n").pop()); } catch { doc = null; }
    if (!doc) {
      const why = String(result.stderr || result.error?.message || "").trim().split("\n").pop() || `exit ${result.status}`;
      return utils.status.show({ title: TITLE, summary: `Not checked: ${why}` });
    }
    const markdown = existsSync(summaryFile) ? readFileSync(summaryFile, "utf8").trim() : String(doc.summary || "").trim();
    const headline = headlineOf(doc, Boolean(run.BITBISON_CI_PULL_REQUEST));
    console.log(`Bitbison: ${headline}`);
    if (markdown) console.log(markdown);
    utils.status.show({ title: TITLE, summary: headline, ...(markdown ? { text: markdown } : {}) });
    if (doc.failed === true) failed = `Bitbison: ${headline} (fail_on ${given.failOn})`;
  } catch (error) {
    return utils.status.show({ title: TITLE, summary: `Not checked: ${error.message}` });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // a result the site said fails the deploy, and nothing else, ends it
  if (failed) utils.build.failBuild(failed);
};
