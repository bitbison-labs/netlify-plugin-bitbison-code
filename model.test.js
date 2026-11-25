import { test } from "node:test";
import assert from "node:assert/strict";
import { argsOf, headlineOf, inputsOf, runOf } from "./model.js";

const ORG = "6b113bce-d1ad-4c85-a6d7-604372476230";

test("the inputs name the organization and its deployment; the rest has its defaults", () => {
  assert.deepEqual(inputsOf({ org: ORG, url: "https://acme.cloud.bitbison.io/" }),
    { ok: true, org: ORG, url: "https://acme.cloud.bitbison.io", target: "main", request: false, failOn: "never" });
  assert.equal(inputsOf({ org: ORG, url: "https://acme.cloud.bitbison.io", request: "true", fail_on: "denied", target: "master" }).request, true);
  assert.equal(inputsOf({ org: ORG, url: "https://acme.cloud.bitbison.io", fail_on: "sometimes" }).failOn, "never");
  for (const bad of [{}, { org: "acme", url: "https://x.io" }, { org: ORG, url: "http://x.io" }, { org: ORG, url: "https://x.io/path" }]) {
    assert.equal(inputsOf(bad).ok, false, JSON.stringify(bad));
  }
});

test("a deploy preview is its pull request, merging into the target; any other build a push of its branch", () => {
  const preview = runOf({ CONTEXT: "deploy-preview", REVIEW_ID: "3", BRANCH: "deps", REPOSITORY_URL: "https://github.com/acme/app" }, "main");
  assert.deepEqual(preview, { BITBISON_CI_REPOSITORY: "acme/app", BITBISON_CI_DEFAULT_BRANCH: "main", BITBISON_CI_TARGET: "main", BITBISON_CI_PULL_REQUEST: "3" });
  const production = runOf({ CONTEXT: "production", BRANCH: "main", REPOSITORY_URL: "git@github.com:acme/app.git" }, "main");
  assert.equal(production.BITBISON_CI_REF, "refs/heads/main");
  assert.equal(production.BITBISON_CI_REPOSITORY, "acme/app");
  assert.equal(runOf({ CONTEXT: "production" }, "main"), null);
});

test("it reads only, unless asked to request; its summary goes to a file the deploy summary shows", () => {
  assert.deepEqual(argsOf({ request: false, failOn: "never" }, "/tmp/s.md"), ["ci", "--read-only", "--fail-on", "never", "--json", "--summary", "/tmp/s.md"]);
  assert.deepEqual(argsOf({ request: true, failOn: "denied" }, "/tmp/s.md").slice(0, 4), ["ci", "--reviews", "--fail-on", "denied"]);
});

test("the summary's one line says what the check found", () => {
  assert.equal(headlineOf({ changes: 0 }, true), "The change adds or upgrades no direct dependency.");
  assert.equal(headlineOf({ changes: 0 }, false), "No direct dependency needs a decision.");
  assert.equal(headlineOf({ changes: 2, denied: 1 }, true), "1 direct dependency change(s) your organization has denied.");
  assert.equal(headlineOf({ changes: 2, uncovered: 2 }, true), "2 direct dependency change(s) wait on a person.");
  assert.equal(headlineOf({ changes: 3 }, true), "Every direct dependency change is covered.");
  assert.equal(headlineOf({ skipped: "Bitbison skipped: a fork" }, true), "Bitbison skipped: a fork");
});
