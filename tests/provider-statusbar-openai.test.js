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
    lbLabel: "LB local"
  });

  assert.equal(state.text, "openai");
  assert.equal(state.tooltip, "Current provider: openai");
  assert.equal(state.command, "codexProviderStatusbar.selectCodexLbRoute");
});

test("keeps lb usage text and opens the route picker when the provider is not openai", () => {
  const state = extension.__test.buildProviderAwareLbUsageStatusState({
    providerId: "codex-lb",
    hasPayload: true,
    remainingPercent: 53.9,
    lbLabel: "LB local"
  });

  assert.equal(state.text, "$(circle-filled) LB local 53.9%");
  assert.equal(state.command, "codexProviderStatusbar.selectCodexLbRoute");
});

test("shows active-account remaining beside the all-account lb usage", () => {
  const state = extension.__test.buildProviderAwareLbUsageStatusState({
    providerId: "codex-lb",
    hasPayload: true,
    remainingPercent: 57.6,
    activeRemainingPercent: 42,
    lbLabel: "HR"
  });

  assert.equal(state.text, "$(circle-filled) HR 57.6% Act 42%");
  assert.equal(
    state.accessibilityLabel,
    "Codex HR usage tokens 57.6% all accounts remaining, 42% active accounts remaining"
  );
});

test("extracts all-account and active-account remaining values from the weekly payload", () => {
  const payload = {
    remaining_percent: 22.4,
    all_accounts_remaining_percent: 57.6,
    active_accounts_remaining_percent: 42
  };

  assert.equal(extension.__test.getCodexLbAllAccountsRemainingPercent(payload), 57.6);
  assert.equal(extension.__test.getCodexLbActiveAccountsRemainingPercent(payload), 42);
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

test("opens the Codex sidebar for blank or activation-layout eligible remote windows", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "extension.js"), "utf8");
  const functionStart = source.indexOf("async function maybeOpenSidebarAfterRestart");
  const functionEnd = source.indexOf("async function prepareCodexOnlyLayout", functionStart);
  assert.notEqual(functionStart, -1);
  assert.notEqual(functionEnd, -1);

  const functionSource = source.slice(functionStart, functionEnd);
  assert.match(functionSource, /blankWindowFallbackEligible/);
  assert.match(functionSource, /activationLayoutEligible/);
  assert.match(functionSource, /Boolean\(shouldOpen\) \|\| blankWindowFallbackEligible \|\| activationLayoutEligible/);
  assert.match(functionSource, /prepareCodexOnlyLayout\([\s\S]*"post-restart-sidebar-open"[\s\S]*keepAuxiliaryBar: true/);
});

test("keeps the auxiliary bar open during Codex sidebar auto-open", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "extension.js"), "utf8");
  const functionStart = source.indexOf("async function prepareCodexOnlyLayout");
  const functionEnd = source.indexOf("async function maybeCloseAuxiliaryBarOnActivate", functionStart);
  assert.notEqual(functionStart, -1);
  assert.notEqual(functionEnd, -1);

  const functionSource = source.slice(functionStart, functionEnd);
  assert.match(functionSource, /options = \{\}/);
  assert.match(functionSource, /options\.keepAuxiliaryBar/);
  assert.match(functionSource, /codex-only-layout-close-auxiliary-bar-skipped/);
  assert.match(functionSource, /\["workbench\.action\.closePanel"\]/);
});

test("defaults Codex sidebar auto-open to enabled in package metadata", () => {
  const pkg = require(path.join(__dirname, "..", "package.json"));
  assert.equal(pkg.version, "0.2.8");
  assert.equal(
    pkg.contributes.configuration.properties["codexProviderStatusbar.autoOpenCodexSidebar"].default,
    true
  );
});

test("builds a clean Stable extension profile with only OpenAI Codex and Codex Session Tools", () => {
  const entries = extension.__test.buildCleanStableExtensionProfileEntries("/home/test");

  assert.deepEqual(
    entries.map((entry) => `${entry.identifier.id}@${entry.version}`),
    ["openai.chatgpt@26.623.42026", "oll4com.codex-session-tools@0.2.8"]
  );
  assert.equal(
    entries[0].relativeLocation,
    "openai.chatgpt-26.623.42026-linux-x64"
  );
  assert.equal(
    entries[1].relativeLocation,
    "oll4com.codex-session-tools-0.2.8"
  );
});

