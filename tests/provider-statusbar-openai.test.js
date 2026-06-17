const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("module");
const path = require("path");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "vscode") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const extension = require(path.join(__dirname, "..", "extension.js"));
Module._load = originalLoad;

test("shows plain openai text in the bottom-right badge when provider is openai", () => {
  const state = extension.__test.buildProviderAwareLbUsageStatusState({
    providerId: "openai",
    hasPayload: true,
    remainingPercent: 53.9,
    lbLabel: "LB 10.100.0.246"
  });

  assert.equal(state.text, "openai");
  assert.equal(state.tooltip, "Current provider: openai");
  assert.equal(state.command, "codexProviderStatusbar.selectCodexLbRoute");
});

test("keeps lb usage text when the provider is not openai", () => {
  const state = extension.__test.buildProviderAwareLbUsageStatusState({
    providerId: "codex-lb",
    hasPayload: true,
    remainingPercent: 53.9,
    lbLabel: "LB 10.100.0.246"
  });

  assert.equal(state.text, "$(circle-filled) LB 10.100.0.246 53.9%");
  assert.equal(state.command, "codexProviderStatusbar.showCodexLbUsage");
});

test("does not restart the extension host after restoring codex-lb from the route selector", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "extension.js"), "utf8");
  const branchStart = source.indexOf('if (currentProviderId === "openai")');
  const branchEnd = source.indexOf('const choice = await vscode.window.showInformationMessage', branchStart);
  assert.notEqual(branchStart, -1);
  assert.notEqual(branchEnd, -1);

  const branchSource = source.slice(branchStart, branchEnd);
  assert.match(branchSource, /codex-lb-route-provider-restored-no-restart/);
  assert.doesNotMatch(branchSource, /workbench\.action\.restartExtensionHost/);
  assert.doesNotMatch(branchSource, /OPEN_SIDEBAR_AFTER_RESTART_KEY/);
});