test("restore clean install command reports visible progress and modal completion", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "extension.js"), "utf8");
  const functionStart = source.indexOf("async function restoreCleanVsCodeCodexInstallCommand");
  const functionEnd = source.indexOf("async function openQuickActions", functionStart);
  assert.notEqual(functionStart, -1);
  assert.notEqual(functionEnd, -1);

  const functionSource = source.slice(functionStart, functionEnd);
  assert.match(functionSource, /outputChannel\.show\(true\)/);
  assert.match(functionSource, /Restore clean VS Code\/Codex state: starting/);
  assert.match(functionSource, /Restore clean VS Code\/Codex state: complete/);
  assert.match(functionSource, /showInformationMessage\([\s\S]*\{ modal: true \}/);
  assert.match(functionSource, /Show Log/);
});

test("puts restore clean install first in the Codex view title and keeps repair demoted", () => {
  const pkg = require(path.join(__dirname, "..", "package.json"));
  const viewTitle = pkg.contributes.menus["view/title"];
  const codexViewItems = viewTitle.filter((item) => String(item.when || "").includes("chatgpt.sidebar"));

  assert.equal(codexViewItems[0].command, "codexProviderStatusbar.restoreCleanCodexInstall");
  assert.equal(codexViewItems[0].group, "navigation@0");
  assert.equal(codexViewItems[1].command, "codexProviderStatusbar.clearVsCodeLogs");
  assert.equal(codexViewItems[1].group, "navigation@1");
  assert.equal(codexViewItems[2].command, "codexProviderStatusbar.cleanupStaleCodexProcesses");
  assert.equal(codexViewItems[2].group, "navigation@1.5");
  assert.equal(
    viewTitle.some((item) => item.command === "codexProviderStatusbar.repairCodexSqliteState"),
    false
  );
  assert.equal(
    pkg.contributes.menus.commandPalette.some((item) => item.command === "codexProviderStatusbar.repairCodexSqliteState"),
    true
  );
  assert.equal(
    pkg.contributes.menus.commandPalette.some((item) => item.command === "codexProviderStatusbar.clearVsCodeLogs"),
    true
  );
  assert.equal(
    pkg.contributes.menus.commandPalette.some((item) => item.command === "codexProviderStatusbar.cleanupStaleCodexProcesses"),
    true
  );
});

test("clear VS Code logs command is backup-first and visibly confirmed", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "extension.js"), "utf8");
  const functionStart = source.indexOf("async function clearVsCodeServerLogsCommand");
  const functionEnd = source.indexOf("async function restoreCleanVsCodeCodexInstallCommand", functionStart);
  assert.notEqual(functionStart, -1);
  assert.notEqual(functionEnd, -1);

  const functionSource = source.slice(functionStart, functionEnd);
  assert.match(functionSource, /VSCODE_SERVER_LOGS_RELATIVE_PATH/);
  assert.match(functionSource, /isSafeVsCodeServerLogsPath/);
  assert.match(functionSource, /showWarningMessage\([\s\S]*\{ modal: true \}/);
  assert.match(functionSource, /copyPathToBackup\(logsRoot, backupRoot\)/);
  assert.match(functionSource, /clearVsCodeServerLogFilesInPlace\(logsRoot\)/);
  assert.doesNotMatch(functionSource, /movePathToBackup\(logsRoot, backupRoot\)/);
  assert.match(functionSource, /clear-vscode-logs-complete/);
});

test("clear VS Code logs helper truncates files in place and preserves directories", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(__dirname, "tmp-vscode-logs-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const nestedDir = path.join(tempRoot, "window1", "exthost1");
  fs.mkdirSync(nestedDir, { recursive: true });
  const firstLog = path.join(tempRoot, "main.log");
  const nestedLog = path.join(nestedDir, "Codex.log");
  const symlinkPath = path.join(tempRoot, "latest-link");
  fs.writeFileSync(firstLog, "active log data");
  fs.writeFileSync(nestedLog, "renderer startup data");
  try {
    fs.symlinkSync(firstLog, symlinkPath);
  } catch {
    // Symlinks are not always available in every test environment.
  }

  const result = await extension.__test.clearVsCodeServerLogFilesInPlace(tempRoot);

  assert.equal(result.truncatedFiles, 2);
  assert.equal(fs.existsSync(tempRoot), true);
  assert.equal(fs.existsSync(nestedDir), true);
  assert.equal(fs.statSync(firstLog).size, 0);
  assert.equal(fs.statSync(nestedLog).size, 0);
  assert.equal(
    fs.existsSync(symlinkPath) ? fs.lstatSync(symlinkPath).isSymbolicLink() : true,
    true
  );
});

test("stale Codex process cleanup only targets orphaned safe processes", () => {
  const plan = extension.__test.buildStaleCodexProcessCleanupPlan([
    {
      pid: 10,
      ppid: 1,
      stat: "Sl",
      ageSeconds: 5000,
      command: "/home/test/.vscode-server/extensions/openai.chatgpt-1/bin/linux-x86_64/codex app-server --analytics-default-enabled"
    },
    {
      pid: 20,
      ppid: 21,
      stat: "Sl",
      ageSeconds: 5000,
      command: "/home/test/.vscode-server/extensions/openai.chatgpt-1/bin/linux-x86_64/codex app-server --analytics-default-enabled"
    },
    {
      pid: 21,
      ppid: 1,
      stat: "Sl",
      ageSeconds: 5000,
      command: "/home/test/.vscode-server/server/node --type=extensionHost"
    },
    {
      pid: 30,
      ppid: 1,
      stat: "Sl",
      ageSeconds: 5000,
      command: "/home/test/.vscode-server/extensions/openai.chatgpt-1/bin/linux-x86_64/codex app-server --analytics-default-enabled"
    },
    {
      pid: 31,
      ppid: 30,
      stat: "Ss",
      ageSeconds: 300,
      command: "bash /home/proxmoxusr/agent-workspace/active/run_olla_sitewide_upscale_fixed.sh"
    },
    {
      pid: 40,
      ppid: 1,
      stat: "Sl",
      ageSeconds: 5000,
      command: "/usr/bin/node /home/proxmoxusr/mcp-servers/olla/server.js"
    },
    {
      pid: 50,
      ppid: 51,
      stat: "Sl",
      ageSeconds: 5000,
      command: "/usr/bin/node /home/proxmoxusr/mcp-servers/capturelab/server.js"
    },
    {
      pid: 51,
      ppid: 52,
      stat: "Sl",
      ageSeconds: 5000,
      command: "/home/test/.vscode-server/extensions/openai.chatgpt-1/bin/linux-x86_64/codex app-server --analytics-default-enabled"
    },
    {
      pid: 52,
      ppid: 1,
      stat: "Sl",
      ageSeconds: 5000,
      command: "/home/test/.vscode-server/server/node --type=extensionHost"
    }
  ]);

  assert.deepEqual(
    plan.candidates.map((entry) => entry.pid),
    [10, 40]
  );
  assert.equal(plan.skipped.find((entry) => entry.pid === 20).reason, "parent-extension-host-alive");
  assert.equal(plan.skipped.find((entry) => entry.pid === 30).reason, "active-child-processes");
  assert.equal(plan.skipped.find((entry) => entry.pid === 50).reason, "parent-app-server-alive");
});

test("removes Codex restore-sensitive VS Code settings without touching unrelated keys", () => {
  const cleaned = extension.__test.cleanRestoreSensitiveSettings({
    "window.logLevel": "error",
    "chatgpt.openOnStartup": false,
    "codexProviderStatusbar.autoOpenCodexSidebar": false,
    "codexProviderStatusbar.rotationShowStatusBarItem": false,
    "github.copilot.chat.cloudAgent.enabled": false
  });

  assert.deepEqual(cleaned, {
    "window.logLevel": "error",
    "github.copilot.chat.cloudAgent.enabled": false
  });
});

test("normalizes the official OpenAI Codex manifest keys touched by prior local patches", () => {
  const normalized = extension.__test.normalizeOpenAiCodexManifest({
    activationEvents: ["onCommand:chatgpt.openSidebar"],
    contributes: {
      views: {
        codexViewContainer: [
          { id: "chatgpt.sidebarView", when: "false" }
        ],
        codexSecondaryViewContainer: [
          { id: "chatgpt.sidebarSecondaryView", when: "false" }
        ]
      },
      chatSessions: []
    }
  });

  assert.deepEqual(normalized.activationEvents, ["onStartupFinished", "onUri"]);
  assert.equal(
    normalized.contributes.views.codexViewContainer[0].when,
    "chatgpt.doesNotSupportSecondarySidebar"
  );
  assert.equal(
    normalized.contributes.views.codexSecondaryViewContainer[0].when,
    "!chatgpt.doesNotSupportSecondarySidebar"
  );
  assert.deepEqual(normalized.contributes.chatSessions, [
    {
      type: "openai-codex",
      name: "Codex",
      displayName: "OpenAI Codex",
      description: "OpenAI Codex integration for VS Code"
    }
  ]);
});
