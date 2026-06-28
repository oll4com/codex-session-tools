"use strict";

const fsSync = require("fs");
const fs = require("fs/promises");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const vscode = require("vscode");
const {
  DEFAULTS,
  buildUpdatedConfigText,
  detectProviderInfo,
  readConfigText,
  writeConfigText
} = require("./config-editor");

const OPEN_SIDEBAR_AFTER_RESTART_KEY = "openSidebarAfterRestart";
const DEBUG_LOG_NAME = "provider-statusbar.log";
const REMOTE_SESSION_BOOTSTRAP_TRACE_NAME = "remote-session-bootstrap.json";
const REMOTE_SESSION_BOOTSTRAP_MAX_AGE_MS = 10 * 60 * 1000;
const REMOTE_SESSION_BOOTSTRAP_ALIAS_MAX_AGE_MS = 2 * 60 * 1000;
const REMOTE_SESSION_BOOTSTRAP_SAMPLE_DELAYS_MS = [0, 1500, 5000, 12000];
const STATUSBAR_ROTATION_METRICS_TIMEOUT_MS = 2500;
const STATUSBAR_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REMOTE_SESSION_HEARTBEAT_INTERVAL_MS = 60 * 1000;
const REMOTE_SESSION_LIVE_TIMEOUT_MS = 15 * 60 * 1000;
const REMOTE_SESSION_PENDING_TIMEOUT_MS = 3 * 60 * 1000;
const APP_SERVER_TERMINATION_TIMEOUT_MS = 5000;
const STALE_CODEX_PROCESS_SCAN_TIMEOUT_MS = 8000;
const STALE_CODEX_PROCESS_TERM_GRACE_MS = 900;
const STALE_CODEX_PROCESS_KILL_GRACE_MS = 400;
const ROTATION_LAST_TARGET_KEY = "rotationLastTargetAccount";
const ROTATION_LAST_CURRENT_KEY = "rotationLastCurrentAccount";
const ROTATION_LAST_LOGOUT_AT_KEY = "rotationLastLogoutAt";
const CODEX_AUTH_FILE = path.join(os.homedir(), ".codex", "auth.json");
const VSCODE_GITHUB_AUTH_PROVIDER_ID = "github";
const VSCODE_GITHUB_SESSION_SCOPE_CANDIDATES = [
  ["user:email"],
  ["read:user", "user:email"]
];
const DEFAULT_ROTATION_AUTH_SNAPSHOTS_DIR = path.join(os.homedir(), ".codex", ".codex-provider-statusbar", "accounts");
const LEGACY_ROTATION_AUTH_SNAPSHOTS_DIR = path.join(os.homedir(), ".codex", ".codex-account", "accounts");
const LEGACY_ROTATION_AUTH_ROOT_DIR = path.join(os.homedir(), ".codex");
const ROTATION_AUTH_SNAPSHOT_FILE_SUFFIX = ".auth.json";
const DEFAULT_ROTATION_USAGE_HOST_ALIAS = "codex-usage-host";
const DEFAULT_ROTATION_USAGE_ACCOUNTS_PATH = "$HOME/.codex/codex-usage/accounts.json";
const DEFAULT_ROTATION_USAGE_CACHE_PATH = "$HOME/.codex/codex-usage/usage-cache.json";
const DEFAULT_SSH_TIMEOUT_MS = 8000;
const REMOTE_SESSION_ACTIVITY_TIMEOUT_MS = 1800;
const DEFAULT_CODEX_LOGOUT_TIMEOUT_MS = 20000;
const FALLBACK_ENV_PATH = path.join(os.homedir(), ".config", "codex-provider.env");
const CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const CODEX_STATE_ROOT_DIR = path.join(os.homedir(), ".codex");
const CODEX_STATE_DB_NAME_PATTERN = /^state_(\d+)\.sqlite$/i;
const CODEX_SESSION_INDEX_PATH = path.join(os.homedir(), ".codex", "session_index.jsonl");
const CODEX_SESSIONS_ROOT_DIR = path.join(CODEX_STATE_ROOT_DIR, "sessions");
const CODEX_SHELL_SNAPSHOTS_DIR = path.join(CODEX_STATE_ROOT_DIR, "shell_snapshots");
const DEFAULT_SQLITE_TIMEOUT_MS = 8000;
const CODEX_SQLITE_REPAIR_DB_NAMES = [
  "state_5.sqlite",
  "logs_2.sqlite",
  "goals_1.sqlite",
  "memories_1.sqlite"
];
const CODEX_SQLITE_REPAIR_SIDECAR_SUFFIXES = [".sqlite-wal", ".sqlite-shm"];
const CODEX_SQLITE_REPAIR_DOCTOR_TIMEOUT_MS = 45000;
const CODEX_THREAD_RECORDER_REPAIR_TIMEOUT_MS = 8000;
const CODEX_THREAD_RECORDER_REPAIR_FILE_PATTERN = /^rollout-.*\.jsonl$/;
const REMOTE_SESSION_KNOWN_ALIASES_KEY = "remoteSessionKnownAliases";
const REMOTE_SESSION_FALLBACK_LAST_TARGET_KEY = "remoteSessionFallbackLastTarget";
const REMOTE_SESSION_ALIAS_ORDER_VERSION_KEY = "remoteSessionAliasOrderVersion";
const REMOTE_SESSION_ALIAS_ORDER_RESET_AT_KEY = "remoteSessionAliasOrderResetAt";
const REMOTE_SESSION_LIVE_ALIASES_KEY = "remoteSessionLiveAliases";
const REMOTE_SESSION_WORKSPACE_ALIAS_KEY = "remoteSessionWorkspaceAlias";
const REMOTE_SESSION_WORKSPACE_ALIAS_SOURCE_KEY = "remoteSessionWorkspaceAliasSource";
const REMOTE_SESSION_WORKSPACE_ALIAS_STRONG_KEY = "remoteSessionWorkspaceAliasStrong";
const REMOTE_SESSION_LANE_ID_KEY = "remoteSessionLaneId";
const REMOTE_SESSION_LANE_REMOTE_ALIAS_KEY = "remoteSessionLaneRemoteAlias";
const REMOTE_SESSION_LANE_EXPECTED_PATH_KEY = "remoteSessionLaneExpectedPath";
const REMOTE_SESSION_LANE_EXPECTED_BRANCH_KEY = "remoteSessionLaneExpectedBranch";
const REMOTE_SESSION_LANE_ROLE_KEY = "remoteSessionLaneRole";
const REMOTE_SESSION_LANE_MANIFEST_PATH_KEY = "remoteSessionLaneManifestPath";
const REMOTE_SESSION_ALIAS_REGISTRY_DIR = "remote-session-aliases";
const REMOTE_SESSION_ALIAS_ORDER_VERSION = "remote-alias-source-trust-20260424";
const DEFAULT_REMOTE_SESSION_PRESENCE_ALIAS = "";
const DEFAULT_REMOTE_SESSION_PRESENCE_DIR = "/var/tmp/codex-session-tools/ssh-sessions";
const REMOTE_SESSION_PRESENCE_SYNC_TIMEOUT_MS = 5000;
const REMOTE_SESSION_PRESENCE_SYNC_MIN_INTERVAL_MS = 20 * 1000;
const STATUSBAR_LAST_ACCOUNT_ID_KEY = "statusBarLastAccountId";
const DEFAULT_REMOTE_SESSION_ALIAS = "codex-dev";
const DEFAULT_REMOTE_SESSION_PATH = "/etc";
const DEFAULT_REMOTE_SESSION_MAX_INDEX = 7;
const DEFAULT_CODER_ROOMS_LANE_MANIFEST_PATH = path.join(
  os.homedir(),
  "agent-workspace",
  "active",
  "coder-rooms-lanes.json"
);
const COMMAND_CHAIN_STEP_DELAY_MS = 60;
const CODEX_LAYOUT_SETTLE_DELAYS_MS = [250, 1600, 4500];
const SCREEN_CAPTURE_DIR_NAME = "codex-screen-captures";
const DEFAULT_CODEX_LB_PROXY_BASE_URL = "http://127.0.0.1:2458";
const DEFAULT_CODEX_LB_DASHBOARD_URL = "http://127.0.0.1:2455/dashboard";
const DEFAULT_CODEX_LB_PRIMARY_BASE_URL = "http://127.0.0.1:2455";
const DEFAULT_CODEX_LB_FALLBACK_BASE_URL = "";
const DEFAULT_CODEX_LB_HEADROOM_BASE_URL = "";
const DEFAULT_CODEX_LB_ROUTE_STATE_PATH = path.join(os.homedir(), ".config", "codex-lb-vscode-route.json");
const DEFAULT_CODEX_LB_PROVIDER_ENV_PATH = path.join(os.homedir(), ".config", "codex-lb-provider.env");
const DEFAULT_CODEX_LB_MODEL_CACHE_REFRESHER_PATH = path.join(os.homedir(), "scripts", "codex_lb_refresh_model_cache.js");
const DEFAULT_CODEX_LB_ROUTE_SELECTOR_PATH = path.join(os.homedir(), ".local", "bin", "codex-lb-vscode-select");
const CODEX_LB_MODEL_CACHE_STATE_PATH = path.join(
  os.homedir(),
  ".local",
  "state",
  "codex-lb-model-cache-refresh.json"
);
const CODEX_LB_LAST_MODEL_STATE_PATH = path.join(
  os.homedir(),
  ".local",
  "state",
  "codex-lb-last-model.json"
);
const CODEX_LB_USAGE_REFRESH_INTERVAL_MS = 30 * 1000;
const CODEX_LB_FETCH_TIMEOUT_MS = 8 * 1000;
const FORCE_HIDE_PROVIDER_STATUS_BAR_ITEMS = true;
const CLEAN_STABLE_OPENAI_EXTENSION_REL = "openai.chatgpt-26.623.42026-linux-x64";
const CLEAN_STABLE_CUSTOM_EXTENSION_REL = "oll4com.codex-session-tools-0.2.8";
const CLEAN_STABLE_OPENAI_VERSION = "26.623.42026";
const CLEAN_STABLE_CUSTOM_VERSION = "0.2.8";
const CLEAN_OPENAI_CODEX_CHAT_SESSIONS = [
  {
    type: "openai-codex",
    name: "Codex",
    displayName: "OpenAI Codex",
    description: "OpenAI Codex integration for VS Code"
  }
];
const RESTORE_SENSITIVE_SETTING_KEYS = new Set(["chatgpt.openOnStartup"]);
const RESTORE_SENSITIVE_SETTING_PREFIXES = ["codexProviderStatusbar."];
const CLEAN_RESTORE_STALE_EXTENSION_PATTERNS = [
  /^openai\.chatgpt-(?!26\.623\.42026-linux-x64$).+/i,
  /^oll4com\.codex-session-tools-(?!0\.2\.8$).+/i,
  /^sst-dev\.opencode-.+/i,
  /^codium\.codium-.+/i,
  /^anthropic\.claude-code-.+/i,
  /^kilocode\.kilo-code-.+/i
];
const CLEAN_RESTORE_STALE_CACHE_RELATIVE_PATHS = [
  path.join("data", "CachedExtensionVSIXs", "sst-dev.opencode-0.0.13"),
  path.join("data", "CachedExtensionVSIXs", "openai.chatgpt-26.5623.42026-linux-x64"),
  path.join("data", "CachedExtensionVSIXs", "codium.codium-2.2.4"),
  path.join("data", "CachedExtensionVSIXs", ".trash", "codium.codium-2.2.4.sigzip"),
  path.join("data", "CachedExtensionVSIXs", ".trash", "openai.chatgpt-26.5623.42026-linux-x64.sigzip")
];
const VSCODE_SERVER_LOGS_RELATIVE_PATH = path.join("data", "logs");

let currentRemoteSessionAlias = "";
let currentRemoteSessionAliasSource = "";
let openNextRemoteSessionInFlight = null;
let remoteSessionInstanceId = "";
let remoteSessionStartedAt = new Date().toISOString();
let lastRemoteSessionPresenceSyncAtMs = 0;
let lastRemoteSessionPresenceSyncSignature = "";
let remoteSessionPresenceSyncSuppressedAlias = "";
let remoteSessionPresenceSyncSuppressedMessage = "";
let lbUsageRefreshTimer = null;
let lbUsageStatusBarItem = null;
let lbUsageRefreshInFlight = false;
let lbUsageLastPayload = null;
let lbUsageLastError = "";
let lbUsageLastUpstream = "";
let lbStatusLastPayload = null;
let lbStatusLastError = "";
let lbModelCacheRefreshInFlight = false;
let lbModelCacheLastError = "";
let pendingOpenAiDirectLogin = null;
let openAiDirectLoginAllowedUntilMs = 0;

function execFileJsonSafe(command, args, timeoutMs = DEFAULT_SSH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = String(stderr || "").trim();
        reject(new Error(stderrText || error.message));
        return;
      }
      resolve({
        stdout: String(stdout || ""),
        stderr: String(stderr || "")
      });
    });
  });
}

function getLogPath(context) {
  return path.join(context.globalStorageUri.fsPath, DEBUG_LOG_NAME);
}

function getRemoteSessionBootstrapTracePath(context) {
  return path.join(context.globalStorageUri.fsPath, REMOTE_SESSION_BOOTSTRAP_TRACE_NAME);
}

function getRemoteSessionAliasRegistryDir(context) {
  return path.join(context.globalStorageUri.fsPath, REMOTE_SESSION_ALIAS_REGISTRY_DIR);
}

function getRemoteSessionAliasRegistryFilePath(context, alias) {
  return path.join(
    getRemoteSessionAliasRegistryDir(context),
    `${encodeURIComponent(String(alias || "").trim())}.json`
  );
}

function shellQuote(value) {
  return `'${String(value == null ? "" : value).replace(/'/g, `'\\''`)}'`;
}

function isMissingFileError(error) {
  return Boolean(error && typeof error === "object" && error.code === "ENOENT");
}

function looksLikeRemoteSessionAlias(candidate) {
  return /^codex-dev(?:\d+)?$/i.test(String(candidate || "").trim());
}

function isUsableCodexProjectPath(candidatePath) {
  const normalizedPath = String(candidatePath || "").trim();
  return Boolean(normalizedPath)
    && normalizedPath !== "/"
    && normalizedPath !== "~"
    && normalizedPath !== "/~";
}

function getWorkspaceFolderPaths() {
  return (vscode.workspace.workspaceFolders || [])
    .map((folder) => {
      if (!folder || !folder.uri) {
        return "";
      }
      return String(folder.uri.path || folder.uri.fsPath || "").trim();
    })
    .filter(Boolean);
}

function getCurrentWorkspaceProjectPath() {
  const workspacePath = getWorkspaceFolderPaths().find(isUsableCodexProjectPath);
  if (workspacePath) {
    return workspacePath;
  }

  const activeUri = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document
    ? vscode.window.activeTextEditor.document.uri
    : null;
  const activePath = activeUri ? String(activeUri.path || activeUri.fsPath || "").trim() : "";
  if (!activePath) {
    return "";
  }

  const activeDirectory = path.posix.dirname(activePath);
  return isUsableCodexProjectPath(activeDirectory) ? activeDirectory : "";
}

function normalizeComparableFsPath(candidatePath) {
  const normalizedPath = String(candidatePath || "").trim();
  if (!normalizedPath) {
    return "";
  }

  const resolvedPath = path.resolve(normalizedPath);
  if (resolvedPath === path.sep) {
    return resolvedPath;
  }

  return resolvedPath.replace(/[\\/]+$/, "");
}

function normalizeCoderRoomsLaneEntry(entry, manifestPath) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const laneId = String(entry.lane_id || entry.laneId || "").trim();
  const remoteAlias = String(entry.remote_alias || entry.remoteAlias || "").trim();
  const lanePath = normalizeComparableFsPath(entry.path);
  const expectedBranch = String(entry.expected_branch || entry.expectedBranch || entry.branch || "").trim();
  if (!laneId || !remoteAlias || !lanePath) {
    return null;
  }

  return {
    laneId,
    remoteAlias,
    path: lanePath,
    expectedPath: lanePath,
    branch: String(entry.branch || "").trim() || expectedBranch,
    expectedBranch,
    role: String(entry.role || "").trim(),
    roomId: String(entry.room_id || entry.roomId || "").trim(),
    parityStatus: String(entry.parity_status || entry.parityStatus || "").trim(),
    launchBlocked: Boolean(entry.launch_blocked || entry.launchBlocked),
    manifestPath: String(manifestPath || DEFAULT_CODER_ROOMS_LANE_MANIFEST_PATH).trim()
      || DEFAULT_CODER_ROOMS_LANE_MANIFEST_PATH
  };
}

async function readCoderRoomsLaneManifest() {
  const manifestPath = DEFAULT_CODER_ROOMS_LANE_MANIFEST_PATH;
  const manifest = await readJsonIfExists(manifestPath);
  const lanes = manifest && typeof manifest === "object" && Array.isArray(manifest.lanes)
    ? manifest.lanes
      .map((entry) => normalizeCoderRoomsLaneEntry(entry, manifestPath))
      .filter(Boolean)
    : [];

  return {
    manifestPath,
    lanes
  };
}

async function findCoderRoomLaneForCurrentWorkspace() {
  const workspaceProjectPath = normalizeComparableFsPath(getCurrentWorkspaceProjectPath());
  if (!workspaceProjectPath) {
    return null;
  }

  const manifest = await readCoderRoomsLaneManifest();
  return manifest.lanes.find((entry) => entry.path === workspaceProjectPath) || null;
}

function buildRemoteSessionLaneStateFromBootstrapTrace(trace) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    return null;
  }

  const laneId = String(trace.laneId || "").trim();
  const remoteAlias = String(trace.remoteAlias || trace.targetAlias || "").trim();
  const expectedPath = normalizeComparableFsPath(trace.expectedPath || trace.remotePath || "");
  if (!laneId || !remoteAlias || !expectedPath) {
    return null;
  }

  return {
    laneId,
    remoteAlias,
    expectedPath,
    expectedBranch: String(trace.expectedBranch || "").trim(),
    role: String(trace.role || "").trim(),
    manifestPath: String(trace.manifestPath || DEFAULT_CODER_ROOMS_LANE_MANIFEST_PATH).trim()
      || DEFAULT_CODER_ROOMS_LANE_MANIFEST_PATH
  };
}

async function persistRemoteSessionLaneState(context, outputChannel, laneState, source = "unknown") {
  if (!laneState || typeof laneState !== "object") {
    return null;
  }

  const nextState = {
    laneId: String(laneState.laneId || "").trim(),
    remoteAlias: String(laneState.remoteAlias || "").trim(),
    expectedPath: normalizeComparableFsPath(laneState.expectedPath || laneState.path || ""),
    expectedBranch: String(laneState.expectedBranch || laneState.branch || "").trim(),
    role: String(laneState.role || "").trim(),
    manifestPath: String(laneState.manifestPath || DEFAULT_CODER_ROOMS_LANE_MANIFEST_PATH).trim()
      || DEFAULT_CODER_ROOMS_LANE_MANIFEST_PATH
  };

  if (!nextState.laneId || !nextState.remoteAlias || !nextState.expectedPath) {
    return null;
  }

  const previousState = {
    laneId: String(context.workspaceState.get(REMOTE_SESSION_LANE_ID_KEY, "") || "").trim(),
    remoteAlias: String(context.workspaceState.get(REMOTE_SESSION_LANE_REMOTE_ALIAS_KEY, "") || "").trim(),
    expectedPath: normalizeComparableFsPath(context.workspaceState.get(REMOTE_SESSION_LANE_EXPECTED_PATH_KEY, "") || ""),
    expectedBranch: String(context.workspaceState.get(REMOTE_SESSION_LANE_EXPECTED_BRANCH_KEY, "") || "").trim(),
    role: String(context.workspaceState.get(REMOTE_SESSION_LANE_ROLE_KEY, "") || "").trim(),
    manifestPath: String(context.workspaceState.get(REMOTE_SESSION_LANE_MANIFEST_PATH_KEY, "") || "").trim()
  };

  const changed = previousState.laneId !== nextState.laneId
    || previousState.remoteAlias !== nextState.remoteAlias
    || previousState.expectedPath !== nextState.expectedPath
    || previousState.expectedBranch !== nextState.expectedBranch
    || previousState.role !== nextState.role
    || previousState.manifestPath !== nextState.manifestPath;
  if (!changed) {
    return nextState;
  }

  await context.workspaceState.update(REMOTE_SESSION_LANE_ID_KEY, nextState.laneId);
  await context.workspaceState.update(REMOTE_SESSION_LANE_REMOTE_ALIAS_KEY, nextState.remoteAlias);
  await context.workspaceState.update(REMOTE_SESSION_LANE_EXPECTED_PATH_KEY, nextState.expectedPath);
  await context.workspaceState.update(REMOTE_SESSION_LANE_EXPECTED_BRANCH_KEY, nextState.expectedBranch);
  await context.workspaceState.update(REMOTE_SESSION_LANE_ROLE_KEY, nextState.role);
  await context.workspaceState.update(REMOTE_SESSION_LANE_MANIFEST_PATH_KEY, nextState.manifestPath);
  await appendDebugLog(context, outputChannel, "remote-session-lane-state-updated", {
    source: String(source || "").trim() || "unknown",
    laneId: nextState.laneId,
    remoteAlias: nextState.remoteAlias,
    expectedPath: nextState.expectedPath,
    expectedBranch: nextState.expectedBranch || null,
    role: nextState.role || null,
    manifestPath: nextState.manifestPath,
    previousLaneId: previousState.laneId || null,
    previousRemoteAlias: previousState.remoteAlias || null,
    previousExpectedPath: previousState.expectedPath || null,
    previousExpectedBranch: previousState.expectedBranch || null
  });
  return nextState;
}

function isWorkspaceBackedRemoteSessionAliasSource(source) {
  const normalizedSource = normalizeRemoteSessionAliasSource(source);
  return normalizedSource === "workspace-state" || normalizedSource.startsWith("workspace-state:");
}

function detectHostnameRemoteSessionAlias() {
  const candidates = [
    os.hostname(),
    process.env.HOSTNAME || "",
    process.env.HOST || ""
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (looksLikeRemoteSessionAlias(normalized)) {
      return normalized;
    }
  }
  return "";
}

function getRemoteSessionWorkspaceStorageId(context) {
  if (!context || !context.storageUri || !context.storageUri.fsPath) {
    return "";
  }
  const parentDir = path.dirname(context.storageUri.fsPath);
  return path.basename(parentDir);
}

function getRemoteSessionInstanceId(context) {
  if (remoteSessionInstanceId) {
    return remoteSessionInstanceId;
  }
  const seed = [
    detectHostnameRemoteSessionAlias(),
    context && context.storageUri ? context.storageUri.fsPath : "",
    process.pid,
    remoteSessionStartedAt
  ].join("|");
  remoteSessionInstanceId = `codex-ssh-${crypto.createHash("sha1").update(seed).digest("hex").slice(0, 16)}`;
  return remoteSessionInstanceId;
}

function appendOutputChannelLine(outputChannel, line) {
  try {
    outputChannel.appendLine(line);
  } catch {
    // The extension host can close the channel while a window reload is already in flight.
  }
}

async function appendDebugLog(context, outputChannel, event, payload = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    payload
  });

  appendOutputChannelLine(outputChannel, line);

  try {
    await fs.mkdir(context.globalStorageUri.fsPath, { recursive: true });
    await fs.appendFile(getLogPath(context), line + "\n", "utf8");
  } catch (error) {
    appendOutputChannelLine(
      outputChannel,
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "debug-log-write-failed",
        payload: {
          message: error instanceof Error ? error.message : String(error)
        }
      })
    );
  }
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildCleanStableExtensionProfileEntries(homeDir = os.homedir(), installedTimestamp = Date.now()) {
  const extensionsDir = path.join(homeDir, ".vscode-server", "extensions");
  const openAiPath = path.join(extensionsDir, CLEAN_STABLE_OPENAI_EXTENSION_REL);
  const customPath = path.join(extensionsDir, CLEAN_STABLE_CUSTOM_EXTENSION_REL);
  return [
    {
      identifier: {
        id: "openai.chatgpt"
      },
      version: CLEAN_STABLE_OPENAI_VERSION,
      location: {
        $mid: 1,
        fsPath: openAiPath,
        path: openAiPath,
        scheme: "file"
      },
      relativeLocation: CLEAN_STABLE_OPENAI_EXTENSION_REL,
      metadata: {
        isApplicationScoped: false,
        isMachineScoped: false,
        isBuiltin: false,
        installedTimestamp,
        pinned: false,
        source: "gallery",
        id: "90b52117-6fd1-4f1c-9e14-256bd6e21d79",
        publisherId: "c0a8460b-1d33-4e44-9cf5-9874a65dd334",
        publisherDisplayName: "OpenAI",
        targetPlatform: "linux-x64",
        updated: true,
        private: false,
        isPreReleaseVersion: false,
        hasPreReleaseVersion: true,
        preRelease: false
      }
    },
    {
      identifier: {
        id: "oll4com.codex-session-tools"
      },
      version: CLEAN_STABLE_CUSTOM_VERSION,
      location: {
        $mid: 1,
        fsPath: customPath,
        external: `file://${customPath}`,
        path: customPath,
        scheme: "file"
      },
      relativeLocation: CLEAN_STABLE_CUSTOM_EXTENSION_REL,
      metadata: {
        isMachineScoped: true,
        installedTimestamp,
        pinned: true,
        source: "vsix"
      }
    }
  ];
}

function cleanRestoreSensitiveSettings(settings) {
  const cleaned = {};
  for (const [key, value] of Object.entries(settings || {})) {
    if (RESTORE_SENSITIVE_SETTING_KEYS.has(key)) {
      continue;
    }
    if (RESTORE_SENSITIVE_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

function normalizeOpenAiCodexManifest(manifest) {
  const normalized = JSON.parse(JSON.stringify(manifest || {}));
  normalized.activationEvents = ["onStartupFinished", "onUri"];
  normalized.contributes = normalized.contributes && typeof normalized.contributes === "object"
    ? normalized.contributes
    : {};
  normalized.contributes.views = normalized.contributes.views && typeof normalized.contributes.views === "object"
    ? normalized.contributes.views
    : {};
  normalized.contributes.views.codexViewContainer = Array.isArray(normalized.contributes.views.codexViewContainer)
    ? normalized.contributes.views.codexViewContainer
    : [];
  normalized.contributes.views.codexSecondaryViewContainer = Array.isArray(normalized.contributes.views.codexSecondaryViewContainer)
    ? normalized.contributes.views.codexSecondaryViewContainer
    : [];

  if (!normalized.contributes.views.codexViewContainer[0]) {
    normalized.contributes.views.codexViewContainer[0] = {
      id: "chatgpt.sidebarView",
      type: "webview",
      name: "Codex"
    };
  }
  normalized.contributes.views.codexViewContainer[0].when = "chatgpt.doesNotSupportSecondarySidebar";

  if (!normalized.contributes.views.codexSecondaryViewContainer[0]) {
    normalized.contributes.views.codexSecondaryViewContainer[0] = {
      id: "chatgpt.sidebarSecondaryView",
      type: "webview",
      name: "Codex"
    };
  }
  normalized.contributes.views.codexSecondaryViewContainer[0].when = "!chatgpt.doesNotSupportSecondarySidebar";
  normalized.contributes.chatSessions = CLEAN_OPENAI_CODEX_CHAT_SESSIONS.map((entry) => ({ ...entry }));
  return normalized;
}

function createRestoreStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function backupMirrorPath(backupRoot, sourcePath) {
  return path.join(backupRoot, "removed", path.resolve(sourcePath).replace(/^\/+/, ""));
}

async function copyPathToBackup(sourcePath, backupRoot) {
  const stat = await statIfExists(sourcePath);
  if (!stat) {
    return null;
  }
  let targetPath = backupMirrorPath(backupRoot, sourcePath);
  if (await statIfExists(targetPath)) {
    targetPath = `${targetPath}.${Date.now()}`;
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
  return targetPath;
}

async function movePathToBackup(sourcePath, backupRoot) {
  const stat = await statIfExists(sourcePath);
  if (!stat) {
    return null;
  }
  let targetPath = backupMirrorPath(backupRoot, sourcePath);
  if (await statIfExists(targetPath)) {
    targetPath = `${targetPath}.${Date.now()}`;
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.rename(sourcePath, targetPath);
  return targetPath;
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeRemoteSessionBootstrapTrace(context, payload) {
  await fs.mkdir(context.globalStorageUri.fsPath, { recursive: true });
  await fs.writeFile(
    getRemoteSessionBootstrapTracePath(context),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
}

async function clearRemoteSessionBootstrapTrace(context) {
  try {
    await fs.unlink(getRemoteSessionBootstrapTracePath(context));
  } catch {
    // Ignore missing trace files.
  }
}

function normalizeRemoteSessionLiveEntries(rawValue) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {};
  }

  const normalized = {};
  for (const [aliasKey, entryValue] of Object.entries(rawValue)) {
    const alias = String(aliasKey || "").trim();
    if (!alias || !entryValue || typeof entryValue !== "object" || Array.isArray(entryValue)) {
      continue;
    }
    const lastSeenMs = Number(entryValue.lastSeenMs || 0);
    if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) {
      continue;
    }
    normalized[alias] = {
      lastSeenMs,
      source: String(entryValue.source || "").trim() || "heartbeat",
      status: String(entryValue.status || "").trim() || "live"
    };
  }

  return normalized;
}

function normalizeRemoteSessionLiveEntry(alias, entryValue) {
  const normalizedAlias = String(alias || "").trim();
  if (!normalizedAlias || !entryValue || typeof entryValue !== "object" || Array.isArray(entryValue)) {
    return null;
  }
  const lastSeenMs = Number(entryValue.lastSeenMs || 0);
  if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) {
    return null;
  }
  return {
    alias: normalizedAlias,
    entry: {
      lastSeenMs,
      source: String(entryValue.source || "").trim() || "heartbeat",
      status: String(entryValue.status || "").trim() || "live"
    }
  };
}

async function writeRemoteSessionAliasRegistryEntry(context, alias, entry) {
  const normalized = normalizeRemoteSessionLiveEntry(alias, entry);
  if (!normalized) {
    return;
  }
  await fs.mkdir(getRemoteSessionAliasRegistryDir(context), { recursive: true });
  await fs.writeFile(
    getRemoteSessionAliasRegistryFilePath(context, normalized.alias),
    JSON.stringify({
      alias: normalized.alias,
      ...normalized.entry
    }, null, 2),
    "utf8"
  );
}

async function clearRemoteSessionAliasReservation(context, alias, reservationSource) {
  const normalizedAlias = String(alias || "").trim();
  const normalizedSource = String(reservationSource || "").trim();
  if (!normalizedAlias || !normalizedSource) {
    return;
  }

  try {
    const filePath = getRemoteSessionAliasRegistryFilePath(context, normalizedAlias);
    const payload = await readJsonIfExists(filePath);
    if (payload && String(payload.alias || "").trim() === normalizedAlias && String(payload.source || "").trim() === normalizedSource) {
      await fs.unlink(filePath);
    }
  } catch {
    // Ignore best-effort cleanup failures.
  }

  try {
    const rawEntries = normalizeRemoteSessionLiveEntries(
      context.globalState.get(REMOTE_SESSION_LIVE_ALIASES_KEY, {})
    );
    const existing = rawEntries[normalizedAlias] || null;
    if (existing && String(existing.source || "").trim() === normalizedSource) {
      delete rawEntries[normalizedAlias];
      await context.globalState.update(REMOTE_SESSION_LIVE_ALIASES_KEY, rawEntries);
    }
  } catch {
    // Ignore best-effort cleanup failures.
  }
}

async function readRemoteSessionAliasRegistryEntries(context, outputChannel, options = {}) {
  const pruneStale = Boolean(options.pruneStale);
  const logPrunes = Boolean(options.logPrunes);
  const now = Date.now();
  const activeEntries = {};
  const staleAliases = [];
  let fileNames = [];

  try {
    fileNames = await fs.readdir(getRemoteSessionAliasRegistryDir(context));
  } catch {
    return {
      activeEntries,
      activeAliases: [],
      staleAliases
    };
  }

  for (const fileName of fileNames) {
    if (!/\.json$/i.test(fileName)) {
      continue;
    }
    const filePath = path.join(getRemoteSessionAliasRegistryDir(context), fileName);
    const payload = await readJsonIfExists(filePath);
    const normalized = normalizeRemoteSessionLiveEntry(payload && payload.alias ? payload.alias : "", payload);
    if (!normalized) {
      continue;
    }
    const timeoutMs = normalized.entry.status === "pending"
      ? REMOTE_SESSION_PENDING_TIMEOUT_MS
      : REMOTE_SESSION_LIVE_TIMEOUT_MS;
    if ((now - normalized.entry.lastSeenMs) <= timeoutMs) {
      activeEntries[normalized.alias] = normalized.entry;
      continue;
    }
    staleAliases.push(normalized.alias);
    if (pruneStale) {
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore stale-file races.
      }
    }
  }

  if (pruneStale && logPrunes && staleAliases.length > 0) {
    await appendDebugLog(context, outputChannel, "remote-session-file-registry-pruned", {
      staleAliases,
      liveTimeoutMs: REMOTE_SESSION_LIVE_TIMEOUT_MS,
      pendingTimeoutMs: REMOTE_SESSION_PENDING_TIMEOUT_MS
    });
  }

  return {
    activeEntries,
    activeAliases: Object.keys(activeEntries),
    staleAliases
  };
}

async function readRemoteSessionLiveAliases(context, outputChannel, options = {}) {
  const pruneStale = Boolean(options.pruneStale);
  const logPrunes = Boolean(options.logPrunes);
  const now = Date.now();
  const memoryEntries = normalizeRemoteSessionLiveEntries(
    context.globalState.get(REMOTE_SESSION_LIVE_ALIASES_KEY, {})
  );
  const fileRegistry = await readRemoteSessionAliasRegistryEntries(context, outputChannel, {
    pruneStale,
    logPrunes
  });
  const rawEntries = {
    ...memoryEntries
  };
  for (const [alias, entry] of Object.entries(fileRegistry.activeEntries)) {
    const previous = rawEntries[alias] || null;
    if (!previous || entry.lastSeenMs >= previous.lastSeenMs || (previous.status === "pending" && entry.status === "live")) {
      rawEntries[alias] = entry;
    }
  }
  const activeEntries = {};
  const staleAliases = [];

  for (const [alias, entry] of Object.entries(rawEntries)) {
    const timeoutMs = entry.status === "pending"
      ? REMOTE_SESSION_PENDING_TIMEOUT_MS
      : REMOTE_SESSION_LIVE_TIMEOUT_MS;
    if ((now - entry.lastSeenMs) <= timeoutMs) {
      activeEntries[alias] = entry;
      continue;
    }
    staleAliases.push(alias);
  }

  if (pruneStale && staleAliases.length > 0) {
    await context.globalState.update(REMOTE_SESSION_LIVE_ALIASES_KEY, activeEntries);
    if (logPrunes) {
      await appendDebugLog(context, outputChannel, "remote-session-live-pruned", {
        staleAliases,
        liveTimeoutMs: REMOTE_SESSION_LIVE_TIMEOUT_MS,
        pendingTimeoutMs: REMOTE_SESSION_PENDING_TIMEOUT_MS
      });
    }
  }

  return {
    activeEntries,
    activeAliases: Object.keys(activeEntries),
    staleAliases
  };
}

async function markRemoteSessionAliasLive(context, outputChannel, alias, options = {}) {
  const normalizedAlias = String(alias || "").trim();
  if (!normalizedAlias) {
    return "";
  }

  const registry = await readRemoteSessionLiveAliases(context, outputChannel, {
    pruneStale: true,
    logPrunes: false
  });
  const nextEntries = {
    ...registry.activeEntries
  };
  const previous = nextEntries[normalizedAlias] || null;
  const nextEntry = {
    lastSeenMs: Date.now(),
    source: String(options.source || "").trim() || "heartbeat",
    status: String(options.status || "").trim() || "live"
  };
  nextEntries[normalizedAlias] = nextEntry;
  await context.globalState.update(REMOTE_SESSION_LIVE_ALIASES_KEY, nextEntries);
  if (options.writeFileRegistry !== false) {
    await writeRemoteSessionAliasRegistryEntry(context, normalizedAlias, nextEntry);
  }

  if (options.log !== false && (!previous || previous.source !== nextEntry.source || previous.status !== nextEntry.status)) {
    await appendDebugLog(context, outputChannel, "remote-session-live-upsert", {
      alias: normalizedAlias,
      source: nextEntry.source,
      status: nextEntry.status
    });
  }

  return normalizedAlias;
}

function normalizeRemoteSessionAliasSource(source) {
  return String(source || "").trim();
}

function unwrapRemoteSessionAliasSource(source) {
  const normalizedSource = normalizeRemoteSessionAliasSource(source);
  if (normalizedSource.startsWith("workspace-state:")) {
    return normalizedSource.slice("workspace-state:".length);
  }
  return normalizedSource;
}

function isStrongRemoteSessionAliasSource(source) {
  const normalizedSource = unwrapRemoteSessionAliasSource(source);
  return (
    normalizedSource === "detectCurrentSshAlias" ||
    normalizedSource === "bootstrap-trace" ||
    normalizedSource === "lane-manifest"
  );
}

async function readFreshRemoteSessionBootstrapAlias(context) {
  const trace = await readJsonIfExists(getRemoteSessionBootstrapTracePath(context));
  if (!trace || typeof trace !== "object") {
    return {
      alias: "",
      ageMs: null,
      trace: null
    };
  }

  const targetAlias = String(trace.targetAlias || "").trim();
  const armedAtMs = trace.armedAt ? new Date(trace.armedAt).getTime() : 0;
  const ageMs = armedAtMs > 0 ? Date.now() - armedAtMs : null;
  if (
    !targetAlias ||
    !Number.isFinite(ageMs) ||
    ageMs === null ||
    ageMs < 0 ||
    ageMs > REMOTE_SESSION_BOOTSTRAP_ALIAS_MAX_AGE_MS
  ) {
    return {
      alias: "",
      ageMs,
      trace: null
    };
  }

  return {
    alias: targetAlias,
    ageMs,
    trace
  };
}

async function resolveCurrentRemoteSessionAlias(context, outputChannel) {
  const bootstrapResolution = await readFreshRemoteSessionBootstrapAlias(context);
  if (bootstrapResolution.alias) {
    await persistRemoteSessionWorkspaceAlias(context, outputChannel, bootstrapResolution.alias, "bootstrap-trace");
    const bootstrapLaneState = buildRemoteSessionLaneStateFromBootstrapTrace(bootstrapResolution.trace);
    if (bootstrapLaneState) {
      await persistRemoteSessionLaneState(context, outputChannel, bootstrapLaneState, "bootstrap-trace");
    }
    await appendDebugLog(context, outputChannel, "remote-session-alias-resolved-from-bootstrap", {
      alias: bootstrapResolution.alias,
      ageMs: bootstrapResolution.ageMs
    });
    return {
      alias: bootstrapResolution.alias,
      source: "bootstrap-trace"
    };
  }

  const workspaceLane = await findCoderRoomLaneForCurrentWorkspace();
  if (workspaceLane && workspaceLane.remoteAlias) {
    await persistRemoteSessionWorkspaceAlias(context, outputChannel, workspaceLane.remoteAlias, "lane-manifest");
    await persistRemoteSessionLaneState(context, outputChannel, workspaceLane, "lane-manifest");
    await appendDebugLog(context, outputChannel, "remote-session-lane-manifest-match", {
      laneId: workspaceLane.laneId,
      remoteAlias: workspaceLane.remoteAlias,
      expectedPath: workspaceLane.expectedPath,
      expectedBranch: workspaceLane.expectedBranch || null,
      manifestPath: workspaceLane.manifestPath
    });
    return {
      alias: workspaceLane.remoteAlias,
      source: "lane-manifest"
    };
  }

  const detectedAliasResolution = detectCurrentSshAliasDetails();
  const detectedAlias = String(detectedAliasResolution.alias || "").trim();
  const detectedAliasSource = String(detectedAliasResolution.source || "").trim();
  if (detectedAlias && detectedAliasSource !== "hostname-fallback") {
    await persistRemoteSessionWorkspaceAlias(context, outputChannel, detectedAlias, "detectCurrentSshAlias");
    return {
      alias: detectedAlias,
      source: "detectCurrentSshAlias"
    };
  }

  const workspaceAlias = String(context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_KEY, "") || "").trim();
  const workspaceStoredAliasSource = normalizeRemoteSessionAliasSource(
    context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_SOURCE_KEY, "")
  );
  if (workspaceAlias) {
    currentRemoteSessionAlias = workspaceAlias;
    currentRemoteSessionAliasSource = workspaceStoredAliasSource
      ? `workspace-state:${workspaceStoredAliasSource}`
      : "workspace-state";
    return {
      alias: workspaceAlias,
      source: currentRemoteSessionAliasSource
    };
  }

  if (currentRemoteSessionAlias) {
    return {
      alias: currentRemoteSessionAlias,
      source: currentRemoteSessionAliasSource || "session-cache"
    };
  }

  if (detectedAlias) {
    return {
      alias: detectedAlias,
      source: detectedAliasSource || "hostname-fallback"
    };
  }

  return {
    alias: "",
    source: "unresolved"
  };
}

async function persistRemoteSessionWorkspaceAlias(context, outputChannel, alias, source = "unknown") {
  const normalizedAlias = String(alias || "").trim();
  const normalizedSource = normalizeRemoteSessionAliasSource(source) || "unknown";
  const normalizedStrong = isStrongRemoteSessionAliasSource(normalizedSource);
  if (!normalizedAlias) {
    return "";
  }

  currentRemoteSessionAlias = normalizedAlias;
  currentRemoteSessionAliasSource = normalizedSource;
  const previousAlias = String(context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_KEY, "") || "").trim();
  const previousSource = normalizeRemoteSessionAliasSource(
    context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_SOURCE_KEY, "")
  );
  const previousStrong = Boolean(context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_STRONG_KEY, false));
  if (previousAlias === normalizedAlias && previousSource === normalizedSource && previousStrong === normalizedStrong) {
    return normalizedAlias;
  }

  await context.workspaceState.update(REMOTE_SESSION_WORKSPACE_ALIAS_KEY, normalizedAlias);
  await context.workspaceState.update(REMOTE_SESSION_WORKSPACE_ALIAS_SOURCE_KEY, normalizedSource);
  await context.workspaceState.update(REMOTE_SESSION_WORKSPACE_ALIAS_STRONG_KEY, normalizedStrong);
  await appendDebugLog(context, outputChannel, "remote-session-workspace-alias-updated", {
    alias: normalizedAlias,
    previousAlias: previousAlias || null,
    previousSource: previousSource || null,
    source: normalizedSource,
    strong: normalizedStrong
  });
  return normalizedAlias;
}

async function heartbeatRemoteSessionAlias(context, outputChannel, reason = "heartbeat") {
  const resolved = await resolveCurrentRemoteSessionAlias(context, outputChannel);
  const alias = String(resolved && resolved.alias || "").trim();
  if (!alias) {
    return "";
  }

  const aliasSource = normalizeRemoteSessionAliasSource(resolved && resolved.source);
  if (!isStrongRemoteSessionAliasSource(aliasSource)) {
    if (reason !== "heartbeat") {
      await appendDebugLog(context, outputChannel, "remote-session-live-skipped-weak-alias", {
        alias,
        source: aliasSource || "unknown",
        reason
      });
    }
    await syncRemoteSessionPresence(context, outputChannel, alias, aliasSource || "unknown", reason);
    return alias;
  }

  await markRemoteSessionAliasLive(context, outputChannel, alias, {
    source: aliasSource || "heartbeat",
    status: "live",
    log: reason !== "heartbeat"
  });
  await syncRemoteSessionPresence(context, outputChannel, alias, aliasSource || "heartbeat", reason);
  return alias;
}

async function buildRemoteSessionPresencePayload(context, alias, aliasSource, reason = "heartbeat") {
  let providerId = "";
  let providerLabel = "";
  let providerProfile = "";
  try {
    const providerInfo = await getCurrentProviderInfo();
    providerId = String(providerInfo && providerInfo.info && providerInfo.info.providerId || "").trim();
    providerLabel = String(providerInfo && providerInfo.info && providerInfo.info.label || "").trim();
    providerProfile = String(providerInfo && providerInfo.info && providerInfo.info.profile || "").trim();
  } catch {
    // Best-effort only.
  }
  const authIdentity = await readCurrentAuthIdentity();

  return {
    sessionId: getRemoteSessionInstanceId(context),
    alias: String(alias || "").trim(),
    aliasSource: String(aliasSource || "").trim() || "unknown",
    hostname: detectHostnameRemoteSessionAlias() || os.hostname(),
    remoteName: String(vscode.env.remoteName || "").trim(),
    workspaceStorageId: getRemoteSessionWorkspaceStorageId(context) || null,
    workspaceStoragePath: context && context.storageUri ? context.storageUri.fsPath : null,
    providerId: providerId || null,
    providerLabel: providerLabel || null,
    providerProfile: providerProfile || null,
    activeAuthSource: authIdentity.activeAuthSource || null,
    activeAccountEmail: authIdentity.activeAccountEmail || null,
    activeChatgptAccountId: authIdentity.activeChatgptAccountId || null,
    activeAccessToken: authIdentity.activeAccessToken || null,
    activeAccessTokenHash: authIdentity.activeAccessTokenHash || null,
    activeAccessTokenExpiresAt: authIdentity.activeAccessTokenExpiresAt || null,
    activeAuthUpdatedAt: authIdentity.activeAuthUpdatedAt || null,
    activeGithubAccountId: authIdentity.activeGithubAccountId || null,
    activeGithubAccountLabel: authIdentity.activeGithubAccountLabel || null,
    activeGithubScopes: Array.isArray(authIdentity.activeGithubScopes) ? authIdentity.activeGithubScopes : [],
    pid: process.pid,
    user: String(process.env.USER || os.userInfo().username || "").trim() || null,
    startedAt: remoteSessionStartedAt,
    updatedAt: new Date().toISOString(),
    reason: String(reason || "").trim() || "heartbeat",
    status: "live"
  };
}

function resolveRemoteSessionPresenceSettings(settings) {
  const syncAlias = String(
    settings && Object.prototype.hasOwnProperty.call(settings, "remoteSessionPresenceAlias")
      ? settings.remoteSessionPresenceAlias
      : DEFAULT_REMOTE_SESSION_PRESENCE_ALIAS
  ).trim();
  const syncDir = String(
    settings && Object.prototype.hasOwnProperty.call(settings, "remoteSessionPresenceDir")
      ? settings.remoteSessionPresenceDir
      : DEFAULT_REMOTE_SESSION_PRESENCE_DIR
  ).trim() || DEFAULT_REMOTE_SESSION_PRESENCE_DIR;

  return {
    enabled: Boolean(syncAlias),
    syncAlias,
    syncDir
  };
}

async function syncRemoteSessionPresence(context, outputChannel, alias, aliasSource, reason = "heartbeat") {
  const normalizedAlias = String(alias || "").trim();
  const normalizedSource = normalizeRemoteSessionAliasSource(aliasSource);
  const canSyncAlias = isStrongRemoteSessionAliasSource(normalizedSource) || isWorkspaceBackedRemoteSessionAliasSource(normalizedSource);
  if (!normalizedAlias || !canSyncAlias) {
    return false;
  }

  const settings = getSettings();
  const { enabled: presenceSyncEnabled, syncAlias, syncDir } = resolveRemoteSessionPresenceSettings(settings);
  if (!presenceSyncEnabled) {
    return false;
  }
  if (syncAlias === remoteSessionPresenceSyncSuppressedAlias && remoteSessionPresenceSyncSuppressedMessage) {
    if (reason !== "heartbeat") {
      await appendDebugLog(context, outputChannel, "remote-session-presence-sync-suppressed", {
        alias: normalizedAlias,
        aliasSource: normalizedSource,
        syncAlias,
        reason,
        message: remoteSessionPresenceSyncSuppressedMessage
      });
    }
    return false;
  }
  const payload = await buildRemoteSessionPresencePayload(context, normalizedAlias, normalizedSource, reason);
  const signature = JSON.stringify([
    payload.alias,
    payload.aliasSource,
    payload.providerId,
    payload.providerLabel,
    payload.workspaceStorageId,
    payload.activeAuthSource || "",
    payload.activeAccountEmail || "",
    payload.activeChatgptAccountId || "",
    payload.activeAccessTokenHash || ""
  ]);
  const now = Date.now();
  if (
    reason === "heartbeat" &&
    signature === lastRemoteSessionPresenceSyncSignature &&
    (now - lastRemoteSessionPresenceSyncAtMs) < REMOTE_SESSION_PRESENCE_SYNC_MIN_INTERVAL_MS
  ) {
    return false;
  }

  const remoteFilePath = `${syncDir}/${encodeURIComponent(payload.sessionId)}.json`;
  const payloadBase64 = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8").toString("base64");
  const remoteScript = [
    "set -euo pipefail",
    `dir=${shellQuote(syncDir)}`,
    `file=${shellQuote(remoteFilePath)}`,
    "tmp=\"$file.tmp.$$\"",
    "mkdir -p \"$dir\"",
    `printf '%s' ${shellQuote(payloadBase64)} | base64 -d > \"$tmp\"`,
    "chmod 600 \"$tmp\"",
    "mv \"$tmp\" \"$file\""
  ].join("\n");

  try {
    await execFileJsonSafe(
      "ssh",
      [syncAlias, "bash", "-lc", remoteScript],
      REMOTE_SESSION_PRESENCE_SYNC_TIMEOUT_MS
    );
    lastRemoteSessionPresenceSyncAtMs = now;
    lastRemoteSessionPresenceSyncSignature = signature;
    if (reason !== "heartbeat") {
      await appendDebugLog(context, outputChannel, "remote-session-presence-sync-success", {
        alias: normalizedAlias,
        aliasSource: normalizedSource,
        sessionId: payload.sessionId,
        remoteFilePath,
        syncAlias,
        reason
      });
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/could not resolve hostname/i.test(message)) {
      remoteSessionPresenceSyncSuppressedAlias = syncAlias;
      remoteSessionPresenceSyncSuppressedMessage = message;
      await appendDebugLog(context, outputChannel, "remote-session-presence-sync-disabled", {
        alias: normalizedAlias,
        aliasSource: normalizedSource,
        sessionId: payload.sessionId,
        syncAlias,
        reason,
        message
      });
    }
    await appendDebugLog(context, outputChannel, "remote-session-presence-sync-failed", {
      alias: normalizedAlias,
      aliasSource: normalizedSource,
      sessionId: payload.sessionId,
      syncAlias,
      reason,
      message
    });
    return false;
  }
}

async function removeRemoteSessionPresence(context, outputChannel, reason = "deactivate") {
  const sessionId = getRemoteSessionInstanceId(context);
  if (!sessionId) {
    return false;
  }
  const settings = getSettings();
  const { enabled: presenceSyncEnabled, syncAlias, syncDir } = resolveRemoteSessionPresenceSettings(settings);
  if (!presenceSyncEnabled) {
    return false;
  }
  const remoteFilePath = `${syncDir}/${encodeURIComponent(sessionId)}.json`;
  const remoteScript = [
    "set -euo pipefail",
    `file=${shellQuote(remoteFilePath)}`,
    "rm -f \"$file\""
  ].join("\n");

  try {
    await execFileJsonSafe(
      "ssh",
      [syncAlias, "bash", "-lc", remoteScript],
      REMOTE_SESSION_PRESENCE_SYNC_TIMEOUT_MS
    );
    await appendDebugLog(context, outputChannel, "remote-session-presence-sync-removed", {
      sessionId,
      remoteFilePath,
      syncAlias,
      reason
    });
    return true;
  } catch (error) {
    await appendDebugLog(context, outputChannel, "remote-session-presence-sync-remove-failed", {
      sessionId,
      remoteFilePath,
      syncAlias,
      reason,
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function readAuthDebugSnapshot() {
  const authStat = await statIfExists(CODEX_AUTH_FILE);
  const authIdentity = await readCurrentAuthIdentity();
  let readError = null;

  if (authStat) {
    try {
      await readAuthPayloadFromFile(CODEX_AUTH_FILE);
    } catch (error) {
      readError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    exists: Boolean(authStat),
    size: authStat ? authStat.size : null,
    mtimeMs: authStat ? Math.round(authStat.mtimeMs) : null,
    currentEmail: authIdentity.activeAccountEmail || null,
    authSource: authIdentity.activeAuthSource || null,
    githubAccountLabel: authIdentity.activeGithubAccountLabel || null,
    githubScopes: Array.isArray(authIdentity.activeGithubScopes) ? authIdentity.activeGithubScopes : [],
    readError
  };
}

async function readConfigDebugSnapshot() {
  const configStat = await statIfExists(DEFAULTS.configPath);
  let provider = null;
  let profile = null;
  let label = null;
  let readError = null;

  if (configStat) {
    try {
      const { info } = await getCurrentProviderInfo();
      provider = info.providerId;
      profile = info.profile;
      label = info.label;
    } catch (error) {
      readError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    exists: Boolean(configStat),
    size: configStat ? configStat.size : null,
    mtimeMs: configStat ? Math.round(configStat.mtimeMs) : null,
    provider,
    profile,
    label,
    readError
  };
}

async function readSessionIndexDebugSnapshot() {
  const indexStat = await statIfExists(CODEX_SESSION_INDEX_PATH);
  return {
    exists: Boolean(indexStat),
    size: indexStat ? indexStat.size : null,
    mtimeMs: indexStat ? Math.round(indexStat.mtimeMs) : null
  };
}

async function buildRemoteSessionBootstrapSnapshot(context) {
  return {
    capturedAt: new Date().toISOString(),
    remoteName: String(vscode.env.remoteName || ""),
    detectedCurrentAlias: detectCurrentSshAlias(),
    openSidebarAfterRestart: context.globalState.get(OPEN_SIDEBAR_AFTER_RESTART_KEY, false),
    lastRotationTarget: context.globalState.get(ROTATION_LAST_TARGET_KEY, null),
    lastRotationCurrent: context.globalState.get(ROTATION_LAST_CURRENT_KEY, null),
    lastRotationLogoutAt: context.globalState.get(ROTATION_LAST_LOGOUT_AT_KEY, null),
    auth: await readAuthDebugSnapshot(),
    config: await readConfigDebugSnapshot(),
    sessionIndex: await readSessionIndexDebugSnapshot()
  };
}

function summarizeBootstrapDelta(previousSnapshot, currentSnapshot) {
  const previous = previousSnapshot || {};
  const current = currentSnapshot || {};
  return {
    aliasChanged: previous.detectedCurrentAlias !== current.detectedCurrentAlias,
    authEmailChanged: (previous.auth && previous.auth.currentEmail) !== (current.auth && current.auth.currentEmail),
    authMtimeChanged: (previous.auth && previous.auth.mtimeMs) !== (current.auth && current.auth.mtimeMs),
    configProviderChanged: (previous.config && previous.config.provider) !== (current.config && current.config.provider),
    configMtimeChanged: (previous.config && previous.config.mtimeMs) !== (current.config && current.config.mtimeMs),
    sessionIndexMtimeChanged: (previous.sessionIndex && previous.sessionIndex.mtimeMs) !== (current.sessionIndex && current.sessionIndex.mtimeMs)
  };
}

async function sampleRemoteSessionBootstrap(context, outputChannel, trace, phase) {
  const snapshot = await buildRemoteSessionBootstrapSnapshot(context);
  const deltaFromArmed = summarizeBootstrapDelta(trace && trace.armedSnapshot, snapshot);
  await appendDebugLog(context, outputChannel, "remote-session-bootstrap-sample", {
    traceId: trace && trace.traceId ? trace.traceId : null,
    phase,
    targetAlias: trace && trace.targetAlias ? trace.targetAlias : null,
    armedAt: trace && trace.armedAt ? trace.armedAt : null,
    armedByAlias: trace && trace.currentAlias ? trace.currentAlias : null,
    bootstrapAgeMs: trace && trace.armedAt ? Date.now() - new Date(trace.armedAt).getTime() : null,
    deltaFromArmed,
    snapshot
  });
}

async function maybeRunRemoteSessionBootstrapDiagnostics(context, outputChannel) {
  const trace = await readJsonIfExists(getRemoteSessionBootstrapTracePath(context));
  if (!trace || typeof trace !== "object") {
    return;
  }

  const armedAtMs = trace.armedAt ? new Date(trace.armedAt).getTime() : 0;
  const ageMs = armedAtMs > 0 ? Date.now() - armedAtMs : null;
  if (!armedAtMs || !Number.isFinite(ageMs) || ageMs > REMOTE_SESSION_BOOTSTRAP_MAX_AGE_MS) {
    await appendDebugLog(context, outputChannel, "remote-session-bootstrap-expired", {
      traceId: trace.traceId || null,
      targetAlias: trace.targetAlias || null,
      ageMs
    });
    await clearRemoteSessionBootstrapTrace(context);
    return;
  }

  const currentAlias = detectCurrentSshAlias();
  const targetAlias = String(trace.targetAlias || "").trim();
  const aliasMatches = Boolean(currentAlias) && Boolean(targetAlias) && currentAlias === targetAlias;
  await appendDebugLog(context, outputChannel, "remote-session-bootstrap-detected", {
    traceId: trace.traceId || null,
    currentAlias,
    targetAlias,
    aliasMatches,
    ageMs
  });

  if (targetAlias && currentAlias && !aliasMatches) {
    return;
  }

  for (const delayMs of REMOTE_SESSION_BOOTSTRAP_SAMPLE_DELAYS_MS) {
    setTimeout(() => {
      void sampleRemoteSessionBootstrap(context, outputChannel, trace, `activate+${delayMs}ms`);
    }, delayMs);
  }

  const finalDelayMs = REMOTE_SESSION_BOOTSTRAP_SAMPLE_DELAYS_MS[REMOTE_SESSION_BOOTSTRAP_SAMPLE_DELAYS_MS.length - 1] + 2000;
  setTimeout(() => {
    void clearRemoteSessionBootstrapTrace(context);
  }, finalDelayMs);
}

async function primeRemoteSessionWorkspaceState(context, outputChannel) {
  try {
    await resolveCurrentRemoteSessionAlias(context, outputChannel);
  } catch (error) {
    await appendDebugLog(context, outputChannel, "remote-session-prime-failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function getSettings() {
  const config = vscode.workspace.getConfiguration("codexProviderStatusbar");
  return {
    openaiModel: config.get("openaiModel", DEFAULTS.openaiModel),
    autoOpenCodexSidebar: config.get("autoOpenCodexSidebar", true),
    showStatusBarItem: FORCE_HIDE_PROVIDER_STATUS_BAR_ITEMS ? false : config.get("showStatusBarItem", true),
    showCodexLbUsageStatusBarItem: config.get("showCodexLbUsageStatusBarItem", true),
    rotationEnabled: config.get("rotationEnabled", true),
    rotationShowStatusBarItem: FORCE_HIDE_PROVIDER_STATUS_BAR_ITEMS ? false : config.get("rotationShowStatusBarItem", true),
    rotationVmAlias: config.get("rotationVmAlias", DEFAULT_ROTATION_USAGE_HOST_ALIAS),
    rotationAccountsPath: config.get("rotationAccountsPath", DEFAULT_ROTATION_USAGE_ACCOUNTS_PATH),
    rotationUsageCachePath: config.get("rotationUsageCachePath", DEFAULT_ROTATION_USAGE_CACHE_PATH),
    rotationAutoLoginFromSnapshot: config.get("rotationAutoLoginFromSnapshot", true),
    rotationAuthSnapshotsDir: config.get("rotationAuthSnapshotsDir", "~/.codex/.codex-provider-statusbar/accounts"),
    remoteSessionDefaultAlias: config.get("remoteSessionDefaultAlias", DEFAULT_REMOTE_SESSION_ALIAS),
    remoteSessionMaxIndex: config.get("remoteSessionMaxIndex", DEFAULT_REMOTE_SESSION_MAX_INDEX),
    remoteSessionOpenPath: config.get("remoteSessionOpenPath", DEFAULT_REMOTE_SESSION_PATH),
    remoteSessionPresenceAlias: config.get("remoteSessionPresenceAlias", DEFAULT_REMOTE_SESSION_PRESENCE_ALIAS),
    remoteSessionPresenceDir: config.get("remoteSessionPresenceDir", DEFAULT_REMOTE_SESSION_PRESENCE_DIR),
    codexLbProxyBaseUrl: config.get("codexLbProxyBaseUrl", DEFAULT_CODEX_LB_PROXY_BASE_URL),
    codexLbDashboardUrl: config.get("codexLbDashboardUrl", DEFAULT_CODEX_LB_DASHBOARD_URL),
    codexLbPrimaryBaseUrl: config.get("codexLbPrimaryBaseUrl", DEFAULT_CODEX_LB_PRIMARY_BASE_URL),
    codexLbFallbackBaseUrl: config.get("codexLbFallbackBaseUrl", DEFAULT_CODEX_LB_FALLBACK_BASE_URL),
    codexLbHeadroomBaseUrl: config.get("codexLbHeadroomBaseUrl", DEFAULT_CODEX_LB_HEADROOM_BASE_URL),
    codexLbRouteStatePath: config.get("codexLbRouteStatePath", "~/.config/codex-lb-vscode-route.json"),
    codexLbProviderEnvPath: config.get("codexLbProviderEnvPath", "~/.config/codex-lb-provider.env"),
    codexLbModelCacheRefresherPath: config.get("codexLbModelCacheRefresherPath", "~/scripts/codex_lb_refresh_model_cache.js"),
    codexLbRouteSelectorPath: config.get("codexLbRouteSelectorPath", "~/.local/bin/codex-lb-vscode-select")
  };
}

async function getCurrentProviderInfo() {
  const configText = await readConfigText(DEFAULTS.configPath);
  return {
    configText,
    info: detectProviderInfo(configText)
  };
}

function readFallbackEnvValue(envKey) {
  if (!envKey) {
    return "";
  }

  try {
    const envText = fsSync.readFileSync(FALLBACK_ENV_PATH, "utf8");
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${envKey}=([\"']?.*[\"']?)\\s*$`, "m");
    const match = envText.match(pattern);
    if (!match) {
      return "";
    }

    const rawValue = String(match[1] || "").trim();
    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      return rawValue.slice(1, -1);
    }

    return rawValue;
  } catch {
    return "";
  }
}

function getEnvironmentValue(envKey) {
  return process.env[envKey] || readFallbackEnvValue(envKey) || "";
}

function readCodexLbConfigSummary(settings) {
  const fallback = {
    profile: "codex-lb-vscode",
    model: "gpt-5.5",
    baseUrl: `${getCodexLbProxyBaseUrl(settings)}/v1`
  };

  try {
    const content = fsSync.readFileSync(CODEX_CONFIG_PATH, "utf8");
    const profileMatch = content.match(/\[profiles\.codex-lb-vscode\][\s\S]*?model\s*=\s*"([^"]+)"/);
    const baseUrlMatch = content.match(/\[model_providers\.codex-lb\][\s\S]*?base_url\s*=\s*"([^"]+)"/);
    return {
      profile: "codex-lb-vscode",
      model: profileMatch?.[1] || fallback.model,
      baseUrl: baseUrlMatch?.[1] || fallback.baseUrl
    };
  } catch {
    return fallback;
  }
}

function readCodexLbModelCacheRefreshState() {
  try {
    return JSON.parse(fsSync.readFileSync(CODEX_LB_MODEL_CACHE_STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function formatCodexLbModelCacheSummaryLine() {
  const state = readCodexLbModelCacheRefreshState();
  if (!state.ok) {
    const error = lbModelCacheLastError || state.error;
    return error ? `unavailable (${error})` : "pending";
  }
  const ids = Array.isArray(state.model_ids) ? state.model_ids : [];
  const upstream = state.upstream ? ` via ${state.upstream}` : "";
  const fetched = state.fetched_at ? ` at ${new Date(state.fetched_at).toLocaleString()}` : "";
  return `${ids.join(", ")}${upstream}${fetched}`;
}

function emptyResolvedModelSummary(detail) {
  return {
    label: "",
    scopeLabel: "Model",
    detail,
    globalDetail: "",
    recentLines: [],
    localMatchLines: []
  };
}

function readLastResolvedModelSummary() {
  try {
    const raw = fsSync.readFileSync(CODEX_LB_LAST_MODEL_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.ok) {
      return emptyResolvedModelSummary("unavailable");
    }
    const row = parsed.display_model || {};
    const model = String(row.model || "").trim();
    const effort = String(row.reasoning_effort || "").trim();
    if (!model) {
      return emptyResolvedModelSummary("pending");
    }
    const label = effort ? `${model}/${effort}` : model;
    return {
      label,
      scopeLabel: "Model",
      detail: label,
      globalDetail: "",
      recentLines: [],
      localMatchLines: []
    };
  } catch {
    return emptyResolvedModelSummary("pending");
  }
}

function getActiveThreadName() {
  try {
    const activeTab = vscode.window.tabGroups?.activeTabGroup?.activeTab;
    const label = String(activeTab?.label || "").trim();
    if (label) {
      return label;
    }
  } catch {
    // Ignore tab API failures.
  }
  return "";
}

function getSelectedCodexLbRouteMode(settings) {
  const routeState = getCodexLbRouteState(settings);
  return routeState.routeMode || "direct";
}

function getCodexLbUpstreamInfo(settings, name) {
  const upstreams = lbStatusLastPayload && lbStatusLastPayload.upstreams;
  if (!upstreams || typeof upstreams !== "object") {
    const routeState = getCodexLbRouteState(settings);
    if (name === "primary") {
      return { base_url: routeState.primaryBaseUrl };
    }
    if (name === "fallback") {
      return { base_url: routeState.fallbackBaseUrl };
    }
    return null;
  }
  return upstreams[name] || null;
}

function chooseHealthyCodexLbUpstreamName() {
  const upstreams = lbStatusLastPayload && lbStatusLastPayload.upstreams;
  if (!upstreams || typeof upstreams !== "object") {
    return "";
  }
  for (const name of ["primary", "fallback"]) {
    if (upstreams[name] && upstreams[name].ok) {
      return name;
    }
  }
  return "";
}

function describeActiveCodexLb(settings) {
  const routeState = getCodexLbRouteState(settings);
  if (routeState.routeMode === "headroom") {
    return `headroom ${routeState.headroomBaseUrl}`;
  }
  const upstream = lbUsageLastUpstream || chooseHealthyCodexLbUpstreamName();
  const upstreamInfo = upstream ? getCodexLbUpstreamInfo(settings, upstream) : null;
  if (upstreamInfo && upstreamInfo.base_url) {
    return `${upstream} ${upstreamInfo.base_url}`;
  }
  if (lbStatusLastError) {
    return `unknown (${lbStatusLastError})`;
  }
  return "unknown";
}

function formatBaseUrlShortLabel(prefix, baseUrl, fallbackLabel) {
  try {
    const parsed = new URL(String(baseUrl || "").trim());
    const isLocal = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    const hostLabel = isLocal
      ? `local${parsed.port ? `:${parsed.port}` : ""}`
      : parsed.hostname;
    return hostLabel ? `${prefix} ${hostLabel}` : fallbackLabel;
  } catch {
    return fallbackLabel;
  }
}

function formatActiveCodexLbShortLabel(settings) {
  const routeState = getCodexLbRouteState(settings);
  if (routeState.routeMode === "headroom") {
    return formatBaseUrlShortLabel("HR", routeState.headroomBaseUrl, "HR");
  }
  const upstream = lbUsageLastUpstream || chooseHealthyCodexLbUpstreamName();
  const upstreamInfo = upstream ? getCodexLbUpstreamInfo(settings, upstream) : null;
  const url = upstreamInfo ? String(upstreamInfo.base_url || "") : "";
  if (url) {
    return formatBaseUrlShortLabel("LB", url, upstream ? `LB ${upstream}` : "LB");
  }
  return upstream ? `LB ${upstream}` : "LB";
}

function formatCodexLbRouteLine(settings) {
  const route = lbStatusLastPayload && lbStatusLastPayload.route;
  const routeMode = route && typeof route === "object" ? String(route.route_mode || "direct").trim() : "";
  const mode = route && typeof route === "object" ? String(route.mode || "").trim() : "";
  const active = Array.isArray(lbStatusLastPayload && lbStatusLastPayload.active_upstreams)
    ? lbStatusLastPayload.active_upstreams
    : [];
  const activeText = active
    .map((item) => `${String(item.name || "upstream")} ${String(item.base_url || "").trim()}`.trim())
    .filter(Boolean)
    .join(", ");

  if (routeMode && activeText) {
    return `${routeMode}${mode ? `/${mode}` : ""}: ${activeText}`;
  }
  if (routeMode) {
    return `${routeMode}${mode ? `/${mode}` : ""}`;
  }
  if (mode && activeText) {
    return `direct/${mode}: ${activeText}`;
  }
  if (mode) {
    return `direct/${mode}`;
  }
  const routeState = getCodexLbRouteState(settings);
  const directActive = getCodexLbRouteTargets(settings)[0];
  if (directActive) {
    return `${routeState.routeMode}/${routeState.mode}: ${directActive.name} ${directActive.baseUrl}`;
  }
  return `${routeState.routeMode}/${routeState.mode}`;
}

function formatCodexLbInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return Math.round(number).toLocaleString();
}

function formatCodexLbResetAt(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "unknown";
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }
  return date.toLocaleString();
}

function getCodexLbAllAccountsRemainingPercent(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const explicit = Number(payload.all_accounts_remaining_percent);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  const legacy = Number(payload.remaining_percent);
  return Number.isFinite(legacy) ? legacy : null;
}

function getCodexLbActiveAccountsRemainingPercent(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const explicit = Number(payload.active_accounts_remaining_percent);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  const legacy = Number(payload.active_remaining_percent);
  return Number.isFinite(legacy) ? legacy : null;
}

function buildCodexLbUsageDetailsMessage(settings) {
  if (!lbUsageLastPayload) {
    return lbUsageLastError
      ? `Codex LB usage tokens unavailable: ${lbUsageLastError}`
      : "Codex LB usage tokens are loading from the live weekly endpoint.";
  }

  const allRemaining = getCodexLbAllAccountsRemainingPercent(lbUsageLastPayload);
  const activeRemaining = getCodexLbActiveAccountsRemainingPercent(lbUsageLastPayload);
  const totalCount = formatCodexLbInteger(lbUsageLastPayload.all_accounts_count);
  const activeCount = formatCodexLbInteger(lbUsageLastPayload.active_accounts_count);
  return [
    `Codex LB usage tokens: ${formatPercent(allRemaining)} all accounts remaining`,
    activeRemaining === null
      ? "Active accounts remaining: unavailable"
      : `Active accounts remaining: ${formatPercent(activeRemaining)} (${activeCount} / ${totalCount} active)`,
    `Connected LB: ${describeActiveCodexLb(settings)}`,
    `LB route: ${formatCodexLbRouteLine(settings)}`,
    `Pooled used: ${formatPercent(lbUsageLastPayload.used_percent)}`,
    `Pooled credits: ${formatCodexLbInteger(lbUsageLastPayload.remaining_credits)} / ${formatCodexLbInteger(lbUsageLastPayload.capacity_credits)} remaining`,
    `Active pooled credits: ${formatCodexLbInteger(lbUsageLastPayload.active_remaining_credits)} / ${formatCodexLbInteger(lbUsageLastPayload.active_capacity_credits)} remaining`,
    `Reset: ${formatCodexLbResetAt(lbUsageLastPayload.reset_at)}`,
    `Source: ${String(lbUsageLastPayload.source || "unknown")}`,
    `Endpoint: ${getCodexLbWeeklyRemainingUrl(settings)}`,
    `Live models: ${formatCodexLbModelCacheSummaryLine()}`,
    `Last refresh: ${String(lbUsageLastPayload.fetched_at_local || "pending")}`
  ].join("\n");
}

function formatCodexLbUsageSummaryLine() {
  if (!lbUsageLastPayload) {
    return lbUsageLastError ? `unavailable (${lbUsageLastError})` : "loading";
  }
  const allRemaining = getCodexLbAllAccountsRemainingPercent(lbUsageLastPayload);
  const activeRemaining = getCodexLbActiveAccountsRemainingPercent(lbUsageLastPayload);
  const activeText = activeRemaining === null ? "active unavailable" : `active ${formatPercent(activeRemaining)}`;
  return `${formatPercent(allRemaining)} all accounts remaining; ${activeText}`;
}

function buildCodexLbUsageTooltip(settings) {
  const payload = lbUsageLastPayload || {};
  const allRemaining = getCodexLbAllAccountsRemainingPercent(payload);
  const activeRemaining = getCodexLbActiveAccountsRemainingPercent(payload);
  const totalCount = formatCodexLbInteger(payload.all_accounts_count);
  const activeCount = formatCodexLbInteger(payload.active_accounts_count);
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.supportHtml = false;
  tooltip.isTrusted = true;
  tooltip.appendMarkdown("**Codex LB usage tokens**\n\n");
  tooltip.appendMarkdown(`Connected LB: **${describeActiveCodexLb(settings)}**\n\n`);
  tooltip.appendMarkdown(`Route: **${formatCodexLbRouteLine(settings)}**\n\n`);
  tooltip.appendMarkdown(`All accounts remaining: **${formatPercent(allRemaining)}**\n\n`);
  tooltip.appendMarkdown(`Active accounts remaining: **${activeRemaining === null ? "unavailable" : formatPercent(activeRemaining)}** (${activeCount} / ${totalCount} active)\n\n`);
  tooltip.appendMarkdown(`Pooled used: ${formatPercent(payload.used_percent)}\n\n`);
  tooltip.appendMarkdown(`Pooled credits: ${formatCodexLbInteger(payload.remaining_credits)} / ${formatCodexLbInteger(payload.capacity_credits)} remaining\n\n`);
  tooltip.appendMarkdown(`Active pooled credits: ${formatCodexLbInteger(payload.active_remaining_credits)} / ${formatCodexLbInteger(payload.active_capacity_credits)} remaining\n\n`);
  tooltip.appendMarkdown(`Reset: ${formatCodexLbResetAt(payload.reset_at)}\n\n`);
  tooltip.appendMarkdown(`Source: ${String(payload.source || "unknown")}\n\n`);
  tooltip.appendMarkdown(`Live models: ${formatCodexLbModelCacheSummaryLine()}\n\n`);
  tooltip.appendMarkdown(`Last refresh: ${String(payload.fetched_at_local || "pending")}\n\n`);
  tooltip.appendMarkdown(
    "[Select LB](command:codexProviderStatusbar.selectCodexLbRoute) | [Refresh usage](command:codexProviderStatusbar.refreshCodexLbUsage) | [Refresh models](command:codexProviderStatusbar.refreshCodexLbModels)"
  );
  return tooltip;
}

function readCurrentProviderIdForStatusItems() {
  try {
    const configText = fsSync.readFileSync(CODEX_CONFIG_PATH, "utf8");
    const info = detectProviderInfo(configText);
    return String(info && info.providerId || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function shouldSkipCodexLbBackgroundRefresh(options = {}) {
  if (!options.silent || options.force) {
    return false;
  }
  return readCurrentProviderIdForStatusItems() === "openai";
}

function buildProviderAwareLbUsageStatusState(options) {
  const providerId = String(options && options.providerId || "").trim().toLowerCase();
  if (providerId === "openai") {
    return {
      text: "openai",
      tooltip: "Current provider: openai",
      colorTheme: null,
      backgroundTheme: null,
      accessibilityLabel: "Current provider openai",
      command: "codexProviderStatusbar.selectCodexLbRoute"
    };
  }

  const hasPayload = Boolean(options && options.hasPayload);
  const error = String(options && options.error || "").trim();
  if (!hasPayload) {
    return {
      text: error ? "$(warning) LB usage" : "$(pulse) LB --%",
      tooltip: error
        ? `Codex LB usage tokens unavailable: ${error}`
        : "Codex LB usage tokens: loading live quota",
      colorTheme: error ? "statusBarItem.warningForeground" : null,
      backgroundTheme: error ? "statusBarItem.warningBackground" : null,
      accessibilityLabel: null,
      command: "codexProviderStatusbar.selectCodexLbRoute"
    };
  }

  const remaining = toFiniteNumber(options && options.remainingPercent, 0);
  const activeRemainingRaw = options && options.activeRemainingPercent;
  const activeRemaining = Number.isFinite(Number(activeRemainingRaw)) ? Number(activeRemainingRaw) : null;
  const alertRemaining = activeRemaining === null ? remaining : activeRemaining;
  const icon = alertRemaining <= 10 ? "$(error)" : alertRemaining <= 25 ? "$(warning)" : "$(circle-filled)";
  const lbLabel = String(options && options.lbLabel || "LB").trim() || "LB";
  const activeSuffix = activeRemaining === null ? "" : ` Act ${formatPercent(activeRemaining)}`;
  return {
    text: `${icon} ${lbLabel} ${formatPercent(remaining)}${activeSuffix}`,
    tooltip: options && options.tooltip ? options.tooltip : "",
    colorTheme: alertRemaining <= 10
      ? "statusBarItem.errorForeground"
      : alertRemaining <= 25
        ? "statusBarItem.warningForeground"
        : null,
    backgroundTheme: alertRemaining <= 10
      ? "statusBarItem.errorBackground"
      : alertRemaining <= 25
        ? "statusBarItem.warningBackground"
        : null,
    accessibilityLabel: activeRemaining === null
      ? `Codex ${lbLabel} usage tokens ${formatPercent(remaining)} all accounts remaining`
      : `Codex ${lbLabel} usage tokens ${formatPercent(remaining)} all accounts remaining, ${formatPercent(activeRemaining)} active accounts remaining`,
    command: "codexProviderStatusbar.selectCodexLbRoute"
  };
}

function updateCodexLbUsageStatusItem() {
  if (!lbUsageStatusBarItem) {
    return;
  }

  const settings = getSettings();
  if (!settings.showCodexLbUsageStatusBarItem) {
    lbUsageStatusBarItem.hide();
    return;
  }

  const hasPayload = Boolean(lbUsageLastPayload);
  const nextState = buildProviderAwareLbUsageStatusState({
    providerId: readCurrentProviderIdForStatusItems(),
    hasPayload,
    error: lbUsageLastError,
    remainingPercent: hasPayload ? getCodexLbAllAccountsRemainingPercent(lbUsageLastPayload) : null,
    activeRemainingPercent: hasPayload ? getCodexLbActiveAccountsRemainingPercent(lbUsageLastPayload) : null,
    lbLabel: hasPayload ? formatActiveCodexLbShortLabel(settings) : "",
    tooltip: hasPayload ? buildCodexLbUsageTooltip(settings) : null
  });

  lbUsageStatusBarItem.text = nextState.text;
  lbUsageStatusBarItem.tooltip = nextState.tooltip;
  lbUsageStatusBarItem.command = nextState.command;
  lbUsageStatusBarItem.color = nextState.colorTheme ? new vscode.ThemeColor(nextState.colorTheme) : undefined;
  lbUsageStatusBarItem.backgroundColor = nextState.backgroundTheme
    ? new vscode.ThemeColor(nextState.backgroundTheme)
    : undefined;
  lbUsageStatusBarItem.accessibilityInformation = nextState.accessibilityLabel
    ? {
        label: nextState.accessibilityLabel,
        role: "button"
      }
    : undefined;
  lbUsageStatusBarItem.show();
}

async function fetchCodexLbWeeklyRemainingWithFallback(settings, apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`
  };
  const routeTargets = getCodexLbRouteTargets(settings);
  const urls = [
    { name: "proxy", url: getCodexLbWeeklyRemainingUrl(settings) },
    ...routeTargets.map((target) => ({
      name: target.name,
      url: `${target.baseUrl}/api/codex/weekly-remaining`
    }))
  ];

  let lastError;
  for (const target of urls) {
    try {
      const response = await fetchJsonResponse(target.url, headers);
      return {
        ...response,
        upstream: response.upstream || target.name
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Codex LB weekly remaining request failed");
}

function buildCodexLbRouteQuickPickItems(settings, currentMode, currentUpstreamMode, currentProviderId) {
  const upstreams = lbStatusLastPayload && typeof lbStatusLastPayload === "object"
    ? lbStatusLastPayload.upstreams || {}
    : {};
  const routeState = getCodexLbRouteState(settings);
  const headroomSelected = currentMode === "headroom";
  const directPrimarySelected = currentMode === "direct" && currentUpstreamMode === "primary";
  const directAutoSelected = currentMode === "direct" && currentUpstreamMode === "auto";
  const strictFallbackSelected = currentMode === "direct" && currentUpstreamMode === "fallback";

  return [
    {
      label: "$(rocket) Headroom Gateway",
      description: headroomSelected ? "current path" : "VM215 compression pilot",
      detail: formatCodexLbRoutePickDetail("headroom", upstreams.headroom, routeState.headroomBaseUrl),
      mode: "headroom"
    },
    {
      label: "$(server) Direct .246 Primary",
      description: directPrimarySelected ? "current path" : "direct VM214 primary",
      detail: `direct -> primary only (${formatCodexLbRoutePickDetail("primary", upstreams.primary, routeState.primaryBaseUrl)})`,
      mode: "primary-direct"
    },
    {
      label: "$(split-horizontal) Direct Auto Failover",
      description: directAutoSelected ? "current path" : ".246 then .234",
      detail: `direct -> primary then fallback (${routeState.primaryBaseUrl} -> ${routeState.fallbackBaseUrl})`,
      mode: "auto-direct"
    },
    {
      label: "$(plug) Strict .234 Direct",
      description: strictFallbackSelected ? "current strict route" : "bypass headroom and use only .234",
      detail: `direct -> fallback only (${routeState.fallbackBaseUrl})`,
      mode: "fallback-direct"
    },
    {
      label: "$(sign-in) OpenAI / ChatGPT Plus-Pro",
      description: currentProviderId === "openai" ? "current provider" : "switch provider and sign in directly",
      detail: "Run the official codex login for your ChatGPT Plus/Pro account, then return to your canonical Codex-LB history.",
      action: "openai-direct-login"
    }
  ];
}

async function startOpenAiDirectLogin(context, outputChannel, statusBarItem) {
  const { configText, info: current } = await getCurrentProviderInfo();
  const settings = getSettings();
  const codexBinaryPath = resolveCodexCliBinaryPath();
  if (current.providerId !== "openai" && codexLbRouteShouldOwnProvider(settings)) {
    const route = formatCodexLbRouteLine(settings);
    const choice = await vscode.window.showWarningMessage(
      `This switches Codex away from Codex-LB (${route}) to direct OpenAI/ChatGPT. HR/LB routing will not be used until you select a Codex-LB route again.`,
      { modal: true },
      "Switch to OpenAI"
    );
    if (choice !== "Switch to OpenAI") {
      await appendDebugLog(context, outputChannel, "openai-direct-login-cancelled-codex-lb-active", {
        providerId: current.providerId,
        route
      });
      return;
    }
  }
  openAiDirectLoginAllowedUntilMs = Date.now() + 10 * 60 * 1000;
  const terminal = vscode.window.createTerminal({
    name: "Codex OpenAI Login"
  });

  let providerChanged = false;
  if (current.providerId !== "openai" || current.providerId === "custom") {
    const nextText = buildUpdatedConfigText(configText, {
      providerId: "openai",
      openaiModel: settings.openaiModel
    });
    await writeConfigText(DEFAULTS.configPath, nextText);
    providerChanged = nextText !== configText;
    await appendDebugLog(context, outputChannel, "openai-direct-login-provider-written", {
      previousProviderId: current.providerId,
      previousProfile: current.profile,
      nextProviderId: "openai"
    });
    if (statusBarItem) {
      await refreshStatusBar(context, outputChannel, statusBarItem);
    }
  }

  try {
    await executeCodexLogout(codexBinaryPath);
    await appendDebugLog(context, outputChannel, "openai-direct-login-logout-success");
  } catch (error) {
    await appendDebugLog(context, outputChannel, "openai-direct-login-logout-skipped", {
      message: error instanceof Error ? error.message : String(error)
    });
  }

  let authMtimeMs = 0;
  try {
    const authStat = await fs.stat(CODEX_AUTH_FILE);
    authMtimeMs = Math.round(authStat.mtimeMs);
  } catch {
    authMtimeMs = 0;
  }
  pendingOpenAiDirectLogin = {
    authMtimeMs,
    startedAt: Date.now()
  };
  await appendDebugLog(context, outputChannel, "openai-direct-login-armed", {
    providerChanged,
    authMtimeMs
  });

  terminal.show(true);
  terminal.sendText(`${shellQuote(codexBinaryPath)} login`, true);
  await appendDebugLog(context, outputChannel, "openai-direct-login-started", {
    providerChanged,
    codexBinaryPath
  });

  void vscode.window.showInformationMessage(
    "Started direct ChatGPT Plus/Pro sign-in in the terminal. After auth.json updates, the extension host will restart automatically."
  );
}

async function maybeFinalizePendingOpenAiDirectLogin(context, outputChannel) {
  if (!pendingOpenAiDirectLogin) {
    return;
  }

  let authStat = null;
  try {
    authStat = await fs.stat(CODEX_AUTH_FILE);
  } catch {
    authStat = null;
  }
  if (!authStat) {
    return;
  }

  const nextMtimeMs = Math.round(authStat.mtimeMs);
  if (nextMtimeMs <= Number(pendingOpenAiDirectLogin.authMtimeMs || 0)) {
    return;
  }

  pendingOpenAiDirectLogin = null;

  const settings = getSettings();
  if (settings.autoOpenCodexSidebar) {
    await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, true);
    await appendDebugLog(context, outputChannel, "openai-direct-login-post-auth-sidebar-armed");
  }
  await appendDebugLog(context, outputChannel, "openai-direct-login-auth-updated", {
    authMtimeMs: nextMtimeMs
  });
  void vscode.window.showInformationMessage(
    "Direct ChatGPT Plus/Pro login completed. Restarting the extension host to load the OpenAI provider."
  );
  await switchToExplorerBeforeWindowLifecycle(context, outputChannel, "openai-direct-login-restart-after-auth");
  await vscode.commands.executeCommand("workbench.action.restartExtensionHost");
}

function formatCodexLbRoutePickMessageLabel(picked) {
  return String((picked && picked.label) || "")
    .replace(/\$\([^)]+\)\s*/g, "")
    .trim() || String((picked && picked.mode) || "route");
}

function formatCodexLbRoutePickDetail(name, upstream, fallbackText) {
  if (!upstream || typeof upstream !== "object") {
    return fallbackText;
  }
  const url = String(upstream.base_url || "").trim();
  const health = upstream.ok ? "healthy" : `down: ${String(upstream.error || upstream.status || "unknown")}`;
  return `${name} ${url || fallbackText}: ${health}`;
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

async function refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem) {
  try {
    const { info } = await getCurrentProviderInfo();
    const settings = getSettings();

    const cachedAccountId = String(context.globalState.get(STATUSBAR_LAST_ACCOUNT_ID_KEY, "") || "").trim();
    let activeAccountId = "";
    let statusText = `$(comment-discussion) Codex: ${info.label}`;
    const tooltipLines = [
      `Current provider: ${info.label}`,
      `Active profile: ${info.profile}`,
      `Config: ${DEFAULTS.configPath}`,
      `Click for quick actions`
    ];

    let metrics = null;
    let metricsError = null;
    try {
      metrics = await withTimeout(
        getCurrentAccountRemainingMetrics(context, outputChannel, settings),
        STATUSBAR_ROTATION_METRICS_TIMEOUT_MS
      );
    } catch (error) {
      metricsError = error instanceof Error ? error.message : String(error);
    }

    if (metrics && metrics.available) {
      activeAccountId = String(metrics.accountId || "").trim();
      if (activeAccountId) {
        tooltipLines.push(`Connected account: ${activeAccountId}`);
        await context.globalState.update(STATUSBAR_LAST_ACCOUNT_ID_KEY, activeAccountId);
      }
      tooltipLines.push(`5h Remaining: ${metrics.fiveHourRemainingLabel}`);
      tooltipLines.push(`Weekly Remaining: ${metrics.weeklyRemainingLabel}`);
    } else if (metrics && metrics.reason === "current-account-not-in-ranking") {
      if (cachedAccountId) {
        activeAccountId = cachedAccountId;
        tooltipLines.push(`Connected account: ${activeAccountId}`);
      }
      tooltipLines.push(`Account metrics unavailable: current account not present in ranking cache`);
    } else if (metrics && metrics.reason) {
      if (cachedAccountId) {
        activeAccountId = cachedAccountId;
        tooltipLines.push(`Connected account: ${activeAccountId}`);
      }
      tooltipLines.push(`Account metrics unavailable: ${metrics.reason}`);
    } else if (metricsError) {
      if (cachedAccountId) {
        activeAccountId = cachedAccountId;
        tooltipLines.push(`Connected account: ${activeAccountId}`);
      }
      tooltipLines.push(`Account metrics unavailable: ${metricsError}`);
    }

    if (activeAccountId) {
      statusText += ` | ${activeAccountId}`;
    }

    const shouldShowStatusBar = settings.showStatusBarItem && settings.rotationShowStatusBarItem;
    const shouldShowMetricsStatusBar = shouldShowStatusBar && settings.rotationEnabled;
    if (metricsStatusBarItem) {
      if (shouldShowMetricsStatusBar) {
        if (metrics && metrics.available) {
          metricsStatusBarItem.text = `$(history)${metrics.fiveHourRemainingLabel} $(calendar)${metrics.weeklyRemainingLabel}`;
          metricsStatusBarItem.tooltip = [
            `Active: ${metrics.accountId}`,
            `5h Remaining: ${metrics.fiveHourRemainingLabel}`,
            `Weekly Remaining: ${metrics.weeklyRemainingLabel}`,
            `Auto refresh: every 5 minutes`
          ].join("\n");
        } else {
          const unavailableReason = metricsError || (metrics && metrics.reason ? metrics.reason : "unknown");
          metricsStatusBarItem.text = "$(history)-- $(calendar)--";
          metricsStatusBarItem.tooltip = [
            `Could not load active account remaining metrics`,
            `Reason: ${unavailableReason}`,
            `Auto refresh: every 5 minutes`
          ].join("\n");
        }
        metricsStatusBarItem.show();
      } else {
        metricsStatusBarItem.hide();
      }
    }

    statusBarItem.text = statusText;
    statusBarItem.tooltip = tooltipLines.join("\n");
    if (shouldShowStatusBar) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
    await appendDebugLog(context, outputChannel, "statusbar-refresh", {
      providerId: info.providerId,
      profile: info.profile,
      label: info.label,
      visible: shouldShowStatusBar,
      statusText,
      metricsStatusText: metricsStatusBarItem ? metricsStatusBarItem.text : null
    });
  } catch (error) {
    statusBarItem.hide();
    if (metricsStatusBarItem) {
      metricsStatusBarItem.hide();
    }
    await appendDebugLog(context, outputChannel, "statusbar-refresh-error", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function maybeOpenSidebarAfterRestart(context, outputChannel) {
  const shouldOpen = context.globalState.get(OPEN_SIDEBAR_AFTER_RESTART_KEY, false);
  const settings = getSettings();
  const workspaceAlias = String(context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_KEY, "") || "").trim();
  const workspaceProjectPath = getCurrentWorkspaceProjectPath();
  const blankWindowFallbackEligible = !shouldOpen
    && settings.autoOpenCodexSidebar
    && looksLikeRemoteSessionAlias(workspaceAlias)
    && Boolean(workspaceProjectPath)
    && !vscode.window.activeTextEditor
    && vscode.window.visibleTextEditors.length === 0;
  const activationLayoutEligible = !shouldOpen
    && settings.autoOpenCodexSidebar
    && looksLikeRemoteSessionAlias(workspaceAlias)
    && Boolean(workspaceProjectPath);
  const shouldOpenSidebar = settings.autoOpenCodexSidebar
    && (Boolean(shouldOpen) || blankWindowFallbackEligible || activationLayoutEligible);

  if (!shouldOpenSidebar) {
    await appendDebugLog(context, outputChannel, "post-restart-sidebar-skip", {
      workspaceAlias: workspaceAlias || null,
      blankWindowFallbackEligible,
      activationLayoutEligible,
      workspaceProjectPath: workspaceProjectPath || null
    });
    return;
  }

  if (shouldOpen) {
    await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, false);
  }
  const debugPayload = {
    detectedCurrentAlias: detectCurrentSshAlias(),
    remoteName: String(vscode.env.remoteName || ""),
    workspaceAlias: workspaceAlias || null,
    workspaceProjectPath: workspaceProjectPath || null,
    openedBecauseRestartFlag: Boolean(shouldOpen),
    openedBecauseBlankWindow: blankWindowFallbackEligible,
    openedBecauseActivationLayout: activationLayoutEligible,
    lastRotationTarget: context.globalState.get(ROTATION_LAST_TARGET_KEY, null),
    lastRotationCurrent: context.globalState.get(ROTATION_LAST_CURRENT_KEY, null),
    lastRotationLogoutAt: context.globalState.get(ROTATION_LAST_LOGOUT_AT_KEY, null)
  };
  await appendDebugLog(context, outputChannel, "post-restart-sidebar-open-request", debugPayload);

  let sidebarOpenState = "idle";
  for (const delayMs of CODEX_LAYOUT_SETTLE_DELAYS_MS) {
    await appendDebugLog(context, outputChannel, "post-restart-sidebar-open-scheduled", {
      ...debugPayload,
      delayMs
    });
    setTimeout(() => {
      void (async () => {
        if (sidebarOpenState !== "idle") {
          return;
        }
        sidebarOpenState = "opening";
        try {
          await appendDebugLog(context, outputChannel, "post-restart-sidebar-open-attempt", {
            ...debugPayload,
            delayMs
          });
          await prepareCodexOnlyLayout(context, outputChannel, "post-restart-sidebar-open", {
            keepAuxiliaryBar: true
          });
          const opened = await openCodexSidebarBestEffort(context, outputChannel);
          if (!opened) {
            throw new Error("No Codex sidebar command matched");
          }
          sidebarOpenState = "done";
          await appendDebugLog(context, outputChannel, "post-restart-sidebar-open-dispatched", {
            ...debugPayload,
            delayMs
          });
        } catch (error) {
          sidebarOpenState = "idle";
          await appendDebugLog(context, outputChannel, "post-restart-sidebar-open-failed", {
            ...debugPayload,
            delayMs,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      })();
    }, delayMs);
  }
}

async function prepareCodexOnlyLayout(context, outputChannel, reason, options = {}) {
  const dirtyDocuments = vscode.workspace.textDocuments.filter((document) =>
    document && document.isDirty && document.uri && document.uri.scheme !== "output"
  );

  if (dirtyDocuments.length === 0) {
    try {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await appendDebugLog(context, outputChannel, "codex-only-layout-close-editors-dispatched", {
        reason
      });
    } catch (error) {
      await appendDebugLog(context, outputChannel, "codex-only-layout-close-editors-failed", {
        reason,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  } else {
    await appendDebugLog(context, outputChannel, "codex-only-layout-close-editors-skipped-dirty", {
      reason,
      dirtyCount: dirtyDocuments.length,
      dirtyFiles: dirtyDocuments.map((document) => document.uri.toString()).slice(0, 12)
    });
  }

  const layoutCommands = options.keepAuxiliaryBar
    ? ["workbench.action.closePanel"]
    : ["workbench.action.closePanel", "workbench.action.closeAuxiliaryBar"];

  if (options.keepAuxiliaryBar) {
    await appendDebugLog(context, outputChannel, "codex-only-layout-close-auxiliary-bar-skipped", {
      reason
    });
  }

  for (const command of layoutCommands) {
    try {
      await vscode.commands.executeCommand(command);
      await appendDebugLog(context, outputChannel, "codex-only-layout-command-dispatched", {
        reason,
        command
      });
    } catch (error) {
      await appendDebugLog(context, outputChannel, "codex-only-layout-command-failed", {
        reason,
        command,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

async function maybeCloseAuxiliaryBarOnActivate(context, outputChannel) {
  const settings = getSettings();
  if (settings.autoOpenCodexSidebar) {
    await appendDebugLog(context, outputChannel, "activate-close-auxiliary-bar-skipped-auto-open-enabled");
    return;
  }
  for (const delayMs of [0, 1200, 4000]) {
    setTimeout(() => {
      void (async () => {
        try {
          await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
          await appendDebugLog(context, outputChannel, "activate-close-auxiliary-bar-dispatched", {
            delayMs
          });
        } catch (error) {
          await appendDebugLog(context, outputChannel, "activate-close-auxiliary-bar-failed", {
            delayMs,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      })();
    }, delayMs);
  }
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, toFiniteNumber(value, 0)));
}

function formatPercent(value) {
  const bounded = clampPercent(value);
  if (Math.abs(bounded - Math.round(bounded)) < 0.05) {
    return `${Math.round(bounded)}%`;
  }
  return `${bounded.toFixed(1)}%`;
}

async function switchToExplorerBeforeWindowLifecycle(context, outputChannel, reason) {
  const settings = getSettings();
  if (settings.autoOpenCodexSidebar) {
    await appendDebugLog(context, outputChannel, "window-lifecycle-view-switch-skipped-auto-open-enabled", {
      reason
    });
    return;
  }
  const commands = [
    "workbench.action.closeAuxiliaryBar",
    "workbench.action.closePanel",
    "workbench.action.closeSidebar",
    "workbench.view.explorer",
    "workbench.files.action.focusFilesExplorer",
    "workbench.action.closeAuxiliaryBar"
  ];
  for (const command of commands) {
    try {
      await vscode.commands.executeCommand(command);
      await appendDebugLog(context, outputChannel, "window-lifecycle-view-command-dispatched", {
        reason,
        command
      });
    } catch (error) {
      await appendDebugLog(context, outputChannel, "window-lifecycle-view-command-failed", {
        reason,
        command,
        message: error instanceof Error ? error.message : String(error)
      });
    }
    await delay(COMMAND_CHAIN_STEP_DELAY_MS);
  }
}

function normalizeAccountEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function expandHomePath(inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) {
    return "";
  }
  if (raw === "~") {
    return os.homedir();
  }
  if (raw.startsWith("~/")) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return raw;
}

function getRotationAuthSnapshotsDir(settings) {
  const configured = expandHomePath(settings.rotationAuthSnapshotsDir);
  return configured || DEFAULT_ROTATION_AUTH_SNAPSHOTS_DIR;
}

function getCodexLbProxyBaseUrl(settings) {
  const configured = String(settings.codexLbProxyBaseUrl || "").trim().replace(/\/+$/, "");
  return configured || DEFAULT_CODEX_LB_PROXY_BASE_URL;
}

function getCodexLbDashboardUrl(settings) {
  const configured = String(settings.codexLbDashboardUrl || "").trim();
  return configured || DEFAULT_CODEX_LB_DASHBOARD_URL;
}

function getCodexLbWeeklyRemainingUrl(settings) {
  return `${getCodexLbProxyBaseUrl(settings)}/api/codex/weekly-remaining`;
}

function getCodexLbStatusUrl(settings) {
  return `${getCodexLbProxyBaseUrl(settings)}/__lb/status`;
}

function getCodexLbRouteStatePath(settings) {
  const configured = expandHomePath(settings.codexLbRouteStatePath);
  return configured || DEFAULT_CODEX_LB_ROUTE_STATE_PATH;
}

function getCodexLbProviderEnvPaths(settings) {
  const configured = expandHomePath(settings.codexLbProviderEnvPath);
  return [configured, DEFAULT_CODEX_LB_PROVIDER_ENV_PATH, FALLBACK_ENV_PATH]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getCodexLbModelCacheRefresherPaths(settings) {
  const configured = expandHomePath(settings.codexLbModelCacheRefresherPath);
  return [configured, DEFAULT_CODEX_LB_MODEL_CACHE_REFRESHER_PATH]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getCodexLbRouteSelectorPaths(settings) {
  const configured = expandHomePath(settings.codexLbRouteSelectorPath);
  return [configured, DEFAULT_CODEX_LB_ROUTE_SELECTOR_PATH]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function resolveExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      fsSync.accessSync(candidate, fsSync.constants.F_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(`Missing required helper file. Checked: ${candidates.join(", ")}`);
}

function stripShellEnvValue(value) {
  let text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const quote = text[0];
  if ((quote === "\"" || quote === "'") && text.endsWith(quote)) {
    return text.slice(1, -1);
  }
  const commentIndex = text.indexOf(" #");
  if (commentIndex !== -1) {
    text = text.slice(0, commentIndex).trim();
  }
  return text;
}

function execFilePromise(command, args, timeout, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, ...options }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message || "").trim();
        reject(new Error(detail || error.message));
        return;
      }
      resolve({
        stdout: String(stdout || ""),
        stderr: String(stderr || "")
      });
    });
  });
}

function execFileResult(command, args, timeout, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, ...options }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        exitCode: error && typeof error.code === "number" ? error.code : 0,
        signal: error && error.signal ? String(error.signal) : "",
        message: error ? String(error.message || "") : "",
        stdout: String(stdout || ""),
        stderr: String(stderr || "")
      });
    });
  });
}

function quoteSqlString(value) {
  return `'${String(value == null ? "" : value).replace(/'/g, "''")}'`;
}

function isCodexLbProviderInfo(info) {
  return String(info && info.label || "").trim().toLowerCase() === "provider:codex-lb";
}

function getTaskHistoryProviderBucketForInfo(info) {
  if (String(info && info.providerId || "").trim() === "openai") {
    return "openai";
  }
  if (isCodexLbProviderInfo(info)) {
    return "codex-lb";
  }
  return "";
}

async function findLatestCodexStateDbPath() {
  let entries = [];
  try {
    entries = await fs.readdir(CODEX_STATE_ROOT_DIR, { withFileTypes: true });
  } catch {
    return "";
  }

  const candidates = entries
    .filter((entry) => entry && typeof entry.isFile === "function" && entry.isFile())
    .map((entry) => {
      const match = String(entry.name || "").match(CODEX_STATE_DB_NAME_PATTERN);
      if (!match) {
        return null;
      }
      return {
        version: Number(match[1] || 0),
        dbPath: path.join(CODEX_STATE_ROOT_DIR, entry.name)
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.version - left.version);

  return candidates[0] ? candidates[0].dbPath : "";
}

async function runSqliteStatement(dbPath, sql, timeoutMs = DEFAULT_SQLITE_TIMEOUT_MS) {
  return execFilePromise("sqlite3", [dbPath, sql], timeoutMs);
}

async function backupSqliteDatabase(dbPath) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const backupPath = `${dbPath}.bak.history-merge-${timestamp}`;
  await execFilePromise("sqlite3", [dbPath, `.backup ${backupPath}`], DEFAULT_SQLITE_TIMEOUT_MS);
  try {
    await fs.chmod(backupPath, 0o600);
  } catch {
    // Best effort only.
  }
  return backupPath;
}

function parseLeadingInteger(text) {
  const match = String(text || "").trim().match(/^(-?\d+)/);
  return match ? Number(match[1]) : 0;
}

async function normalizeVsCodeTaskHistoryProviderBuckets(context, outputChannel, options = {}) {
  const providerInfo = options.currentProviderInfo || null;
  const toProviderId = String(options.toProviderId || getTaskHistoryProviderBucketForInfo(providerInfo)).trim();
  const fromProviderIds = Array.isArray(options.fromProviderIds) && options.fromProviderIds.length > 0
    ? options.fromProviderIds
    : (options.fromProviderId ? [options.fromProviderId] : ["openai", "codex-lb"]);
  const sourceProviderIds = Array.from(new Set(
    fromProviderIds
      .map((value) => String(value || "").trim())
      .filter((value) => value && value !== toProviderId)
  ));

  if (!toProviderId || sourceProviderIds.length === 0) {
    await appendDebugLog(context, outputChannel, "history-provider-normalize-skipped", {
      reason: "unsupported-or-already-target-provider",
      currentProviderLabel: providerInfo ? providerInfo.label : null,
      fromProviderIds: sourceProviderIds,
      toProviderId
    });
    return {
      changed: false,
      skipped: true,
      reason: "unsupported-or-already-target-provider"
    };
  }

  const dbPath = await findLatestCodexStateDbPath();
  if (!dbPath) {
    await appendDebugLog(context, outputChannel, "history-provider-normalize-skipped", {
      reason: "state-db-missing",
      fromProviderIds: sourceProviderIds,
      toProviderId
    });
    return {
      changed: false,
      skipped: true,
      reason: "state-db-missing"
    };
  }

  const sourceProvidersSql = sourceProviderIds.map(quoteSqlString).join(", ");
  const countSql = [
    "select count(*)",
    "from threads",
    "where source = 'vscode'",
    "and thread_source = 'user'",
    `and model_provider in (${sourceProvidersSql});`
  ].join(" ");
  const beforeCount = parseLeadingInteger((await runSqliteStatement(dbPath, countSql)).stdout);
  if (beforeCount <= 0) {
    await appendDebugLog(context, outputChannel, "history-provider-normalize-noop", {
      dbPath,
      fromProviderIds: sourceProviderIds,
      toProviderId,
      beforeCount
    });
    return {
      changed: false,
      skipped: false,
      beforeCount,
      dbPath
    };
  }

  const backupPath = await backupSqliteDatabase(dbPath);
  const updateSql = [
    "begin immediate;",
    "update threads",
    `set model_provider = ${quoteSqlString(toProviderId)}`,
    "where source = 'vscode'",
    "and thread_source = 'user'",
    `and model_provider in (${sourceProvidersSql});`,
    "select changes();",
    "commit;"
  ].join(" ");
  const changed = parseLeadingInteger((await runSqliteStatement(dbPath, updateSql)).stdout);

  await appendDebugLog(context, outputChannel, "history-provider-normalized", {
    dbPath,
    backupPath,
    fromProviderIds: sourceProviderIds,
    toProviderId,
    beforeCount,
    changed
  });
  return {
    changed,
    skipped: false,
    beforeCount,
    backupPath,
    dbPath
  };
}

async function listVsCodeTaskHistoryThreads(dbPath) {
  const listSql = [
    "select id || char(31) || coalesce(rollout_path, '')",
    "from threads",
    "where source = 'vscode'",
    "and coalesce(thread_source, 'user') in ('user', 'codex-space');"
  ].join(" ");
  return String((await runSqliteStatement(dbPath, listSql)).stdout || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => {
      const [id, rolloutPath = ""] = line.split("\u001f");
      return {
        id: String(id || "").trim(),
        rolloutPath: String(rolloutPath || "").trim()
      };
    })
    .filter((thread) => thread.id);
}

async function clearVsCodeTaskHistoryThreads(dbPath, threadIds) {
  const normalizedIds = Array.from(new Set(
    Array.from(threadIds || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
  if (normalizedIds.length <= 0) {
    return;
  }

  const tempTableSql = normalizedIds
    .map((id, index) => `${index === 0 ? "select" : "union all select"} ${quoteSqlString(id)} as id`)
    .join(" ");
  const clearSql = [
    "pragma foreign_keys = on;",
    "begin immediate;",
    `create temp table codex_threads_to_clear as ${tempTableSql};`,
    "delete from thread_spawn_edges",
    "where parent_thread_id in (select id from codex_threads_to_clear)",
    "or child_thread_id in (select id from codex_threads_to_clear);",
    "delete from threads",
    "where id in (select id from codex_threads_to_clear);",
    "drop table codex_threads_to_clear;",
    "commit;"
  ].join(" ");
  await runSqliteStatement(dbPath, clearSql);
}

async function readCodexSessionIndexEntries() {
  let rawText = "";
  try {
    rawText = await fs.readFile(CODEX_SESSION_INDEX_PATH, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  return String(rawText || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return {
          line,
          id: String(parsed && parsed.id || "").trim()
        };
      } catch {
        return {
          line,
          id: ""
        };
      }
    });
}

async function removeCodexSessionIndexEntries(threadIds) {
  const entries = await readCodexSessionIndexEntries();
  if (entries.length <= 0) {
    return {
      beforeCount: 0,
      afterCount: 0,
      removedCount: 0
    };
  }

  const normalizedIds = new Set(
    Array.from(threadIds || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  const keptLines = [];
  let removedCount = 0;
  for (const entry of entries) {
    if (entry.id && normalizedIds.has(entry.id)) {
      removedCount += 1;
      continue;
    }
    keptLines.push(entry.line);
  }

  if (removedCount > 0) {
    await fs.writeFile(
      CODEX_SESSION_INDEX_PATH,
      keptLines.length > 0 ? `${keptLines.join("\n")}\n` : "",
      "utf8"
    );
  }

  return {
    beforeCount: entries.length,
    afterCount: keptLines.length,
    removedCount
  };
}

async function collectMatchingFiles(rootDir, predicate) {
  const matches = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry) {
        continue;
      }
      const entryPath = path.join(currentDir, entry.name);
      if (typeof entry.isDirectory === "function" && entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (typeof entry.isFile === "function" && entry.isFile() && predicate(entry.name, entryPath)) {
        matches.push(entryPath);
      }
    }
  }

  return matches;
}

async function collectCodexRolloutFiles(threadIds, explicitRolloutPaths = []) {
  const normalizedIds = Array.from(new Set(
    Array.from(threadIds || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
  const rolloutFiles = new Set(
    Array.isArray(explicitRolloutPaths)
      ? explicitRolloutPaths
        .map((value) => String(value || "").trim())
        .filter(Boolean)
      : []
  );
  if (normalizedIds.length <= 0) {
    return Array.from(rolloutFiles);
  }

  const discovered = await collectMatchingFiles(
    CODEX_SESSIONS_ROOT_DIR,
    (entryName) => entryName.startsWith("rollout-")
      && entryName.endsWith(".jsonl")
      && normalizedIds.some((threadId) => entryName.includes(threadId))
  );
  for (const filePath of discovered) {
    rolloutFiles.add(filePath);
  }
  return Array.from(rolloutFiles);
}

async function collectCodexShellSnapshotFiles(threadIds) {
  const normalizedIds = new Set(
    Array.from(threadIds || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  if (normalizedIds.size <= 0) {
    return [];
  }

  let entries = [];
  try {
    entries = await fs.readdir(CODEX_SHELL_SNAPSHOTS_DIR, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry && typeof entry.isFile === "function" && entry.isFile())
    .map((entry) => entry.name)
    .filter((entryName) => Array.from(normalizedIds).some((threadId) => entryName.startsWith(`${threadId}.`)))
    .map((entryName) => path.join(CODEX_SHELL_SNAPSHOTS_DIR, entryName));
}

async function deleteFiles(filePaths) {
  const removedPaths = [];
  const uniquePaths = Array.from(new Set(
    Array.isArray(filePaths)
      ? filePaths.map((value) => String(value || "").trim()).filter(Boolean)
      : []
  ));

  for (const filePath of uniquePaths) {
    try {
      await fs.unlink(filePath);
      removedPaths.push(filePath);
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }
      throw error;
    }
  }

  return removedPaths;
}

function isCodexSqliteRepairSidecarName(entryName) {
  return CODEX_SQLITE_REPAIR_SIDECAR_SUFFIXES.some((suffix) => String(entryName || "").endsWith(suffix));
}

function isSafeCodexSqliteRepairSidecarPath(candidatePath) {
  const normalizedPath = path.resolve(String(candidatePath || ""));
  const parentDir = path.dirname(normalizedPath);
  const entryName = path.basename(normalizedPath);
  return parentDir === CODEX_STATE_ROOT_DIR && isCodexSqliteRepairSidecarName(entryName);
}

function formatCodexSqliteRepairTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function trimCodexSqliteRepairText(text, maxChars = 1200) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 3)}...`;
}

async function collectCodexSqliteSidecarDirectories() {
  let entries = [];
  try {
    entries = await fs.readdir(CODEX_STATE_ROOT_DIR, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry && typeof entry.isDirectory === "function" && entry.isDirectory())
    .map((entry) => String(entry.name || "").trim())
    .filter(isCodexSqliteRepairSidecarName)
    .map((entryName) => path.join(CODEX_STATE_ROOT_DIR, entryName));
}

async function reserveCodexSqliteRepairBackupDir() {
  const backupsRoot = path.join(CODEX_STATE_ROOT_DIR, "db-backups");
  await fs.mkdir(backupsRoot, { recursive: true });
  const baseName = `root-owned-wal-shm-dirs-${formatCodexSqliteRepairTimestamp()}`;
  for (let index = 0; index < 20; index += 1) {
    const backupDir = path.join(backupsRoot, index === 0 ? baseName : `${baseName}-${index}`);
    try {
      await fs.mkdir(backupDir, { recursive: false });
      return backupDir;
    } catch (error) {
      if (error && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Could not reserve a unique backup directory under ${backupsRoot}.`);
}

async function moveCodexSqliteSidecarDirectories(sidecarDirs) {
  const uniqueDirs = Array.from(new Set(
    Array.isArray(sidecarDirs)
      ? sidecarDirs.map((value) => String(value || "").trim()).filter(Boolean)
      : []
  ));
  if (uniqueDirs.length <= 0) {
    return {
      backupDir: "",
      moved: []
    };
  }

  const backupDir = await reserveCodexSqliteRepairBackupDir();
  const moved = [];
  for (const sourcePath of uniqueDirs) {
    if (!isSafeCodexSqliteRepairSidecarPath(sourcePath)) {
      throw new Error(`Refusing to move unexpected SQLite sidecar path: ${sourcePath}`);
    }
    const targetPath = path.join(backupDir, path.basename(sourcePath));
    let movedWith = "rename";
    try {
      await fs.rename(sourcePath, targetPath);
    } catch (error) {
      const code = error && error.code ? String(error.code) : "";
      if (code !== "EACCES" && code !== "EPERM") {
        throw error;
      }
      const result = await execFileResult("sudo", ["-n", "mv", "--", sourcePath, targetPath], DEFAULT_SQLITE_TIMEOUT_MS);
      if (!result.ok) {
        const detail = trimCodexSqliteRepairText(result.stderr || result.stdout || result.message);
        throw new Error(`sudo mv failed for ${sourcePath}: ${detail || "unknown error"}`);
      }
      movedWith = "sudo-mv";
    }
    moved.push({
      from: sourcePath,
      to: targetPath,
      movedWith
    });
  }

  return {
    backupDir,
    moved
  };
}

function getCurrentUidGidForCodexRepair() {
  if (typeof process.getuid !== "function" || typeof process.getgid !== "function") {
    throw new Error("Codex state repair requires a POSIX runtime with uid/gid support.");
  }
  return {
    uid: process.getuid(),
    gid: process.getgid()
  };
}

function formatCodexRepairMode(mode) {
  return `0${((Number(mode) || 0) & 0o7777).toString(8)}`;
}

function isPathInsideDirectory(candidatePath, rootDir) {
  const relativePath = path.relative(path.resolve(rootDir), path.resolve(candidatePath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isSafeCodexThreadRecorderRepairPath(candidatePath) {
  const normalizedPath = path.resolve(String(candidatePath || ""));
  if (normalizedPath === CODEX_SESSION_INDEX_PATH) {
    return true;
  }
  if (normalizedPath === path.resolve(CODEX_SESSIONS_ROOT_DIR)) {
    return true;
  }
  return isPathInsideDirectory(normalizedPath, CODEX_SESSIONS_ROOT_DIR);
}

function isCodexThreadRecorderRepairFileName(entryName) {
  return CODEX_THREAD_RECORDER_REPAIR_FILE_PATTERN.test(String(entryName || "").trim());
}

function shouldRepairCodexThreadRecorderStat(stat, expectedUid, expectedGid) {
  if (!stat) {
    return false;
  }
  const requiredMode = stat.isDirectory() ? 0o700 : 0o600;
  return stat.uid !== expectedUid || stat.gid !== expectedGid || (stat.mode & requiredMode) !== requiredMode;
}

function buildCodexThreadRecorderIssue(entryPath, stat, expectedUid, expectedGid) {
  const requiredMode = stat.isDirectory() ? 0o700 : 0o600;
  return {
    path: entryPath,
    type: stat.isDirectory() ? "directory" : "file",
    uid: stat.uid,
    gid: stat.gid,
    mode: stat.mode & 0o7777,
    modeText: formatCodexRepairMode(stat.mode),
    needsChown: stat.uid !== expectedUid || stat.gid !== expectedGid,
    needsChmod: (stat.mode & requiredMode) !== requiredMode,
    targetMode: (stat.mode & 0o7777) | requiredMode,
    targetModeText: formatCodexRepairMode((stat.mode & 0o7777) | requiredMode)
  };
}

async function collectCodexThreadRecorderPermissionIssues() {
  const { uid, gid } = getCurrentUidGidForCodexRepair();
  const issues = [];

  async function maybeCollectPath(entryPath, stat) {
    if (!isSafeCodexThreadRecorderRepairPath(entryPath)) {
      return;
    }
    if (shouldRepairCodexThreadRecorderStat(stat, uid, gid)) {
      issues.push(buildCodexThreadRecorderIssue(entryPath, stat, uid, gid));
    }
  }

  const sessionIndexStat = await statIfExists(CODEX_SESSION_INDEX_PATH);
  if (sessionIndexStat && sessionIndexStat.isFile()) {
    await maybeCollectPath(CODEX_SESSION_INDEX_PATH, sessionIndexStat);
  }

  async function walkDirectory(directoryPath) {
    let entries = [];
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (isMissingFileError(error)) {
        return;
      }
      throw error;
    }

    const directoryStat = await statIfExists(directoryPath);
    if (directoryStat && directoryStat.isDirectory()) {
      await maybeCollectPath(directoryPath, directoryStat);
    }

    for (const entry of entries) {
      const entryName = String(entry && entry.name || "");
      const entryPath = path.join(directoryPath, entryName);
      if (entry.isSymbolicLink && entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory && entry.isDirectory()) {
        await walkDirectory(entryPath);
        continue;
      }
      if (!(entry.isFile && entry.isFile()) || !isCodexThreadRecorderRepairFileName(entryName)) {
        continue;
      }
      const stat = await statIfExists(entryPath);
      if (stat && stat.isFile()) {
        await maybeCollectPath(entryPath, stat);
      }
    }
  }

  await walkDirectory(CODEX_SESSIONS_ROOT_DIR);
  return issues;
}

async function writeCodexThreadRecorderRepairManifest(issues) {
  if (!Array.isArray(issues) || issues.length <= 0) {
    return "";
  }

  const backupsRoot = path.join(CODEX_STATE_ROOT_DIR, "db-backups");
  await fs.mkdir(backupsRoot, { recursive: true });
  const baseName = `thread-recorder-permission-repair-${formatCodexSqliteRepairTimestamp()}.json`;
  for (let index = 0; index < 20; index += 1) {
    const manifestPath = path.join(
      backupsRoot,
      index === 0 ? baseName : baseName.replace(/\.json$/, `-${index}.json`)
    );
    const manifest = {
      createdAt: new Date().toISOString(),
      codexStateRoot: CODEX_STATE_ROOT_DIR,
      expectedOwner: getCurrentUidGidForCodexRepair(),
      rollbackNote: "This manifest records ownership/mode before repair. To roll back ownership only, chown/chmod the listed paths back to uid/gid/mode values.",
      issues: issues.map((issue) => ({
        path: issue.path,
        type: issue.type,
        uid: issue.uid,
        gid: issue.gid,
        mode: issue.mode,
        modeText: issue.modeText
      }))
    };
    try {
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
      return manifestPath;
    } catch (error) {
      if (error && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Could not reserve a thread recorder repair manifest under ${backupsRoot}.`);
}

async function chownCodexRepairPath(targetPath, uid, gid) {
  try {
    await fs.chown(targetPath, uid, gid);
    return "chown";
  } catch (error) {
    const code = error && error.code ? String(error.code) : "";
    if (code !== "EACCES" && code !== "EPERM") {
      throw error;
    }
    const result = await execFileResult(
      "sudo",
      ["-n", "chown", `${uid}:${gid}`, "--", targetPath],
      CODEX_THREAD_RECORDER_REPAIR_TIMEOUT_MS
    );
    if (!result.ok) {
      const detail = trimCodexSqliteRepairText(result.stderr || result.stdout || result.message);
      throw new Error(`sudo chown failed for ${targetPath}: ${detail || "unknown error"}`);
    }
    return "sudo-chown";
  }
}

async function chmodCodexRepairPath(targetPath, mode) {
  try {
    await fs.chmod(targetPath, mode);
    return "chmod";
  } catch (error) {
    const code = error && error.code ? String(error.code) : "";
    if (code !== "EACCES" && code !== "EPERM") {
      throw error;
    }
    const result = await execFileResult(
      "sudo",
      ["-n", "chmod", formatCodexRepairMode(mode), "--", targetPath],
      CODEX_THREAD_RECORDER_REPAIR_TIMEOUT_MS
    );
    if (!result.ok) {
      const detail = trimCodexSqliteRepairText(result.stderr || result.stdout || result.message);
      throw new Error(`sudo chmod failed for ${targetPath}: ${detail || "unknown error"}`);
    }
    return "sudo-chmod";
  }
}

async function repairCodexThreadRecorderPermissions(issues) {
  const { uid, gid } = getCurrentUidGidForCodexRepair();
  const uniqueIssues = Array.from(new Map(
    (Array.isArray(issues) ? issues : [])
      .map((issue) => [String(issue && issue.path || ""), issue])
      .filter(([issuePath]) => Boolean(issuePath))
  ).values());

  if (uniqueIssues.length <= 0) {
    return {
      manifestPath: "",
      repaired: [],
      skipped: []
    };
  }

  const manifestPath = await writeCodexThreadRecorderRepairManifest(uniqueIssues);
  const repaired = [];
  const skipped = [];
  for (const issue of uniqueIssues) {
    const targetPath = String(issue.path || "");
    if (!isSafeCodexThreadRecorderRepairPath(targetPath)) {
      throw new Error(`Refusing to repair unexpected Codex thread recorder path: ${targetPath}`);
    }
    const stat = await statIfExists(targetPath);
    if (!stat) {
      skipped.push({
        path: targetPath,
        reason: "missing"
      });
      continue;
    }

    const actions = [];
    if (stat.uid !== uid || stat.gid !== gid) {
      actions.push(await chownCodexRepairPath(targetPath, uid, gid));
    }
    const requiredMode = stat.isDirectory() ? 0o700 : 0o600;
    const targetMode = (stat.mode & 0o7777) | requiredMode;
    if ((stat.mode & requiredMode) !== requiredMode) {
      actions.push(await chmodCodexRepairPath(targetPath, targetMode));
    }
    repaired.push({
      path: targetPath,
      actions
    });
  }

  return {
    manifestPath,
    repaired,
    skipped
  };
}

async function runCodexSqliteRepairQuickChecks() {
  const checks = [];
  for (const dbName of CODEX_SQLITE_REPAIR_DB_NAMES) {
    const dbPath = path.join(CODEX_STATE_ROOT_DIR, dbName);
    const stat = await statIfExists(dbPath);
    if (!stat || !stat.isFile()) {
      checks.push({
        dbPath,
        ok: false,
        skipped: true,
        output: "missing"
      });
      continue;
    }

    const result = await execFileResult("sqlite3", [dbPath, "PRAGMA quick_check;"], DEFAULT_SQLITE_TIMEOUT_MS);
    checks.push({
      dbPath,
      ok: result.ok && String(result.stdout || "").trim() === "ok",
      skipped: false,
      exitCode: result.exitCode,
      signal: result.signal,
      output: trimCodexSqliteRepairText(result.stdout || result.stderr || result.message)
    });
  }
  return checks;
}

async function runCodexDoctorForRepair() {
  let codexBinaryPath = "";
  try {
    codexBinaryPath = resolveCodexCliBinaryPath();
  } catch {
    codexBinaryPath = "codex";
  }

  const result = await execFileResult(
    codexBinaryPath,
    ["doctor"],
    CODEX_SQLITE_REPAIR_DOCTOR_TIMEOUT_MS,
    {
      env: {
        ...process.env,
        TERM: process.env.TERM && process.env.TERM !== "dumb" ? process.env.TERM : "xterm-256color"
      }
    }
  );
  return {
    ...result,
    codexBinaryPath,
    summary: trimCodexSqliteRepairText(result.stdout || result.stderr || result.message, 2400)
  };
}

function summarizeCodexSqliteRepairChecks(checks) {
  return checks
    .map((check) => {
      if (check.skipped) {
        return `${path.basename(check.dbPath)}: missing`;
      }
      return `${path.basename(check.dbPath)}: ${check.ok ? "ok" : `failed (${check.output || "no output"})`}`;
    })
    .join("; ");
}

async function repairCodexSqliteStateCommand(context, outputChannel) {
  outputChannel.show(true);
  await appendDebugLog(context, outputChannel, "codex-state-repair-start", {
    codexStateRoot: CODEX_STATE_ROOT_DIR
  });

  try {
    const sidecarDirsBefore = await collectCodexSqliteSidecarDirectories();
    const moveResult = await moveCodexSqliteSidecarDirectories(sidecarDirsBefore);
    const sidecarDirsAfter = await collectCodexSqliteSidecarDirectories();
    const threadRecorderIssuesBefore = await collectCodexThreadRecorderPermissionIssues();
    const threadRecorderRepair = await repairCodexThreadRecorderPermissions(threadRecorderIssuesBefore);
    const threadRecorderIssuesAfter = await collectCodexThreadRecorderPermissionIssues();
    const quickChecks = await runCodexSqliteRepairQuickChecks();
    const doctor = await runCodexDoctorForRepair();
    const failedQuickChecks = quickChecks.filter((check) => !check.ok && !check.skipped);
    const missingQuickChecks = quickChecks.filter((check) => check.skipped);
    const failed = sidecarDirsAfter.length > 0 || failedQuickChecks.length > 0 || threadRecorderIssuesAfter.length > 0;

    await appendDebugLog(context, outputChannel, "codex-state-repair-complete", {
      sidecarDirsBefore,
      movedCount: moveResult.moved.length,
      backupDir: moveResult.backupDir || null,
      sidecarDirsAfter,
      threadRecorderIssuesBefore,
      threadRecorderRepairedCount: threadRecorderRepair.repaired.length,
      threadRecorderSkippedCount: threadRecorderRepair.skipped.length,
      threadRecorderManifestPath: threadRecorderRepair.manifestPath || null,
      threadRecorderIssuesAfter,
      quickChecks,
      doctorOk: doctor.ok,
      doctorExitCode: doctor.exitCode,
      doctorSignal: doctor.signal || null,
      codexBinaryPath: doctor.codexBinaryPath
    });

    appendOutputChannelLine(outputChannel, "Codex state repair");
    appendOutputChannelLine(outputChannel, `Moved sidecar directories: ${moveResult.moved.length}`);
    if (moveResult.backupDir) {
      appendOutputChannelLine(outputChannel, `Backup directory: ${moveResult.backupDir}`);
    }
    appendOutputChannelLine(outputChannel, `Thread recorder permission fixes: ${threadRecorderRepair.repaired.length}`);
    if (threadRecorderRepair.manifestPath) {
      appendOutputChannelLine(outputChannel, `Thread recorder manifest: ${threadRecorderRepair.manifestPath}`);
    }
    if (threadRecorderRepair.skipped.length > 0) {
      appendOutputChannelLine(outputChannel, `Thread recorder skipped missing paths: ${threadRecorderRepair.skipped.length}`);
    }
    appendOutputChannelLine(outputChannel, `SQLite quick_check: ${summarizeCodexSqliteRepairChecks(quickChecks)}`);
    appendOutputChannelLine(outputChannel, `Codex doctor: ${doctor.ok ? "ok" : `non-zero exit (${doctor.exitCode || doctor.signal || "unknown"})`}`);
    if (doctor.summary) {
      appendOutputChannelLine(outputChannel, doctor.summary);
    }

    if (failed) {
      const details = [
        sidecarDirsAfter.length > 0 ? `${sidecarDirsAfter.length} sidecar directories remain` : "",
        threadRecorderIssuesAfter.length > 0 ? `${threadRecorderIssuesAfter.length} thread recorder permission issues remain` : "",
        failedQuickChecks.length > 0 ? `${failedQuickChecks.length} SQLite quick_check failures` : ""
      ].filter(Boolean).join("; ");
      void vscode.window.showErrorMessage(`Codex state repair did not finish cleanly: ${details}. See Codex Provider Status Bar output.`);
      return;
    }

    const messageParts = [];
    if (moveResult.moved.length > 0) {
      messageParts.push(`moved ${moveResult.moved.length} bad sidecar directories`);
    } else {
      messageParts.push("no bad sidecar directories found");
    }
    if (threadRecorderRepair.repaired.length > 0) {
      messageParts.push(`fixed ${threadRecorderRepair.repaired.length} thread recorder paths`);
    } else {
      messageParts.push("thread recorder permissions already clean");
    }
    if (missingQuickChecks.length > 0) {
      messageParts.push(`${missingQuickChecks.length} DB files missing`);
    }
    if (!doctor.ok) {
      messageParts.push("codex doctor still reported notes");
    }

    const reloadAction = "Reload Window";
    const showLogAction = "Show Log";
    const choice = await vscode.window.showInformationMessage(
      `Codex state repair complete: ${messageParts.join(", ")}.`,
      reloadAction,
      showLogAction
    );
    if (choice === reloadAction) {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    } else if (choice === showLogAction) {
      outputChannel.show(true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDebugLog(context, outputChannel, "codex-state-repair-failed", {
      message
    });
    void vscode.window.showErrorMessage(`Codex state repair failed: ${message}`);
  }
}

async function clearCodexTaskHistoryCommand(context, outputChannel) {
  const dbPath = await findLatestCodexStateDbPath();
  const dbThreads = dbPath ? await listVsCodeTaskHistoryThreads(dbPath) : [];
  const sessionIndexEntries = await readCodexSessionIndexEntries();
  const workspaceProjectPath = getCurrentWorkspaceProjectPath();
  const workspaceFolderPaths = getWorkspaceFolderPaths();
  const threadIdsToClear = new Set([
    ...dbThreads.map((thread) => thread.id),
    ...sessionIndexEntries.map((entry) => entry.id).filter(Boolean)
  ]);

  if (threadIdsToClear.size <= 0) {
    await appendDebugLog(context, outputChannel, "task-history-clear-noop", {
      dbPath,
      dbThreadCount: dbThreads.length,
      sessionIndexCount: sessionIndexEntries.length
    });
    void vscode.window.showInformationMessage("Δεν υπάρχουν τοπικά Codex tasks για καθάρισμα.");
    return;
  }

  const beforeCount = threadIdsToClear.size;
  await appendDebugLog(context, outputChannel, "task-history-clear-start", {
    dbPath,
    beforeCount,
    dbThreadCount: dbThreads.length,
    sessionIndexCount: sessionIndexEntries.length,
    workspaceProjectPath: workspaceProjectPath || null,
    workspaceFolderPaths
  });

  // Codex rehydrates sidebar tasks from the session index and rollout files, not just the state DB.
  const removedSessionIndex = await removeCodexSessionIndexEntries(threadIdsToClear);
  const removedRolloutFiles = await deleteFiles(
    await collectCodexRolloutFiles(
      threadIdsToClear,
      dbThreads.map((thread) => thread.rolloutPath).filter(Boolean)
    )
  );
  const removedShellSnapshots = await deleteFiles(await collectCodexShellSnapshotFiles(threadIdsToClear));
  if (dbPath) {
    await clearVsCodeTaskHistoryThreads(dbPath, threadIdsToClear);
  }

  const remainingDbThreads = dbPath ? await listVsCodeTaskHistoryThreads(dbPath) : [];
  const remainingSessionIndexEntries = await readCodexSessionIndexEntries();
  const afterCount = new Set([
    ...remainingDbThreads.map((thread) => thread.id),
    ...remainingSessionIndexEntries.map((entry) => entry.id).filter(Boolean)
  ]).size;
  const clearedCount = Math.max(0, beforeCount - afterCount);

  await appendDebugLog(context, outputChannel, "task-history-cleared", {
    dbPath,
    beforeCount,
    afterCount,
    clearedCount,
    removedSessionIndexEntries: removedSessionIndex.removedCount,
    removedRolloutFiles: removedRolloutFiles.length,
    removedShellSnapshots: removedShellSnapshots.length,
    workspaceProjectPath: workspaceProjectPath || null,
    workspaceFolderPaths
  });

  const shouldReopenSidebarAfterReload = Boolean(workspaceProjectPath);
  await context.globalState.update(
    OPEN_SIDEBAR_AFTER_RESTART_KEY,
    shouldReopenSidebarAfterReload
  );

  if (!shouldReopenSidebarAfterReload) {
    await appendDebugLog(context, outputChannel, "task-history-cleared-missing-project", {
      workspaceFolderPaths
    });
    const visiblePath = workspaceFolderPaths[0] || "/";
    void vscode.window.showWarningMessage(
      `Καθαρίστηκαν ${clearedCount} Codex tasks. Γίνεται reload τώρα, αλλά το τωρινό window είναι ανοιχτό στο ${visiblePath} και το Codex χρειάζεται project folder για νέο task.`
    );
  } else {
    void vscode.window.showInformationMessage(
      `Καθαρίστηκαν ${clearedCount} Codex tasks. Γίνεται reload του window...`
    );
  }

  await appendDebugLog(context, outputChannel, "task-history-reload-window", {
    clearedCount,
    shouldReopenSidebarAfterReload,
    workspaceProjectPath: workspaceProjectPath || null,
    workspaceFolderPaths
  });
  await reloadWindowCommand(context, outputChannel);
}

function formatCodexLbErrorMessage(error) {
  if (!error) {
    return "unknown error";
  }
  if (error instanceof Error) {
    return error.message || "unknown error";
  }
  return String(error);
}

function fetchJsonResponse(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;
    const request = client.request(
      parsedUrl,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...headers
        }
      },
      (response) => {
        const chunks = [];
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          chunks.push(chunk);
          if (chunks.join("").length > 1024 * 1024) {
            request.destroy(new Error("Codex LB response is too large"));
          }
        });
        response.on("end", () => {
          const body = chunks.join("");
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode || "unknown"}`));
            return;
          }
          try {
            resolve({
              json: JSON.parse(body),
              upstream: String(response.headers["x-codex-lb-upstream"] || "").trim()
            });
          } catch (error) {
            reject(new Error(`Invalid JSON: ${formatCodexLbErrorMessage(error)}`));
          }
        });
      }
    );

    request.setTimeout(CODEX_LB_FETCH_TIMEOUT_MS, () => {
      request.destroy(new Error("Codex LB request timed out"));
    });
    request.on("error", reject);
    request.end();
  });
}

function resolveCodexLbApiKey(settings) {
  const envKey = String(process.env.CODEX_LB_API_KEY || "").trim();
  if (envKey) {
    return envKey;
  }

  for (const envPath of getCodexLbProviderEnvPaths(settings)) {
    try {
      const content = fsSync.readFileSync(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?CODEX_LB_API_KEY\s*=\s*(.+?)\s*$/);
        if (!match) {
          continue;
        }
        const parsed = stripShellEnvValue(match[1]);
        if (parsed) {
          return parsed;
        }
      }
    } catch {
      // Try the next known env path.
    }
  }

  return "";
}

function getCodexLbRouteState(settings) {
  try {
    const parsed = JSON.parse(fsSync.readFileSync(getCodexLbRouteStatePath(settings), "utf8"));
    return {
      routeMode: normalizeCodexLbRoutePathMode(parsed && parsed.route_mode),
      mode: normalizeCodexLbRouteMode(parsed && parsed.mode),
      primaryBaseUrl: normalizeCodexLbBaseUrl(parsed && parsed.primary_base_url, settings.codexLbPrimaryBaseUrl),
      fallbackBaseUrl: normalizeCodexLbBaseUrl(parsed && parsed.fallback_base_url, settings.codexLbFallbackBaseUrl),
      headroomBaseUrl: normalizeCodexLbBaseUrl(parsed && parsed.headroom_base_url, settings.codexLbHeadroomBaseUrl),
      headroomFailoverToDirect: parsed && parsed.headroom_failover_to_direct !== false
    };
  } catch {
    return {
      routeMode: "direct",
      mode: "primary",
      primaryBaseUrl: normalizeCodexLbBaseUrl("", settings.codexLbPrimaryBaseUrl),
      fallbackBaseUrl: normalizeCodexLbBaseUrl("", settings.codexLbFallbackBaseUrl),
      headroomBaseUrl: normalizeCodexLbBaseUrl("", settings.codexLbHeadroomBaseUrl),
      headroomFailoverToDirect: true
    };
  }
}

function getCodexLbRouteTargets(settings) {
  const routeState = getCodexLbRouteState(settings);
  if (routeState.mode === "fallback") {
    return [{ name: "fallback", baseUrl: routeState.fallbackBaseUrl }];
  }
  if (routeState.mode === "auto") {
    return [
      { name: "primary", baseUrl: routeState.primaryBaseUrl },
      { name: "fallback", baseUrl: routeState.fallbackBaseUrl }
    ];
  }
  return [{ name: "primary", baseUrl: routeState.primaryBaseUrl }];
}

function normalizeCodexLbRouteMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["primary", "fallback", "auto"].includes(mode) ? mode : "primary";
}

function normalizeCodexLbRoutePathMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["direct", "headroom"].includes(mode) ? mode : "direct";
}

function normalizeCodexLbBaseUrl(value, fallback) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  const fallbackText = String(fallback || "").trim().replace(/\/+$/, "");
  return text || fallbackText;
}

function sanitizeEmailForFilename(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._@-]/g, "_")
    .replace(/@/g, "_at_");
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${payload}${"=".repeat((4 - (payload.length % 4)) % 4)}`;
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getEmailFromAuthPayload(authPayload) {
  const idToken = authPayload?.tokens?.id_token;
  const claims = decodeJwtPayload(idToken);
  return normalizeAccountEmail(claims?.email);
}

function getAccessTokenExpiresAt(authPayload) {
  const accessToken = String(authPayload?.tokens?.access_token || "").trim();
  const claims = decodeJwtPayload(accessToken);
  const exp = Number(claims?.exp);
  if (!Number.isFinite(exp) || exp <= 0) {
    return null;
  }
  return new Date(exp * 1000).toISOString();
}

function buildTokenFingerprint(token) {
  const raw = String(token || "").trim();
  if (!raw) {
    return "";
  }
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

async function fetchGithubPrimaryEmail(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token || typeof fetch !== "function") {
    return null;
  }

  let response;
  try {
    response = await Promise.race([
      fetch("https://api.github.com/user/emails", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "codex-provider-statusbar"
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("GitHub email lookup timed out.")), 3000))
    ]);
  } catch {
    return null;
  }

  if (!response || !response.ok) {
    return null;
  }

  try {
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return null;
    }
    const primaryEntry = payload.find((entry) => entry && entry.primary && entry.verified && entry.email);
    const fallbackEntry = payload.find((entry) => entry && entry.verified && entry.email) || payload.find((entry) => entry && entry.email);
    return normalizeAccountEmail((primaryEntry || fallbackEntry || {}).email);
  } catch {
    return null;
  }
}

async function readVsCodeGithubAuthIdentity() {
  if (!vscode.authentication || typeof vscode.authentication.getSession !== "function") {
    return null;
  }

  for (const scopes of VSCODE_GITHUB_SESSION_SCOPE_CANDIDATES) {
    let session = null;
    try {
      session = await vscode.authentication.getSession(
        VSCODE_GITHUB_AUTH_PROVIDER_ID,
        scopes,
        { createIfNone: false, silent: true }
      );
    } catch {
      session = null;
    }

    if (!session) {
      continue;
    }

    const labelEmail = normalizeAccountEmail(session.account && session.account.label);
    const apiEmail = await fetchGithubPrimaryEmail(session.accessToken);
    const activeAccountEmail = apiEmail || labelEmail || null;
    return {
      activeAccountEmail,
      activeChatgptAccountId: null,
      activeAccessToken: null,
      activeAccessTokenHash: buildTokenFingerprint(session.accessToken || ""),
      activeAccessTokenExpiresAt: null,
      activeAuthUpdatedAt: null,
      activeAuthSource: "vscode-github-auth",
      activeGithubAccountId: String(session.account && session.account.id || "").trim() || null,
      activeGithubAccountLabel: String(session.account && session.account.label || "").trim() || null,
      activeGithubScopes: Array.isArray(session.scopes) ? session.scopes.slice() : scopes.slice()
    };
  }

  return null;
}

async function readCurrentAuthIdentity() {
  try {
    const authPayload = await readAuthPayloadFromFile(CODEX_AUTH_FILE);
    const activeAccountEmail = getEmailFromAuthPayload(authPayload);
    const activeChatgptAccountId = String(authPayload?.tokens?.account_id || "").trim() || null;
    const activeAccessToken = String(authPayload?.tokens?.access_token || "").trim() || null;
    const parsedRefreshAt = Date.parse(String(authPayload?.last_refresh || ""));
    return {
      activeAccountEmail: activeAccountEmail || null,
      activeChatgptAccountId,
      activeAccessToken,
      activeAccessTokenHash: buildTokenFingerprint(activeAccessToken || ""),
      activeAccessTokenExpiresAt: getAccessTokenExpiresAt(authPayload),
      activeAuthUpdatedAt: Number.isFinite(parsedRefreshAt) ? new Date(parsedRefreshAt).toISOString() : null,
      activeAuthSource: "codex-auth-json",
      activeGithubAccountId: null,
      activeGithubAccountLabel: null,
      activeGithubScopes: []
    };
  } catch {
    const githubIdentity = await readVsCodeGithubAuthIdentity();
    if (githubIdentity) {
      return githubIdentity;
    }
    return {
      activeAccountEmail: null,
      activeChatgptAccountId: null,
      activeAccessToken: null,
      activeAccessTokenHash: "",
      activeAccessTokenExpiresAt: null,
      activeAuthUpdatedAt: null,
      activeAuthSource: null,
      activeGithubAccountId: null,
      activeGithubAccountLabel: null,
      activeGithubScopes: []
    };
  }
}

async function readAuthPayloadFromFile(filePath) {
  const authText = await fs.readFile(filePath, "utf8");
  const authData = JSON.parse(authText);
  if (!authData || typeof authData !== "object" || Array.isArray(authData)) {
    throw new Error(`Invalid auth payload in ${filePath}`);
  }
  return authData;
}

async function resolveAuthEmailFromFile(filePath) {
  try {
    const authPayload = await readAuthPayloadFromFile(filePath);
    return getEmailFromAuthPayload(authPayload);
  } catch {
    return null;
  }
}

async function ensurePrivateDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  try {
    await fs.chmod(dirPath, 0o700);
  } catch {
    // Some environments may not support chmod the same way; continue safely.
  }
}

async function copyFileWithPrivateMode(sourcePath, destinationPath) {
  await fs.copyFile(sourcePath, destinationPath);
  try {
    await fs.chmod(destinationPath, 0o600);
  } catch {
    // Best effort; continue when chmod is not supported.
  }
}

async function saveCurrentAuthSnapshot(context, outputChannel, settings, knownEmail = null) {
  const currentEmail = knownEmail || (await getCurrentCodexAccountEmail(context, outputChannel));
  if (!currentEmail) {
    return {
      saved: false,
      currentEmail: null,
      reason: "Current account is unknown."
    };
  }

  const authFileExists = await statIfExists(CODEX_AUTH_FILE);
  if (!authFileExists) {
    return {
      saved: false,
      currentEmail,
      reason: "Current auth source is not ~/.codex/auth.json."
    };
  }

  const snapshotsDir = getRotationAuthSnapshotsDir(settings);
  const snapshotPath = path.join(snapshotsDir, `${sanitizeEmailForFilename(currentEmail)}${ROTATION_AUTH_SNAPSHOT_FILE_SUFFIX}`);
  const tmpPath = `${snapshotPath}.tmp.${Date.now()}`;

  try {
    await ensurePrivateDirectory(path.dirname(CODEX_AUTH_FILE));
    await ensurePrivateDirectory(snapshotsDir);
    await copyFileWithPrivateMode(CODEX_AUTH_FILE, tmpPath);
    await fs.rename(tmpPath, snapshotPath);

    await appendDebugLog(context, outputChannel, "rotation-auth-snapshot-saved", {
      currentEmail,
      snapshotsDir
    });
    return {
      saved: true,
      currentEmail,
      snapshotPath
    };
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup failures.
    }
    await appendDebugLog(context, outputChannel, "rotation-auth-snapshot-save-failed", {
      currentEmail,
      snapshotsDir,
      message: error instanceof Error ? error.message : String(error)
    });
    return {
      saved: false,
      currentEmail,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function listSnapshotCandidates(directoryPath) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(directoryPath, entry.name))
      .filter((filePath) => {
        const baseName = path.basename(filePath);
        return (
          baseName === "auth.json" ||
          baseName.startsWith("auth.json.") ||
          baseName.endsWith(ROTATION_AUTH_SNAPSHOT_FILE_SUFFIX)
        );
      });
  } catch {
    return [];
  }
}

async function findAuthSnapshotForTargetEmail(context, outputChannel, settings, targetEmail) {
  const normalizedTargetEmail = normalizeAccountEmail(targetEmail);
  if (!normalizedTargetEmail) {
    return {
      found: false,
      snapshotPath: null,
      reason: "Target email is empty."
    };
  }

  const snapshotsDir = getRotationAuthSnapshotsDir(settings);
  const primaryCandidate = path.join(
    snapshotsDir,
    `${sanitizeEmailForFilename(normalizedTargetEmail)}${ROTATION_AUTH_SNAPSHOT_FILE_SUFFIX}`
  );
  const discovered = [primaryCandidate];
  const candidateDirectories = [snapshotsDir, LEGACY_ROTATION_AUTH_SNAPSHOTS_DIR, LEGACY_ROTATION_AUTH_ROOT_DIR];

  for (const directoryPath of candidateDirectories) {
    const directoryCandidates = await listSnapshotCandidates(directoryPath);
    directoryCandidates.forEach((filePath) => discovered.push(filePath));
  }

  const uniqueCandidates = Array.from(new Set(discovered));
  for (const filePath of uniqueCandidates) {
    const email = await resolveAuthEmailFromFile(filePath);
    if (email && email === normalizedTargetEmail) {
      await appendDebugLog(context, outputChannel, "rotation-auth-snapshot-found", {
        targetEmail: normalizedTargetEmail,
        filePath
      });
      return {
        found: true,
        snapshotPath: filePath,
        reason: null
      };
    }
  }

  await appendDebugLog(context, outputChannel, "rotation-auth-snapshot-missing", {
    targetEmail: normalizedTargetEmail,
    searchedDirs: candidateDirectories
  });
  return {
    found: false,
    snapshotPath: null,
    reason: `No saved auth snapshot found for ${normalizedTargetEmail}.`
  };
}

async function collectSavedAuthSnapshots(context, outputChannel, settings) {
  const candidateDirectories = [
    getRotationAuthSnapshotsDir(settings),
    LEGACY_ROTATION_AUTH_SNAPSHOTS_DIR,
    LEGACY_ROTATION_AUTH_ROOT_DIR
  ];
  const seenByEmail = new Map();

  for (const directoryPath of candidateDirectories) {
    const directoryCandidates = await listSnapshotCandidates(directoryPath);
    for (const filePath of directoryCandidates) {
      const email = await resolveAuthEmailFromFile(filePath);
      if (!email || seenByEmail.has(email)) {
        continue;
      }
      seenByEmail.set(email, {
        email,
        snapshotPath: filePath,
        sourceDir: directoryPath
      });
    }
  }

  const snapshots = Array.from(seenByEmail.values()).sort((left, right) => left.email.localeCompare(right.email, "el"));
  await appendDebugLog(context, outputChannel, "rotation-auth-snapshots-listed", {
    count: snapshots.length,
    emails: snapshots.map((entry) => entry.email)
  });
  return snapshots;
}

async function applyAuthSnapshotForTarget(context, outputChannel, snapshotPath, targetEmail) {
  const normalizedTargetEmail = normalizeAccountEmail(targetEmail);
  if (!normalizedTargetEmail) {
    throw new Error("Target email is empty.");
  }

  const snapshotEmail = await resolveAuthEmailFromFile(snapshotPath);
  if (!snapshotEmail || snapshotEmail !== normalizedTargetEmail) {
    throw new Error(`Snapshot does not match target account ${normalizedTargetEmail}.`);
  }

  const tmpPath = `${CODEX_AUTH_FILE}.tmp.${Date.now()}`;
  await ensurePrivateDirectory(path.dirname(CODEX_AUTH_FILE));
  await copyFileWithPrivateMode(snapshotPath, tmpPath);
  await fs.rename(tmpPath, CODEX_AUTH_FILE);

  await appendDebugLog(context, outputChannel, "rotation-auth-snapshot-applied", {
    targetEmail: normalizedTargetEmail,
    snapshotPath
  });
}

async function getCurrentCodexAccountEmail(context, outputChannel) {
  const identity = await readCurrentAuthIdentity();
  const source = identity.activeAuthSource === "vscode-github-auth"
    ? "vscode.authentication/github"
    : CODEX_AUTH_FILE;
  await appendDebugLog(context, outputChannel, "rotation-current-account-detected", {
    source,
    authSource: identity.activeAuthSource || null,
    hasCurrentEmail: Boolean(identity.activeAccountEmail),
    currentEmail: identity.activeAccountEmail || null,
    githubAccountLabel: identity.activeGithubAccountLabel || null
  });
  return identity.activeAccountEmail || null;
}

async function readRemoteFileOverSsh(vmAlias, remotePath) {
  const sshArgs = [
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${Math.max(1, Math.floor(DEFAULT_SSH_TIMEOUT_MS / 1000))}`,
    vmAlias,
    `cat ${remotePath}`
  ];
  const { stdout } = await execFileJsonSafe("ssh", sshArgs, DEFAULT_SSH_TIMEOUT_MS);
  return stdout;
}

function parseJsonObject(input, label) {
  let parsed;
  try {
    parsed = JSON.parse(String(input || ""));
  } catch (error) {
    throw new Error(`Invalid JSON from ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected object JSON from ${label}`);
  }
  return parsed;
}

function getRotationScore(entry) {
  const fiveHourRemaining = Math.max(0, toFiniteNumber(entry?.metrics?.fiveHourRemainingPercent, 0));
  const weeklyRemaining = Math.max(0, toFiniteNumber(entry?.metrics?.weeklyRemainingPercent, 0));
  return (fiveHourRemaining > 0 ? 1000 : 0) + weeklyRemaining;
}

function rankRotationAccounts(accounts) {
  return [...accounts].sort((left, right) => {
    const leftFive = Math.max(0, toFiniteNumber(left?.metrics?.fiveHourRemainingPercent, 0));
    const rightFive = Math.max(0, toFiniteNumber(right?.metrics?.fiveHourRemainingPercent, 0));
    const leftWeekly = Math.max(0, toFiniteNumber(left?.metrics?.weeklyRemainingPercent, 0));
    const rightWeekly = Math.max(0, toFiniteNumber(right?.metrics?.weeklyRemainingPercent, 0));

    const leftHasFive = leftFive > 0 ? 1 : 0;
    const rightHasFive = rightFive > 0 ? 1 : 0;
    if (leftHasFive !== rightHasFive) {
      return rightHasFive - leftHasFive;
    }

    if (leftWeekly !== rightWeekly) {
      return rightWeekly - leftWeekly;
    }

    const leftScore = getRotationScore(left);
    const rightScore = getRotationScore(right);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    if (leftFive !== rightFive) {
      return rightFive - leftFive;
    }

    const leftLabel = String(left?.label || left?.id || "").trim();
    const rightLabel = String(right?.label || right?.id || "").trim();
    return leftLabel.localeCompare(rightLabel, "el");
  });
}

async function loadRotationRanking(context, outputChannel, settings) {
  const vmAlias = String(settings.rotationVmAlias || DEFAULT_ROTATION_USAGE_HOST_ALIAS).trim() || DEFAULT_ROTATION_USAGE_HOST_ALIAS;
  const accountsPath = String(settings.rotationAccountsPath || DEFAULT_ROTATION_USAGE_ACCOUNTS_PATH).trim() || DEFAULT_ROTATION_USAGE_ACCOUNTS_PATH;
  const usageCachePath = String(settings.rotationUsageCachePath || DEFAULT_ROTATION_USAGE_CACHE_PATH).trim() || DEFAULT_ROTATION_USAGE_CACHE_PATH;
  const [accountsRaw, usageCacheRaw] = await Promise.all([
    readRemoteFileOverSsh(vmAlias, accountsPath),
    readRemoteFileOverSsh(vmAlias, usageCachePath)
  ]);

  const accountsPayload = parseJsonObject(accountsRaw, accountsPath);
  const usageCache = parseJsonObject(usageCacheRaw, usageCachePath);
  const baseAccounts = Array.isArray(accountsPayload.accounts) ? accountsPayload.accounts : [];

  const enabledAccounts = baseAccounts
    .filter((entry) => entry && typeof entry === "object" && entry.enabled === true)
    .map((entry) => {
      const id = String(entry.id || "").trim();
      const label = String(entry.label || id).trim();
      const cached = usageCache[id];
      const metrics = cached && typeof cached === "object" && cached.metrics && typeof cached.metrics === "object" ? cached.metrics : {};
      return {
        id,
        label,
        metrics
      };
    })
    .filter((entry) => entry.id);

  const ranked = rankRotationAccounts(enabledAccounts);
  await appendDebugLog(context, outputChannel, "rotation-ranking-loaded", {
    vmAlias,
    accountsPath,
    usageCachePath,
    enabledAccounts: enabledAccounts.length,
    rankedAccounts: ranked.length,
    topTargetEmail: ranked[0]?.label || null
  });
  return ranked;
}

async function getCurrentAccountRemainingMetrics(context, outputChannel, settings) {
  if (!settings.rotationEnabled) {
    return {
      available: false,
      reason: "rotation-disabled"
    };
  }

  const currentEmail = await getCurrentCodexAccountEmail(context, outputChannel);
  if (!currentEmail) {
    return {
      available: false,
      reason: "current-account-unknown"
    };
  }

  let rankedAccounts;
  try {
    rankedAccounts = await loadRotationRanking(context, outputChannel, settings);
  } catch (error) {
    return {
      available: false,
      accountEmail: currentEmail,
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  const currentEntry = rankedAccounts.find((entry) => normalizeAccountEmail(entry.label) === currentEmail) || null;
  if (!currentEntry) {
    return {
      available: false,
      accountEmail: currentEmail,
      reason: "current-account-not-in-ranking"
    };
  }

  const fiveHourRemainingPercent = clampPercent(currentEntry?.metrics?.fiveHourRemainingPercent);
  const weeklyRemainingPercent = clampPercent(currentEntry?.metrics?.weeklyRemainingPercent);
  return {
    available: true,
    accountEmail: currentEmail,
    accountId: currentEntry.id,
    fiveHourRemainingPercent,
    weeklyRemainingPercent,
    fiveHourRemainingLabel: formatPercent(fiveHourRemainingPercent),
    weeklyRemainingLabel: formatPercent(weeklyRemainingPercent)
  };
}

async function resolveRotationPreview(context, outputChannel, settings) {
  const currentEmail = await getCurrentCodexAccountEmail(context, outputChannel);
  let rankedAccounts;
  try {
    rankedAccounts = await loadRotationRanking(context, outputChannel, settings);
  } catch (error) {
    return {
      currentEmail,
      targetEmail: null,
      targetId: null,
      score: null,
      reason: `Could not load ranking: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  if (!rankedAccounts.length) {
    return {
      currentEmail,
      targetEmail: null,
      targetId: null,
      score: null,
      reason: "No enabled accounts in codex-usage ranking."
    };
  }

  let target = null;
  if (currentEmail) {
    target = rankedAccounts.find((entry) => normalizeAccountEmail(entry.label) !== currentEmail) || null;
    if (!target) {
      return {
        currentEmail,
        targetEmail: null,
        targetId: null,
        score: null,
        reason: "No better/other account found."
      };
    }
  } else {
    target = rankedAccounts[0];
  }

  return {
    currentEmail,
    targetEmail: normalizeAccountEmail(target.label),
    targetId: target.id,
    score: getRotationScore(target),
    reason: null
  };
}

function resolveCodexCliBinaryPath() {
  const extension = vscode.extensions.getExtension("openai.chatgpt");
  if (!extension || !extension.extensionPath) {
    throw new Error("Official OpenAI Codex extension (openai.chatgpt) was not found.");
  }

  const extensionPath = extension.extensionPath;
  const preferredDirs = [];
  if (process.platform === "linux") {
    preferredDirs.push(process.arch === "arm64" ? "linux-aarch64" : "linux-x86_64");
  } else if (process.platform === "darwin") {
    preferredDirs.push(process.arch === "arm64" ? "darwin-aarch64" : "darwin-x86_64");
  } else if (process.platform === "win32") {
    preferredDirs.push(process.arch === "arm64" ? "win32-aarch64" : "win32-x86_64");
  }

  const candidates = preferredDirs.flatMap((dir) =>
    process.platform === "win32"
      ? [path.join(extensionPath, "bin", dir, "codex.exe"), path.join(extensionPath, "bin", dir, "codex")]
      : [path.join(extensionPath, "bin", dir, "codex")]
  );

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  const binRoot = path.join(extensionPath, "bin");
  try {
    const dynamicDirs = fsSync.readdirSync(binRoot, { withFileTypes: true });
    for (const dirEntry of dynamicDirs) {
      if (!dirEntry.isDirectory()) {
        continue;
      }
      const maybeCodex = path.join(binRoot, dirEntry.name, process.platform === "win32" ? "codex.exe" : "codex");
      if (fsSync.existsSync(maybeCodex)) {
        return maybeCodex;
      }
      const maybeCodexNoExt = path.join(binRoot, dirEntry.name, "codex");
      if (fsSync.existsSync(maybeCodexNoExt)) {
        return maybeCodexNoExt;
      }
    }
  } catch {
    // Keep the original error message below.
  }

  throw new Error("Could not resolve bundled Codex CLI binary path from openai.chatgpt extension.");
}

async function executeCodexLogout(codexBinaryPath) {
  await execFileJsonSafe(codexBinaryPath, ["logout"], DEFAULT_CODEX_LOGOUT_TIMEOUT_MS);
}

async function terminateOpenAiAppServersForCliPath(context, outputChannel, codexBinaryPath) {
  if (process.platform === "win32") {
    return;
  }

  let stdout = "";
  try {
    const result = await execFileJsonSafe("ps", ["-eo", "pid=,args="], APP_SERVER_TERMINATION_TIMEOUT_MS);
    stdout = result.stdout || "";
  } catch (error) {
    await appendDebugLog(context, outputChannel, "rotation-app-server-terminate-ps-failed", {
      codexBinaryPath,
      message: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  const stalePids = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(codexBinaryPath) || !trimmed.includes(" app-server ")) {
      continue;
    }

    const match = trimmed.match(/^(\d+)\s+/);
    const pid = match ? Number(match[1]) : NaN;
    if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) {
      stalePids.push(pid);
    }
  }

  for (const pid of stalePids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The process may already be gone by the time we try to terminate it.
    }
  }

  if (stalePids.length > 0) {
    await appendDebugLog(context, outputChannel, "rotation-app-server-terminated", {
      codexBinaryPath,
      pids: stalePids
    });
  }
}

async function captureCurrentAuthSnapshot(context, outputChannel) {
  const settings = getSettings();
  const result = await saveCurrentAuthSnapshot(context, outputChannel, settings);
  if (!result.saved) {
    void vscode.window.showWarningMessage(
      `Could not save current auth snapshot: ${result.reason || "unknown reason"}`
    );
    return;
  }

  void vscode.window.showInformationMessage(`Saved auth snapshot for ${result.currentEmail}.`);
}

async function loginWithSavedAccount(context, outputChannel) {
  const settings = getSettings();
  if (!settings.rotationEnabled) {
    void vscode.window.showInformationMessage("Account rotation is disabled in settings.");
    return;
  }

  const snapshots = await collectSavedAuthSnapshots(context, outputChannel, settings);
  if (!snapshots.length) {
    void vscode.window.showWarningMessage(
      "No saved auth snapshots found. Login once and use \"Save current auth snapshot\" first."
    );
    return;
  }

  const currentEmail = await getCurrentCodexAccountEmail(context, outputChannel);
  const pick = await vscode.window.showQuickPick(
    snapshots.map((entry) => ({
      label: entry.email,
      description: entry.email === currentEmail ? "current account" : "saved snapshot",
      detail: entry.snapshotPath,
      snapshot: entry
    })),
    {
      placeHolder: "Select saved account for login"
    }
  );

  if (!pick || !pick.snapshot) {
    return;
  }

  const target = pick.snapshot;
  if (currentEmail && target.email === currentEmail) {
    void vscode.window.showInformationMessage(`Already logged in as ${target.email}.`);
    return;
  }

  try {
    if (currentEmail) {
      await saveCurrentAuthSnapshot(context, outputChannel, settings, currentEmail);
    }

    const codexBinaryPath = resolveCodexCliBinaryPath();
    await terminateOpenAiAppServersForCliPath(context, outputChannel, codexBinaryPath);
    try {
      await executeCodexLogout(codexBinaryPath);
    } catch (logoutError) {
      const logoutMessage = logoutError instanceof Error ? logoutError.message : String(logoutError);
      const benignLogoutError = /not logged|no stored authentication credentials|already logged out/i.test(logoutMessage);
      await appendDebugLog(context, outputChannel, "rotation-manual-login-logout-result", {
        targetEmail: target.email,
        benignLogoutError,
        message: logoutMessage
      });
      if (!benignLogoutError) {
        throw logoutError;
      }
    }

    await applyAuthSnapshotForTarget(context, outputChannel, target.snapshotPath, target.email);
    await terminateOpenAiAppServersForCliPath(context, outputChannel, codexBinaryPath);
    await context.globalState.update(ROTATION_LAST_TARGET_KEY, target.email);
    await context.globalState.update(ROTATION_LAST_CURRENT_KEY, currentEmail || null);
    await context.globalState.update(ROTATION_LAST_LOGOUT_AT_KEY, new Date().toISOString());
    await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, settings.autoOpenCodexSidebar);

    await appendDebugLog(context, outputChannel, "rotation-manual-login-snapshot-success", {
      targetEmail: target.email,
      previousEmail: currentEmail,
      snapshotPath: target.snapshotPath
    });

    void vscode.window.showInformationMessage(`Switching login to ${target.email} from saved snapshots.`);
    await switchToExplorerBeforeWindowLifecycle(context, outputChannel, "manual-login-restart-extension-host");
    await vscode.commands.executeCommand("workbench.action.restartExtensionHost");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDebugLog(context, outputChannel, "rotation-manual-login-snapshot-failed", {
      targetEmail: target.email,
      previousEmail: currentEmail,
      message
    });
    void vscode.window.showErrorMessage(`Could not switch to saved account: ${message}`);
  }
}

async function showCurrentAndNextAccount(context, outputChannel) {
  const settings = getSettings();
  if (!settings.rotationEnabled) {
    void vscode.window.showInformationMessage("Account rotation is disabled in settings.");
    return;
  }

  const preview = await resolveRotationPreview(context, outputChannel, settings);
  if (preview.reason) {
    await appendDebugLog(context, outputChannel, "rotation-no-target", preview);
    void vscode.window.showInformationMessage(
      `Current: ${preview.currentEmail || "unknown"} | Next: - | ${preview.reason}`
    );
    return;
  }

  void vscode.window.showInformationMessage(
    `Current: ${preview.currentEmail || "unknown"} | Next: ${preview.targetEmail || "-"} (${preview.targetId || "-"})`
  );
}

async function showCurrentRemainingMetrics(context, outputChannel) {
  const settings = getSettings();
  try {
    const metrics = await withTimeout(
      getCurrentAccountRemainingMetrics(context, outputChannel, settings),
      STATUSBAR_ROTATION_METRICS_TIMEOUT_MS
    );

    if (!metrics || !metrics.available) {
      const reason = metrics && metrics.reason ? metrics.reason : "unknown";
      void vscode.window.showWarningMessage(`Could not load remaining metrics: ${reason}`);
      await appendDebugLog(context, outputChannel, "rotation-current-metrics-unavailable", {
        reason,
        accountEmail: metrics && metrics.accountEmail ? metrics.accountEmail : null
      });
      return;
    }

    void vscode.window.showInformationMessage(
      `Active: ${metrics.accountEmail} | 5h Remaining: ${metrics.fiveHourRemainingLabel} | Weekly Remaining: ${metrics.weeklyRemainingLabel}`
    );
    await appendDebugLog(context, outputChannel, "rotation-current-metrics-shown", {
      accountEmail: metrics.accountEmail,
      accountId: metrics.accountId,
      fiveHourRemaining: metrics.fiveHourRemainingLabel,
      weeklyRemaining: metrics.weeklyRemainingLabel
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Could not load remaining metrics: ${message}`);
    await appendDebugLog(context, outputChannel, "rotation-current-metrics-error", {
      message
    });
  }
}

async function logoutToBestAccount(context, outputChannel) {
  const settings = getSettings();
  if (!settings.rotationEnabled) {
    void vscode.window.showInformationMessage("Account rotation is disabled in settings.");
    return;
  }

  const preview = await resolveRotationPreview(context, outputChannel, settings);
  if (preview.reason || !preview.targetId || !preview.targetEmail) {
    await appendDebugLog(context, outputChannel, "rotation-no-target", preview);
    void vscode.window.showInformationMessage(
      preview.reason || "No target account was selected from ranking."
    );
    return;
  }

  await appendDebugLog(context, outputChannel, "rotation-logout-start", preview);

  try {
    let targetSnapshot = null;
    if (settings.rotationAutoLoginFromSnapshot) {
      const targetSnapshotResult = await findAuthSnapshotForTargetEmail(
        context,
        outputChannel,
        settings,
        preview.targetEmail
      );

      if (!targetSnapshotResult.found || !targetSnapshotResult.snapshotPath) {
        await appendDebugLog(context, outputChannel, "rotation-auth-snapshot-required-missing", {
          targetEmail: preview.targetEmail,
          reason: targetSnapshotResult.reason
        });
        void vscode.window.showWarningMessage(
          `No saved login snapshot for ${preview.targetEmail}. Login once to that account and run "Save current auth snapshot".`
        );
        return;
      }

      targetSnapshot = targetSnapshotResult.snapshotPath;
    }

    if (preview.currentEmail) {
      await saveCurrentAuthSnapshot(context, outputChannel, settings, preview.currentEmail);
    }

    const codexBinaryPath = resolveCodexCliBinaryPath();
    await terminateOpenAiAppServersForCliPath(context, outputChannel, codexBinaryPath);
    await executeCodexLogout(codexBinaryPath);

    if (settings.rotationAutoLoginFromSnapshot && targetSnapshot) {
      await applyAuthSnapshotForTarget(context, outputChannel, targetSnapshot, preview.targetEmail);
      await terminateOpenAiAppServersForCliPath(context, outputChannel, codexBinaryPath);
      await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, settings.autoOpenCodexSidebar);
    } else {
      await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, false);
    }

    await context.globalState.update(ROTATION_LAST_TARGET_KEY, preview.targetEmail);
    await context.globalState.update(ROTATION_LAST_CURRENT_KEY, preview.currentEmail || null);
    await context.globalState.update(ROTATION_LAST_LOGOUT_AT_KEY, new Date().toISOString());

    await appendDebugLog(context, outputChannel, "rotation-logout-success", {
      ...preview,
      codexBinaryPath,
      autoLoginFromSnapshot: Boolean(settings.rotationAutoLoginFromSnapshot),
      targetSnapshotApplied: Boolean(targetSnapshot)
    });

    if (settings.rotationAutoLoginFromSnapshot && targetSnapshot) {
      void vscode.window.showInformationMessage(
        `Switched to ${preview.targetEmail} using saved ChatGPT login snapshot. Restarting extension host.`
      );
      await switchToExplorerBeforeWindowLifecycle(context, outputChannel, "rotation-restart-extension-host");
      await vscode.commands.executeCommand("workbench.action.restartExtensionHost");
      return;
    }

    void vscode.window.showInformationMessage(`Logged out from Codex. Suggested next account: ${preview.targetEmail}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDebugLog(context, outputChannel, "rotation-logout-failed", {
      ...preview,
      message
    });
    void vscode.window.showErrorMessage(`Could not complete Codex logout: ${message}`);
  }
}

async function reloadWindowCommand(context, outputChannel) {
  await appendDebugLog(context, outputChannel, "reload-window-command-start");
  try {
    await switchToExplorerBeforeWindowLifecycle(context, outputChannel, "reload-window");
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDebugLog(context, outputChannel, "reload-window-command-fallback", {
      message
    });
    await switchToExplorerBeforeWindowLifecycle(context, outputChannel, "reload-window-fallback-restart-extension-host");
    await vscode.commands.executeCommand("workbench.action.restartExtensionHost");
    void vscode.window.showWarningMessage(
      `Window reload failed (${message}). Restarted extension host instead.`
    );
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getAvailableCommands() {
  try {
    return await vscode.commands.getCommands(true);
  } catch {
    return [];
  }
}

async function executeBestCommand(context, outputChannel, commandCandidates, argumentVariants = [[]], eventName = "execute-best-command") {
  const available = new Set(await getAvailableCommands());
  const candidates = uniqKeepOrder(commandCandidates);

  for (const commandId of candidates) {
    if (!available.has(commandId)) {
      continue;
    }

    for (const args of argumentVariants) {
      try {
        await vscode.commands.executeCommand(commandId, ...(Array.isArray(args) ? args : [args]));
        await appendDebugLog(context, outputChannel, `${eventName}-success`, {
          commandId,
          args
        });
        return {
          commandId,
          args
        };
      } catch (error) {
        await appendDebugLog(context, outputChannel, `${eventName}-failed`, {
          commandId,
          args,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  await appendDebugLog(context, outputChannel, `${eventName}-no-match`, {
    candidates
  });
  return null;
}

async function openCodexSidebarBestEffort(context, outputChannel) {
  const opened = await executeBestCommand(
    context,
    outputChannel,
    [
      "chatgpt.openSidebar",
      "workbench.view.extension.codexSecondaryViewContainer",
      "workbench.view.extension.codexViewContainer"
    ],
    [[]],
    "open-codex-sidebar"
  );

  if (!opened) {
    return false;
  }

  await delay(COMMAND_CHAIN_STEP_DELAY_MS);
  await executeBestCommand(
    context,
    outputChannel,
    [
      "workbench.action.chat.focusInput",
      "chat.action.focusInput",
      "chat.action.focus"
    ],
    [[]],
    "focus-codex-sidebar-input"
  );
  return true;
}

async function focusCodexComposer(context, outputChannel) {
  const opened = await openCodexSidebarBestEffort(context, outputChannel);
  if (!opened) {
    return null;
  }

  return executeBestCommand(
    context,
    outputChannel,
    [
      "workbench.action.webview.focus",
      "workbench.action.focusAuxiliaryBar",
      "workbench.action.focusSideBar",
      "workbench.action.chat.focusInput",
      "chat.action.focusInput",
      "chat.action.focus"
    ],
    [[]],
    "focus-codex-composer"
  );
}

async function clearComposerInputBestEffort(context, outputChannel) {
  await executeBestCommand(
    context,
    outputChannel,
    [
      "editor.action.selectAll",
      "selectAll"
    ],
    [[]],
    "composer-select-all"
  );
  await delay(COMMAND_CHAIN_STEP_DELAY_MS);

  await executeBestCommand(
    context,
    outputChannel,
    [
      "deleteLeft",
      "deleteRight"
    ],
    [[]],
    "composer-clear-selected"
  );
  await delay(COMMAND_CHAIN_STEP_DELAY_MS);
}

async function submitComposerInput(context, outputChannel) {
  const submitResult = await executeBestCommand(
    context,
    outputChannel,
    [
      "chat.action.acceptInput",
      "workbench.action.chat.acceptInput",
      "chat.action.submit",
      "workbench.action.chat.submit",
      "chat.action.send",
      "workbench.action.chat.send"
    ],
    [[]],
    "composer-submit"
  );

  if (submitResult) {
    return true;
  }

  try {
    await vscode.commands.executeCommand("type", { text: "\n" });
    await appendDebugLog(context, outputChannel, "composer-submit-fallback-newline");
    return true;
  } catch (error) {
    await appendDebugLog(context, outputChannel, "composer-submit-fallback-failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function sendPromptAndEnter(context, outputChannel, promptText) {
  const message = String(promptText || "").trim();
  if (!message) {
    return false;
  }

  await appendDebugLog(context, outputChannel, "send-prompt-chain-start", {
    message
  });

  await focusCodexComposer(context, outputChannel);
  await delay(COMMAND_CHAIN_STEP_DELAY_MS);
  await clearComposerInputBestEffort(context, outputChannel);

  try {
    await vscode.commands.executeCommand("type", { text: message });
  } catch (error) {
    await appendDebugLog(context, outputChannel, "composer-type-failed", {
      message: error instanceof Error ? error.message : String(error),
      text: message
    });
    return false;
  }

  await delay(COMMAND_CHAIN_STEP_DELAY_MS);
  const submitted = await submitComposerInput(context, outputChannel);
  await appendDebugLog(context, outputChannel, "send-prompt-chain-finished", {
    message,
    submitted
  });

  return submitted;
}

async function insertPromptDraft(context, outputChannel, promptText) {
  const message = String(promptText || "").trim();
  if (!message) {
    return false;
  }

  await appendDebugLog(context, outputChannel, "insert-prompt-draft-start", {
    messageLength: message.length
  });

  await focusCodexComposer(context, outputChannel);
  await delay(COMMAND_CHAIN_STEP_DELAY_MS);
  await clearComposerInputBestEffort(context, outputChannel);

  try {
    await vscode.commands.executeCommand("type", { text: message });
    await appendDebugLog(context, outputChannel, "insert-prompt-draft-finished", {
      messageLength: message.length
    });
    return true;
  } catch (error) {
    await appendDebugLog(context, outputChannel, "insert-prompt-draft-failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

function getWebviewNonce() {
  return crypto.randomBytes(16).toString("base64");
}

function getVoiceDraftHtml(webview) {
  const nonce = getWebviewNonce();
  const cspSource = webview.cspSource;
  return `<!doctype html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Greek Voice Draft</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #171717;
      --panel: #242424;
      --text: #f0eee9;
      --muted: #aaa39a;
      --accent: #e5b85f;
      --danger: #e06a5f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at top left, #33302a 0, var(--bg) 44%);
      color: var(--text);
      font: 14px/1.45 ui-sans-serif, system-ui, sans-serif;
    }
    main {
      width: min(680px, calc(100vw - 32px));
      padding: 24px;
      border: 1px solid #3d3932;
      border-radius: 20px;
      background: linear-gradient(145deg, #292722, var(--panel));
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.36);
    }
    h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.02em; }
    p { margin: 0 0 18px; color: var(--muted); }
    textarea {
      width: 100%;
      min-height: 160px;
      resize: vertical;
      color: var(--text);
      background: #151515;
      border: 1px solid #454036;
      border-radius: 14px;
      padding: 14px;
      outline: none;
    }
    .row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    button {
      border: 0;
      border-radius: 999px;
      padding: 10px 15px;
      color: #201b12;
      background: var(--accent);
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary { color: var(--text); background: #3a3834; }
    button.danger { color: #24120f; background: var(--danger); }
    #status { min-height: 20px; margin-top: 14px; color: var(--muted); }
  </style>
</head>
<body>
  <main>
    <h1>Greek voice draft</h1>
    <p>Μίλα ελληνικά. Όταν σταματήσεις το μικρόφωνο, το κείμενο θα μπει στο Codex composer χωρίς να σταλεί.</p>
    <textarea id="transcript" placeholder="Η εντολή θα εμφανιστεί εδώ πρώτα..."></textarea>
    <div class="row">
      <button id="start">Start mic</button>
      <button id="stop" class="danger">Stop mic</button>
      <button id="insert" class="secondary">Insert draft</button>
    </div>
    <div id="status">Ready.</div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const statusEl = document.getElementById("status");
    const transcriptEl = document.getElementById("transcript");
    let recognition = null;
    let finalText = "";

    function setStatus(text) {
      statusEl.textContent = text;
    }

    function insertDraft() {
      const text = transcriptEl.value.trim();
      if (!text) {
        setStatus("Δεν υπάρχει κείμενο ακόμα.");
        return;
      }
      vscode.postMessage({ type: "voiceDraft", text });
      setStatus("Το κείμενο μπαίνει στο Codex composer...");
    }

    function startMic() {
      if (!SpeechRecognition) {
        setStatus("Το Web Speech API δεν υποστηρίζεται σε αυτό το VS Code WebView. Χρησιμοποίησε το Bridge Voice Greek hotkey.");
        return;
      }
      finalText = "";
      recognition = new SpeechRecognition();
      recognition.lang = "el-GR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => setStatus("Recording...");
      recognition.onerror = (event) => setStatus("Mic error: " + (event.error || "unknown"));
      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const value = event.results[index][0].transcript;
          if (event.results[index].isFinal) {
            finalText += value + " ";
          } else {
            interim += value;
          }
        }
        transcriptEl.value = (finalText + interim).trim();
      };
      recognition.onend = () => {
        setStatus("Mic stopped.");
        insertDraft();
      };
      recognition.start();
    }

    document.getElementById("start").addEventListener("click", startMic);
    document.getElementById("stop").addEventListener("click", () => {
      if (recognition) {
        recognition.stop();
      }
    });
    document.getElementById("insert").addEventListener("click", insertDraft);
    window.setTimeout(startMic, 250);
  </script>
</body>
</html>`;
}

function getScreenCaptureHtml(webview) {
  const nonce = getWebviewNonce();
  const cspSource = webview.cspSource;
  return `<!doctype html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codex Screen Capture</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #141414;
      --panel: #232321;
      --text: #f1efe8;
      --muted: #aaa49a;
      --accent: #8fc7ba;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at 20% 0%, #263935 0, var(--bg) 48%);
      color: var(--text);
      font: 14px/1.45 ui-sans-serif, system-ui, sans-serif;
    }
    main {
      width: min(720px, calc(100vw - 32px));
      padding: 24px;
      border: 1px solid #354540;
      border-radius: 20px;
      background: linear-gradient(150deg, #272927, var(--panel));
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
    }
    h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.02em; }
    p { margin: 0 0 18px; color: var(--muted); }
    button {
      border: 0;
      border-radius: 999px;
      padding: 10px 15px;
      color: #10211d;
      background: var(--accent);
      font-weight: 700;
      cursor: pointer;
    }
    #status { min-height: 20px; margin-top: 14px; color: var(--muted); }
    img {
      display: none;
      width: 100%;
      max-height: 320px;
      object-fit: contain;
      margin-top: 16px;
      border-radius: 14px;
      border: 1px solid #354540;
      background: #111;
    }
  </style>
</head>
<body>
  <main>
    <h1>Screen to Codex</h1>
    <p>Διάλεξε οθόνη ή παράθυρο. Θα αποθηκευτεί PNG και θα προστεθεί στο τρέχον Codex thread σαν attachment.</p>
    <button id="capture">Capture screen</button>
    <div id="status">Ready.</div>
    <img id="preview" alt="Screenshot preview">
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById("status");
    const previewEl = document.getElementById("preview");

    function setStatus(text) {
      statusEl.textContent = text;
    }

    async function captureScreen() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setStatus("Screen capture is not available in this VS Code WebView.");
        return;
      }
      try {
        setStatus("Opening screen picker...");
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false
        });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings ? track.getSettings() : {};
        const width = settings.width || video.videoWidth || 1920;
        const height = settings.height || video.videoHeight || 1080;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(video, 0, 0, width, height);
        stream.getTracks().forEach((item) => item.stop());
        const dataUrl = canvas.toDataURL("image/png");
        previewEl.src = dataUrl;
        previewEl.style.display = "block";
        vscode.postMessage({
          type: "screenCapture",
          dataUrl,
          width,
          height
        });
        setStatus("Screenshot captured. Attaching to Codex...");
      } catch (error) {
        setStatus("Capture cancelled or failed: " + (error && error.message ? error.message : String(error)));
      }
    }

    document.getElementById("capture").addEventListener("click", captureScreen);
    window.setTimeout(captureScreen, 250);
  </script>
</body>
</html>`;
}

async function openVoiceDraftCommand(context, outputChannel) {
  await appendDebugLog(context, outputChannel, "voice-draft-command-start");
  const panel = vscode.window.createWebviewPanel(
    "codexProviderVoiceDraft",
    "Codex Greek Voice",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false
    }
  );

  panel.webview.html = getVoiceDraftHtml(panel.webview);
  panel.webview.onDidReceiveMessage(
    async (message) => {
      if (!message || message.type !== "voiceDraft") {
        return;
      }
      const inserted = await insertPromptDraft(context, outputChannel, message.text);
      if (!inserted) {
        void vscode.window.showWarningMessage("Δεν μπόρεσα να βάλω το voice draft στο Codex composer.");
      }
    },
    undefined,
    context.subscriptions
  );
}

async function openScreenClipToolCommand(context, outputChannel) {
  await appendDebugLog(context, outputChannel, "open-screen-clip-tool-start", {
    platform: process.platform
  });
  const opened = await vscode.env.openExternal(vscode.Uri.parse("ms-screenclip:"));
  if (!opened) {
    void vscode.window.showWarningMessage("Δεν μπόρεσα να ανοίξω το Windows screen clipping tool.");
  }
}

async function attachScreenCaptureDataUrl(context, outputChannel, dataUrl, meta = {}) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) {
    throw new Error("Screen capture payload was not a PNG data URL.");
  }

  const captureDir = path.join(context.globalStorageUri.fsPath, SCREEN_CAPTURE_DIR_NAME);
  await fs.mkdir(captureDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(captureDir, `codex-screen-${stamp}.png`);
  await fs.writeFile(filePath, Buffer.from(match[1], "base64"));

  await appendDebugLog(context, outputChannel, "screen-capture-file-written", {
    filePath,
    width: meta.width || null,
    height: meta.height || null
  });

  await vscode.commands.executeCommand("chatgpt.addFileToThread", vscode.Uri.file(filePath));
  return filePath;
}

async function captureScreenToChatCommand(context, outputChannel) {
  await appendDebugLog(context, outputChannel, "capture-screen-to-chat-start");
  const panel = vscode.window.createWebviewPanel(
    "codexProviderScreenCapture",
    "Codex Screen Capture",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false
    }
  );

  panel.webview.html = getScreenCaptureHtml(panel.webview);
  panel.webview.onDidReceiveMessage(
    async (message) => {
      if (!message || message.type !== "screenCapture") {
        return;
      }
      try {
        const filePath = await attachScreenCaptureDataUrl(context, outputChannel, message.dataUrl, {
          width: message.width,
          height: message.height
        });
        void vscode.window.showInformationMessage(`Screenshot attached to Codex: ${path.basename(filePath)}`);
        panel.dispose();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await appendDebugLog(context, outputChannel, "capture-screen-to-chat-failed", {
          message: errorMessage
        });
        void vscode.window.showErrorMessage(`Δεν μπόρεσα να περάσω το screenshot στο Codex: ${errorMessage}`);
      }
    },
    undefined,
    context.subscriptions
  );
}

async function openCodexLbDashboardCommand(context, outputChannel) {
  const settings = getSettings();
  await appendDebugLog(context, outputChannel, "codex-lb-open-dashboard", {
    dashboardUrl: getCodexLbDashboardUrl(settings)
  });
  await vscode.env.openExternal(vscode.Uri.parse(getCodexLbDashboardUrl(settings)));
}

async function refreshCodexLbUsageCommand(context, outputChannel, options = {}) {
  if (shouldSkipCodexLbBackgroundRefresh(options)) {
    return;
  }

  if (lbUsageRefreshInFlight) {
    return;
  }

  const settings = getSettings();
  lbUsageRefreshInFlight = true;
  try {
    const apiKey = resolveCodexLbApiKey(settings);
    if (!apiKey) {
      throw new Error("CODEX_LB_API_KEY is not available for the VS Code extension host");
    }

    try {
      const statusResponse = await fetchJsonResponse(getCodexLbStatusUrl(settings));
      lbStatusLastPayload = statusResponse.json;
      lbStatusLastError = "";
    } catch (statusError) {
      lbStatusLastError = formatCodexLbErrorMessage(statusError);
    }

    const response = await fetchCodexLbWeeklyRemainingWithFallback(settings, apiKey);
    const payload = response.json;
    lbUsageLastUpstream = response.upstream || "";
    lbUsageLastPayload = {
      ...payload,
      fetched_at_epoch: Math.floor(Date.now() / 1000),
      fetched_at_local: new Date().toLocaleString()
    };
    lbUsageLastError = "";
    updateCodexLbUsageStatusItem();
    await appendDebugLog(context, outputChannel, "codex-lb-usage-refresh-success", {
      upstream: lbUsageLastUpstream,
      remainingPercent: lbUsageLastPayload.remaining_percent,
      allAccountsRemainingPercent: getCodexLbAllAccountsRemainingPercent(lbUsageLastPayload),
      activeAccountsRemainingPercent: getCodexLbActiveAccountsRemainingPercent(lbUsageLastPayload),
      allAccountsCount: lbUsageLastPayload.all_accounts_count ?? null,
      activeAccountsCount: lbUsageLastPayload.active_accounts_count ?? null,
      source: lbUsageLastPayload.source || null
    });

    if (!options.silent) {
      void vscode.window.showInformationMessage(formatCodexLbUsageSummaryLine());
    }
  } catch (error) {
    lbUsageLastError = formatCodexLbErrorMessage(error);
    if (!lbStatusLastPayload) {
      try {
        const statusResponse = await fetchJsonResponse(getCodexLbStatusUrl(settings));
        lbStatusLastPayload = statusResponse.json;
        lbStatusLastError = "";
      } catch (statusError) {
        lbStatusLastError = formatCodexLbErrorMessage(statusError);
      }
    }
    updateCodexLbUsageStatusItem();
    await appendDebugLog(context, outputChannel, "codex-lb-usage-refresh-failed", {
      message: lbUsageLastError
    });

    if (!options.silent) {
      void vscode.window.showWarningMessage(`Codex LB usage refresh failed: ${lbUsageLastError}`);
    }
  } finally {
    lbUsageRefreshInFlight = false;
  }
}

async function refreshCodexLbModelsCommand(context, outputChannel, options = {}) {
  if (shouldSkipCodexLbBackgroundRefresh(options)) {
    return;
  }

  if (lbModelCacheRefreshInFlight) {
    return;
  }

  const settings = getSettings();
  lbModelCacheRefreshInFlight = true;
  try {
    const refresherPath = resolveExistingPath(getCodexLbModelCacheRefresherPaths(settings));
    const envPath = resolveExistingPath(getCodexLbProviderEnvPaths(settings));
    const targets = getCodexLbRouteTargets(settings);
    let lastError;

    for (const target of targets) {
      try {
        await execFilePromise("node", [refresherPath], 20 * 1000, {
          env: {
            ...process.env,
            CODEX_LB_ENV_FILE: envPath,
            CODEX_LB_VSCODE_PROXY_BASE_URL: target.baseUrl
          }
        });
        lbUsageLastUpstream = target.name;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    lbModelCacheLastError = "";
    updateCodexLbUsageStatusItem();
    await appendDebugLog(context, outputChannel, "codex-lb-model-refresh-success", {
      modelSummary: formatCodexLbModelCacheSummaryLine()
    });

    if (!options.silent) {
      void vscode.window.showInformationMessage(`Codex LB models refreshed: ${formatCodexLbModelCacheSummaryLine()}`);
    }
  } catch (error) {
    lbModelCacheLastError = formatCodexLbErrorMessage(error);
    updateCodexLbUsageStatusItem();
    await appendDebugLog(context, outputChannel, "codex-lb-model-refresh-failed", {
      message: lbModelCacheLastError
    });

    if (!options.silent) {
      void vscode.window.showWarningMessage(`Codex LB model refresh failed: ${lbModelCacheLastError}`);
    }
  } finally {
    lbModelCacheRefreshInFlight = false;
  }
}

async function showCodexLbUsageCommand(context, outputChannel) {
  const settings = getSettings();
  const message = buildCodexLbUsageDetailsMessage(settings);
  const choice = await vscode.window.showInformationMessage(
    message,
    { modal: false },
    "Refresh now",
    "Select LB",
    "Refresh models",
    "Open Dashboard"
  );

  if (choice === "Refresh now") {
    await refreshCodexLbUsageCommand(context, outputChannel, { silent: false });
  } else if (choice === "Select LB") {
    await selectCodexLbRouteCommand(context, outputChannel);
  } else if (choice === "Refresh models") {
    await refreshCodexLbModelsCommand(context, outputChannel, { silent: false });
  } else if (choice === "Open Dashboard") {
    await openCodexLbDashboardCommand(context, outputChannel);
  }
}

async function showCodexLbStatusCommand(context, outputChannel) {
  const settings = getSettings();
  const summary = readCodexLbConfigSummary(settings);
  const activeThreadName = getActiveThreadName();
  const resolved = readLastResolvedModelSummary(activeThreadName);
  const message = [
    `Alias: ${detectCurrentSshAlias() || DEFAULT_REMOTE_SESSION_ALIAS}`,
    `Connected LB: ${describeActiveCodexLb(settings)}`,
    `LB route: ${formatCodexLbRouteLine(settings)}`,
    `Profile: ${summary.profile}`,
    `Configured model: ${summary.model}`,
    `Usage tokens: ${formatCodexLbUsageSummaryLine()}`,
    `Live models: ${formatCodexLbModelCacheSummaryLine()}`,
    `Model: ${resolved.detail}`,
    resolved.globalDetail ? `Global latest: ${resolved.globalDetail}` : "",
    `Base URL: ${summary.baseUrl}`,
    activeThreadName ? `Active thread: ${activeThreadName}` : ""
  ].filter(Boolean).join("\n");

  const choice = await vscode.window.showInformationMessage(
    message,
    { modal: false },
    "Open Dashboard",
    "Select LB",
    "Refresh Usage",
    "Refresh Models",
    "Reload Window"
  );

  if (choice === "Open Dashboard") {
    await openCodexLbDashboardCommand(context, outputChannel);
  } else if (choice === "Select LB") {
    await selectCodexLbRouteCommand(context, outputChannel);
  } else if (choice === "Refresh Usage") {
    await refreshCodexLbUsageCommand(context, outputChannel, { silent: false });
  } else if (choice === "Refresh Models") {
    await refreshCodexLbModelsCommand(context, outputChannel, { silent: false });
  } else if (choice === "Reload Window") {
    await reloadWindowCommand(context, outputChannel);
  }
}

async function selectCodexLbRouteCommand(context, outputChannel, statusBarItem = null) {
  const settings = getSettings();
  let currentProvider = null;
  let currentProviderId = "custom";
  try {
    const statusResponse = await fetchJsonResponse(getCodexLbStatusUrl(settings));
    lbStatusLastPayload = statusResponse.json;
    lbStatusLastError = "";
  } catch (error) {
    lbStatusLastError = formatCodexLbErrorMessage(error);
  }
  try {
    const providerInfo = await getCurrentProviderInfo();
    currentProvider = providerInfo && providerInfo.info ? providerInfo.info : null;
    currentProviderId = String(providerInfo && providerInfo.info && providerInfo.info.providerId || "custom").trim() || "custom";
  } catch {
    currentProvider = null;
    currentProviderId = "custom";
  }

  const routeState = getCodexLbRouteState(settings);
  const currentMode = routeState.routeMode || "direct";
  const items = buildCodexLbRouteQuickPickItems(settings, currentMode, routeState.mode || "primary", currentProviderId);
  const picked = await vscode.window.showQuickPick(items, {
    title: "Select Codex LB route",
    placeHolder: "Choose Codex LB routing or switch to direct ChatGPT Plus/Pro sign-in",
    ignoreFocusOut: true,
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (!picked) {
    return;
  }

  if (picked.action === "openai-direct-login") {
    await startOpenAiDirectLogin(context, outputChannel, statusBarItem);
    return;
  }

  try {
    const routeSelectorPath = resolveExistingPath(getCodexLbRouteSelectorPaths(settings));
    await execFilePromise(routeSelectorPath, [picked.mode], 15 * 1000);
    const statusResponse = await fetchJsonResponse(getCodexLbStatusUrl(settings));
    lbStatusLastPayload = statusResponse.json;
    lbStatusLastError = "";
    lbUsageLastUpstream = "";
    updateCodexLbUsageStatusItem();
    await appendDebugLog(context, outputChannel, "codex-lb-route-selected", {
      mode: picked.mode,
      route: formatCodexLbRouteLine(settings)
    });
    void refreshCodexLbModelsCommand(context, outputChannel, { silent: true, force: true });
    void refreshCodexLbUsageCommand(context, outputChannel, { silent: true, force: true });

    if (currentProviderId === "openai") {
      const providerInfo = await getCurrentProviderInfo();
      const nextText = buildUpdatedConfigText(providerInfo.configText, {
        providerId: "codex-lb"
      });
      const nextInfo = detectProviderInfo(nextText);
      if (nextText !== providerInfo.configText) {
        await writeConfigText(DEFAULTS.configPath, nextText);
      }
      pendingOpenAiDirectLogin = null;
      openAiDirectLoginAllowedUntilMs = 0;
      await appendDebugLog(context, outputChannel, "codex-lb-route-provider-restored", {
        mode: picked.mode,
        previousProviderId: currentProviderId,
        previousProviderLabel: currentProvider && currentProvider.label ? currentProvider.label : null,
        nextProviderId: nextInfo.providerId,
        nextProviderLabel: nextInfo.label
      });
      if (statusBarItem) {
        await refreshStatusBar(context, outputChannel, statusBarItem);
      }
      void vscode.window.showInformationMessage(
        `Codex LB route selected: ${formatCodexLbRoutePickMessageLabel(picked)}. Returning provider to Codex LB without restarting the extension host, so active Codex tasks stay connected.`
      );
      await appendDebugLog(context, outputChannel, "codex-lb-route-provider-restored-no-restart", {
        mode: picked.mode,
        reason: "avoid-interrupting-active-codex-task"
      });
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      `Codex LB route selected: ${formatCodexLbRoutePickMessageLabel(picked)}. ${formatCodexLbRouteLine(settings)}. Refreshing usage/models in the background.`,
      "Show Status",
      "Open Dashboard"
    );
    if (choice === "Show Status") {
      await showCodexLbStatusCommand(context, outputChannel);
    } else if (choice === "Open Dashboard") {
      await openCodexLbDashboardCommand(context, outputChannel);
    }
  } catch (error) {
    const message = formatCodexLbErrorMessage(error);
    await appendDebugLog(context, outputChannel, "codex-lb-route-selection-failed", {
      mode: picked.mode,
      message
    });
    void vscode.window.showWarningMessage(`Codex LB route selection failed: ${message}`);
  }
}

async function setReasoningLowBestEffort(context, outputChannel) {
  const argumentVariants = [
    ["low"],
    ["Low"],
    [{ mode: "agent", reasoningEffort: "low" }],
    [{ mode: "agent", level: "low" }],
    [{ reasoning: "low" }],
    [{ effort: "low" }],
    [{ reasoningEffort: "low" }],
    [{ value: "low" }],
    [{ level: "low" }],
    [{ id: "low" }]
  ];

  const explicit = await executeBestCommand(
    context,
    outputChannel,
    [
      "chatgpt.setReasoningEffort",
      "chatgpt.setReasoningLevel",
      "chatgpt.reasoning.set",
      "chatgpt.setModelAndReasoning",
      "workbench.action.chat.setReasoningEffort",
      "workbench.action.chat.setReasoningLevel",
      "workbench.action.chat.setModelAndReasoning",
      "chat.action.setReasoningEffort",
      "chat.action.setReasoningLevel"
    ],
    argumentVariants,
    "set-reasoning-low-explicit"
  );

  return Boolean(explicit);
}

async function sendContinuePromptCommand(context, outputChannel) {
  const submitted = await sendPromptAndEnter(context, outputChannel, "συνεχισε");
  if (!submitted) {
    void vscode.window.showWarningMessage("Δεν μπόρεσα να στείλω αυτόματα το \"συνεχισε\".");
  }
}

async function lowReasoningAndSaveMemoryPromptCommand(context, outputChannel) {
  const lowApplied = await setReasoningLowBestEffort(context, outputChannel);
  await delay(COMMAND_CHAIN_STEP_DELAY_MS);
  const submitted = await sendPromptAndEnter(context, outputChannel, "αποθηκευσε στην μνημη");

  if (!lowApplied) {
    void vscode.window.showWarningMessage(
      "Δεν βρέθηκε διαθέσιμο command για αυτόματο Reasoning=Low σε αυτή την έκδοση, αλλά στάλθηκε το μήνυμα."
    );
  }

  if (!submitted) {
    void vscode.window.showWarningMessage("Δεν μπόρεσα να στείλω αυτόματα το \"αποθηκευσε στην μνημη\".");
  }
}

async function openNewWindowCommand(context, outputChannel) {
  await appendDebugLog(context, outputChannel, "open-new-window-command-start");
  try {
    await vscode.commands.executeCommand("workbench.action.newWindow");
    await appendDebugLog(context, outputChannel, "open-new-window-command-success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendDebugLog(context, outputChannel, "open-new-window-command-failed", {
      message
    });
    void vscode.window.showErrorMessage(`Could not open a new VS Code window: ${message}`);
  }
}

function normalizeRemotePath(inputPath) {
  const rawValue = String(inputPath || DEFAULT_REMOTE_SESSION_PATH).trim();
  if (!rawValue) {
    return DEFAULT_REMOTE_SESSION_PATH;
  }

  if (rawValue === "~") {
    return path.posix.normalize(String(os.homedir() || "/"));
  }

  if (rawValue.startsWith("~/")) {
    return path.posix.join(String(os.homedir() || "/"), rawValue.slice(2));
  }

  if (rawValue.startsWith("/")) {
    return path.posix.normalize(rawValue);
  }

  return path.posix.normalize(`/${rawValue}`);
}

function resolveRemoteSessionOpenPath(inputPath) {
  const configuredPath = normalizeRemotePath(inputPath);
  if (isUsableCodexProjectPath(configuredPath)) {
    return configuredPath;
  }

  const workspaceProjectPath = getCurrentWorkspaceProjectPath();
  if (isUsableCodexProjectPath(workspaceProjectPath)) {
    return normalizeRemotePath(workspaceProjectPath);
  }

  return normalizeRemotePath(DEFAULT_REMOTE_SESSION_PATH);
}

function detectCurrentSshAliasDetails() {
  const directCandidates = [
    String(vscode.env.remoteName || "").trim(),
    ...((vscode.workspace.workspaceFolders || []).map((folder) => String(folder.uri && folder.uri.authority || "").trim())),
    String(vscode.window.activeTextEditor && vscode.window.activeTextEditor.document && vscode.window.activeTextEditor.document.uri
      ? vscode.window.activeTextEditor.document.uri.authority
      : "").trim()
  ].filter(Boolean);

  for (const candidate of directCandidates) {
    if (looksLikeRemoteSessionAlias(candidate)) {
      return {
        alias: String(candidate).trim(),
        source: "plain-candidate"
      };
    }

    const match = candidate.match(/^ssh-remote\+(.+)$/);
    if (!match) {
      continue;
    }

    try {
      return {
        alias: decodeURIComponent(match[1]),
        source: "uri-authority"
      };
    } catch {
      return {
        alias: match[1],
        source: "uri-authority"
      };
    }
  }

  const hostnameAlias = detectHostnameRemoteSessionAlias();
  if (hostnameAlias) {
    return {
      alias: hostnameAlias,
      source: "hostname-fallback"
    };
  }

  return {
    alias: "",
    source: "unresolved"
  };
}

function detectCurrentSshAlias() {
  return detectCurrentSshAliasDetails().alias;
}

function parseIndexedAlias(alias) {
  const normalized = String(alias || "").trim();
  const match = normalized.match(/^(.*?)(\d+)$/);
  if (!match) {
    return null;
  }

  const index = Number(match[2]);
  if (!Number.isFinite(index) || index < 1) {
    return null;
  }

  return {
    alias: `${match[1]}${index}`,
    prefix: match[1],
    index
  };
}

function resolveRemoteSeriesSettings(settings, currentAliasOverride = "") {
  const fallbackAlias = String(settings.remoteSessionDefaultAlias || DEFAULT_REMOTE_SESSION_ALIAS).trim() || DEFAULT_REMOTE_SESSION_ALIAS;
  const currentAlias = String(currentAliasOverride || detectCurrentSshAlias()).trim();
  const currentParsed = parseIndexedAlias(currentAlias);
  const fallbackParsed = parseIndexedAlias(fallbackAlias);
  const defaultParsed = parseIndexedAlias(DEFAULT_REMOTE_SESSION_ALIAS);

  const prefix = (currentParsed && currentParsed.prefix) || (fallbackParsed && fallbackParsed.prefix) || (defaultParsed && defaultParsed.prefix) || "codex-dev";
  let maxIndex = Number(settings.remoteSessionMaxIndex);
  if (!Number.isFinite(maxIndex) || maxIndex < 1) {
    maxIndex = (fallbackParsed && fallbackParsed.index) || (defaultParsed && defaultParsed.index) || DEFAULT_REMOTE_SESSION_MAX_INDEX;
  }
  maxIndex = Math.min(DEFAULT_REMOTE_SESSION_MAX_INDEX, Math.max(1, Math.floor(maxIndex)));
  if (prefix.toLowerCase() === DEFAULT_REMOTE_SESSION_ALIAS.toLowerCase()) {
    maxIndex = DEFAULT_REMOTE_SESSION_MAX_INDEX;
  }

  return {
    currentAlias,
    currentIndex: currentParsed ? currentParsed.index : null,
    fallbackAlias,
    prefix,
    maxIndex
  };
}

function buildPreferredRemoteAliasOrder(aliasCandidates, currentAlias = "", fallbackAlias = "") {
  const aliases = Array.isArray(aliasCandidates)
    ? aliasCandidates.map((alias) => String(alias || "").trim()).filter(Boolean)
    : [];
  if (aliases.length <= 1) {
    return aliases;
  }

  const normalizedCurrentAlias = String(currentAlias || "").trim();
  const currentIndex = normalizedCurrentAlias ? aliases.indexOf(normalizedCurrentAlias) : -1;
  if (currentIndex >= 0) {
    return aliases.slice(currentIndex + 1).concat(aliases.slice(0, currentIndex + 1));
  }

  const normalizedFallbackAlias = String(fallbackAlias || "").trim();
  const fallbackIndex = normalizedFallbackAlias ? aliases.indexOf(normalizedFallbackAlias) : -1;
  if (fallbackIndex >= 0) {
    return aliases.slice(fallbackIndex).concat(aliases.slice(0, fallbackIndex));
  }

  return aliases;
}

function buildRemoteAliasCandidates(prefix, maxIndex) {
  const aliases = [];
  const total = Math.max(1, Number(maxIndex) || 1);
  const includeBareAlias = prefix === "codex-dev";

  function addAlias(alias) {
    const normalized = String(alias || "").trim();
    if (normalized && !aliases.includes(normalized)) {
      aliases.push(normalized);
    }
  }

  if (includeBareAlias) {
    addAlias(prefix);
    for (let index = 1; index <= total; index += 1) {
      addAlias(`${prefix}${index}`);
    }
    return aliases;
  }

  for (let index = 1; index <= total; index += 1) {
    addAlias(`${prefix}${index}`);
  }
  return aliases;
}

async function selectRemoteSessionAlias(context, outputChannel, settings, nextRemote, traceId) {
  const currentAlias = String((nextRemote && nextRemote.currentAlias) || detectCurrentSshAlias() || "").trim();
  const series = resolveRemoteSeriesSettings(settings, currentAlias);
  const aliasCandidates = buildRemoteAliasCandidates(series.prefix, series.maxIndex);
  const suggestedAlias = String((nextRemote && nextRemote.targetAlias) || "").trim();

  const selection = await vscode.window.showQuickPick(
    aliasCandidates.map((alias) => ({
      label: alias,
      alias
    })),
    {
      title: "Open Remote Session",
      placeHolder: "Select SSH session window to open",
      ignoreFocusOut: true
    }
  );

  if (!selection || !selection.alias) {
    await appendDebugLog(context, outputChannel, "open-next-remote-session-selection-cancelled", {
      traceId,
      currentAlias: currentAlias || null,
      suggestedAlias: suggestedAlias || null,
      aliasCandidates
    });
    return "";
  }

  await appendDebugLog(context, outputChannel, "open-next-remote-session-selection-picked", {
    traceId,
    currentAlias: currentAlias || null,
    suggestedAlias: suggestedAlias || null,
    selectedAlias: selection.alias
  });
  return selection.alias;
}

async function countLocalExtensionHostProcesses() {
  try {
    const { stdout } = await execFileJsonSafe(
      "bash",
      [
        "-lc",
        "ps -u \"$USER\" -o command= | grep -F -- '--type=extensionHost' | grep -v grep | wc -l"
      ],
      REMOTE_SESSION_ACTIVITY_TIMEOUT_MS
    );
    const count = Number(String(stdout || "").trim());
    return Number.isFinite(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

async function readRecentRemoteSessionSuccessAliases(context, limit = 32, sinceMs = 0) {
  try {
    const rawLog = await fs.readFile(getLogPath(context), "utf8");
    const lines = String(rawLog || "").trim().split(/\r?\n/).slice(-512);
    const aliases = [];
    const safeSinceMs = Number.isFinite(Number(sinceMs)) ? Number(sinceMs) : 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const entryTimeMs = entry && entry.ts ? Date.parse(entry.ts) : 0;
        if (safeSinceMs > 0 && (!Number.isFinite(entryTimeMs) || entryTimeMs < safeSinceMs)) {
          continue;
        }
        if (entry && entry.event === "open-next-remote-session-success") {
          const alias = String(entry.payload && entry.payload.targetAlias || "").trim();
          if (alias) {
            aliases.push(alias);
          }
        }
      } catch {
        // Ignore malformed log lines.
      }
    }

    return aliases.slice(-Math.max(1, Number(limit) || 1));
  } catch {
    return [];
  }
}

function extractRecentRemoteAliasCycle(successAliases, aliasCandidates) {
  const allowed = new Set(aliasCandidates);
  const cycle = [];
  const seen = new Set();

  for (let index = successAliases.length - 1; index >= 0; index -= 1) {
    const alias = String(successAliases[index] || "").trim();
    if (!allowed.has(alias)) {
      continue;
    }
    if (seen.has(alias)) {
      break;
    }
    seen.add(alias);
    cycle.push(alias);
  }

  return cycle.reverse();
}

function pickNextAliasFromOrder(aliasOrder, lastAlias, fallbackAlias) {
  if (!Array.isArray(aliasOrder) || aliasOrder.length === 0) {
    return fallbackAlias;
  }
  const normalizedLastAlias = String(lastAlias || "").trim();
  if (!normalizedLastAlias) {
    return aliasOrder[0];
  }
  const currentIndex = aliasOrder.indexOf(normalizedLastAlias);
  if (currentIndex < 0) {
    return aliasOrder[0];
  }
  return aliasOrder[(currentIndex + 1) % aliasOrder.length];
}

async function probeRemoteAliasHasActiveVscodeServer(alias) {
  const startedAt = Date.now();
  const sshArgs = [
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${Math.max(1, Math.floor(REMOTE_SESSION_ACTIVITY_TIMEOUT_MS / 1000))}`,
    alias,
    "bash -lc 'ps -u \"$USER\" -o command= | grep -F \"/.vscode-server/code-\" >/dev/null && echo active || echo inactive'"
  ];

  try {
    const { stdout } = await execFileJsonSafe("ssh", sshArgs, REMOTE_SESSION_ACTIVITY_TIMEOUT_MS);
    return {
      alias,
      reachable: true,
      active: /active/i.test(String(stdout || "").trim()),
      detail: String(stdout || "").trim(),
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      alias,
      reachable: false,
      active: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt
    };
  }
}

async function resolveNextRemoteAlias(context, outputChannel, settings, traceId) {
  const currentAliasResolution = await resolveCurrentRemoteSessionAlias(context, outputChannel);
  const resolvedCurrentAliasSource = normalizeRemoteSessionAliasSource(currentAliasResolution.source);
  const hasStrongCurrentAlias = isStrongRemoteSessionAliasSource(resolvedCurrentAliasSource);
  const currentAliasForSelection = hasStrongCurrentAlias ? currentAliasResolution.alias : "";
  const series = resolveRemoteSeriesSettings(settings, currentAliasForSelection);
  const aliasCandidates = buildRemoteAliasCandidates(series.prefix, series.maxIndex);
  const preferredAliasOrder = hasStrongCurrentAlias
    ? buildPreferredRemoteAliasOrder(aliasCandidates, series.currentAlias, series.fallbackAlias)
    : aliasCandidates.slice();
  const storedAliasOrderVersion = String(context.globalState.get(REMOTE_SESSION_ALIAS_ORDER_VERSION_KEY, "") || "");
  let aliasOrderResetAt = Number(context.globalState.get(REMOTE_SESSION_ALIAS_ORDER_RESET_AT_KEY, 0) || 0);
  if (storedAliasOrderVersion !== REMOTE_SESSION_ALIAS_ORDER_VERSION) {
    aliasOrderResetAt = Date.now();
    await context.globalState.update(REMOTE_SESSION_KNOWN_ALIASES_KEY, []);
    await context.globalState.update(REMOTE_SESSION_FALLBACK_LAST_TARGET_KEY, "");
    await context.globalState.update(REMOTE_SESSION_ALIAS_ORDER_RESET_AT_KEY, aliasOrderResetAt);
    await context.globalState.update(REMOTE_SESSION_ALIAS_ORDER_VERSION_KEY, REMOTE_SESSION_ALIAS_ORDER_VERSION);
    await appendDebugLog(context, outputChannel, "open-next-remote-session-alias-state-reset", {
      traceId,
      previousVersion: storedAliasOrderVersion,
      nextVersion: REMOTE_SESSION_ALIAS_ORDER_VERSION,
      resetAt: new Date(aliasOrderResetAt).toISOString(),
      aliasCandidates,
      preferredAliasOrder
    });
  }
  await appendDebugLog(context, outputChannel, "open-next-remote-session-resolve-input", {
    traceId,
    remoteName: String(vscode.env.remoteName || ""),
    detectedCurrentAlias: detectCurrentSshAlias(),
    resolvedCurrentAlias: String(currentAliasResolution.alias || "").trim(),
    resolvedCurrentAliasSource: resolvedCurrentAliasSource || "unknown",
    resolvedCurrentAliasStrong: hasStrongCurrentAlias,
    series,
    aliasCandidates,
    preferredAliasOrder
  });

  const currentAliasIndex = series.currentAlias ? aliasCandidates.indexOf(series.currentAlias) : -1;
  if (hasStrongCurrentAlias && currentAliasIndex >= 0) {
    const sequentialTargetAlias = aliasCandidates[currentAliasIndex + 1] || "";
    await appendDebugLog(context, outputChannel, "open-next-remote-session-target-selected", {
      traceId,
      mode: sequentialTargetAlias ? "strict-sequential-next" : "strict-sequential-end",
      currentAlias: series.currentAlias,
      targetAlias: sequentialTargetAlias || null
    });
    return {
      currentAlias: series.currentAlias,
      targetAlias: sequentialTargetAlias,
      mode: sequentialTargetAlias ? "strict-sequential-next" : "strict-sequential-end",
      probeResults: []
    };
  }

  const knownRaw = context.globalState.get(REMOTE_SESSION_KNOWN_ALIASES_KEY, []);
  const knownAliases = new Set(
    Array.isArray(knownRaw)
      ? knownRaw.map((value) => String(value || "").trim()).filter(Boolean)
      : []
  );
  if (series.currentAlias) {
    knownAliases.add(series.currentAlias);
  }
  const knownAliasCandidates = preferredAliasOrder.filter((alias) => knownAliases.has(alias));
  const missingKnownAliases = preferredAliasOrder.filter((alias) => alias !== series.currentAlias && !knownAliases.has(alias));
  const liveRegistry = await readRemoteSessionLiveAliases(context, outputChannel, {
    pruneStale: true,
    logPrunes: true
  });
  const liveAliasSet = new Set(liveRegistry.activeAliases);
  const liveAliasCandidates = preferredAliasOrder.filter((alias) => liveAliasSet.has(alias));
  const missingLiveAliases = preferredAliasOrder.filter((alias) => alias !== series.currentAlias && !liveAliasSet.has(alias));
  const recentSuccessAliases = await readRecentRemoteSessionSuccessAliases(context, aliasCandidates.length * 8, aliasOrderResetAt);
  const recentAliasCycle = extractRecentRemoteAliasCycle(recentSuccessAliases, aliasCandidates);
  const openedAliasSet = new Set([
    ...knownAliases,
    ...recentAliasCycle
  ]);
  const openedAliasCandidates = preferredAliasOrder.filter((alias) => openedAliasSet.has(alias));
  const missingOpenedAliases = preferredAliasOrder.filter((alias) => alias !== series.currentAlias && !openedAliasSet.has(alias));
  const extensionHostCount = await countLocalExtensionHostProcesses();
  await appendDebugLog(context, outputChannel, "open-next-remote-session-resolve-input", {
    traceId,
    remoteName: String(vscode.env.remoteName || ""),
    detectedCurrentAlias: detectCurrentSshAlias(),
    resolvedCurrentAlias: String(currentAliasResolution.alias || "").trim(),
    resolvedCurrentAliasSource: String(currentAliasResolution.source || "").trim() || "unknown",
    series,
    aliasCandidates,
    preferredAliasOrder,
    knownAliasCandidates,
    missingKnownAliases,
    liveAliasCandidates,
    missingLiveAliases,
    openedAliasCandidates,
    missingOpenedAliases,
    aliasOrderResetAt,
    recentSuccessAliases,
    recentAliasCycle,
    extensionHostCount
  });
  const remoteName = String(vscode.env.remoteName || "").trim();
  const shouldUseSshProbes = !/^ssh-remote$/i.test(remoteName);
  let probeResults = [];
  let reachableResults = [];
  let inactiveResults = [];
  let allProbesUnreachable = true;

  if (shouldUseSshProbes) {
    probeResults = await Promise.all(preferredAliasOrder.map((alias) => probeRemoteAliasHasActiveVscodeServer(alias)));
    reachableResults = probeResults.filter((entry) => entry.reachable);
    inactiveResults = reachableResults.filter((entry) => !entry.active);
    allProbesUnreachable = reachableResults.length === 0;
  } else {
    await appendDebugLog(context, outputChannel, "open-next-remote-session-probes-skipped", {
      traceId,
      reason: "remote-extension-host",
      remoteName,
      preferredAliasOrder
    });
  }
  await appendDebugLog(context, outputChannel, "open-next-remote-session-probes-finished", {
    traceId,
    skipped: !shouldUseSshProbes,
    reachableCount: reachableResults.length,
    unreachableCount: probeResults.length - reachableResults.length,
    inactiveCount: inactiveResults.length,
    probes: probeResults
  });

  if (reachableResults.length > 0 && inactiveResults.length > 0) {
    const preferredInactive = inactiveResults.find((entry) => entry.alias !== series.currentAlias) || inactiveResults[0];
    await appendDebugLog(context, outputChannel, "open-next-remote-session-target-selected", {
      traceId,
      mode: "first-missing-slot",
      targetAlias: preferredInactive.alias
    });
    return {
      currentAlias: series.currentAlias,
      targetAlias: preferredInactive.alias,
      mode: "first-missing-slot",
      probeResults
    };
  }

  if (!shouldUseSshProbes || allProbesUnreachable) {
    if (missingLiveAliases.length > 0) {
      await appendDebugLog(context, outputChannel, "open-next-remote-session-target-selected", {
        traceId,
        mode: shouldUseSshProbes ? "next-free-live-slot-unreachable-probes" : "next-free-live-slot-no-probes",
        targetAlias: missingLiveAliases[0],
        liveAliasCandidates,
        extensionHostCount
      });
      return {
        currentAlias: series.currentAlias,
        targetAlias: missingLiveAliases[0],
        mode: shouldUseSshProbes ? "next-free-live-slot-unreachable-probes" : "next-free-live-slot-no-probes",
        probeResults
      };
    }

    if (missingOpenedAliases.length > 0) {
      await appendDebugLog(context, outputChannel, "open-next-remote-session-target-selected", {
        traceId,
        mode: shouldUseSshProbes ? "next-free-history-slot-unreachable-probes" : "next-free-history-slot-no-probes",
        targetAlias: missingOpenedAliases[0],
        recentAliasCycle,
        extensionHostCount
      });
      return {
        currentAlias: series.currentAlias,
        targetAlias: missingOpenedAliases[0],
        mode: shouldUseSshProbes ? "next-free-history-slot-unreachable-probes" : "next-free-history-slot-no-probes",
        probeResults
      };
    }

    if (missingKnownAliases.length > 0) {
      await appendDebugLog(context, outputChannel, "open-next-remote-session-target-selected", {
        traceId,
        mode: "first-missing-known-slot",
        targetAlias: missingKnownAliases[0],
        knownAliasCandidates
      });
      return {
        currentAlias: series.currentAlias,
        targetAlias: missingKnownAliases[0],
        mode: "first-missing-known-slot",
        probeResults
      };
    }

    const fallbackOrder = preferredAliasOrder.filter((alias) => alias !== series.currentAlias);
    const historyFallbackAlias = pickNextAliasFromOrder(
      fallbackOrder.length > 0 ? fallbackOrder : preferredAliasOrder,
      "",
      series.fallbackAlias
    );
    await appendDebugLog(context, outputChannel, "open-next-remote-session-target-selected", {
      traceId,
      mode: shouldUseSshProbes ? "preferred-order-fallback-unreachable-probes" : "preferred-order-fallback-no-probes",
      targetAlias: historyFallbackAlias,
      knownAliasCandidates,
      openedAliasCandidates,
      preferredAliasOrder,
      extensionHostCount
    });
    return {
      currentAlias: series.currentAlias,
      targetAlias: historyFallbackAlias,
      mode: shouldUseSshProbes ? "preferred-order-fallback-unreachable-probes" : "preferred-order-fallback-no-probes",
      probeResults
    };
  }

  if (missingKnownAliases.length > 0) {
    await appendDebugLog(context, outputChannel, "open-next-remote-session-target-selected", {
      traceId,
      mode: "first-missing-known-slot",
      targetAlias: missingKnownAliases[0],
      knownAliasCandidates
    });
    return {
      currentAlias: series.currentAlias,
      targetAlias: missingKnownAliases[0],
      mode: "first-missing-known-slot",
      probeResults
    };
  }
  await appendDebugLog(context, outputChannel, "open-next-remote-session-target-selected", {
    traceId,
    mode: "all-slots-open",
    targetAlias: "",
    knownAliasCandidates,
    openedAliasCandidates,
    preferredAliasOrder
  });
  return {
    currentAlias: series.currentAlias,
    targetAlias: "",
    mode: "all-slots-open",
    probeResults
  };
}

async function openNextRemoteSessionCommand(context, outputChannel) {
  if (openNextRemoteSessionInFlight) {
    await appendDebugLog(context, outputChannel, "open-next-remote-session-ignored", {
      reason: "in-flight",
      targetAlias: openNextRemoteSessionInFlight.targetAlias,
      traceId: openNextRemoteSessionInFlight.traceId
    });
    void vscode.window.showInformationMessage(
      `Already opening ${openNextRemoteSessionInFlight.targetAlias || "next SSH window"}...`
    );
    return;
  }

  const settings = getSettings();
  const traceId = `remote-next-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await appendDebugLog(context, outputChannel, "open-next-remote-session-button-clicked", {
    traceId,
    remoteName: String(vscode.env.remoteName || ""),
    detectedCurrentAlias: detectCurrentSshAlias(),
    settings: {
      remoteSessionDefaultAlias: settings.remoteSessionDefaultAlias,
      remoteSessionMaxIndex: settings.remoteSessionMaxIndex,
      remoteSessionOpenPath: settings.remoteSessionOpenPath
    }
  });

  const nextRemote = await resolveNextRemoteAlias(context, outputChannel, settings, traceId);
  const targetAlias = await selectRemoteSessionAlias(context, outputChannel, settings, nextRemote, traceId);
  if (!targetAlias) {
    return;
  }

  const currentAlias = String((nextRemote && nextRemote.currentAlias) || "").trim();
  const openMode = nextRemote && nextRemote.mode
    ? `manual-select:${nextRemote.mode}`
    : "manual-select";
  const remotePath = resolveRemoteSessionOpenPath(settings.remoteSessionOpenPath);
  const remoteUri = vscode.Uri.parse(
    `vscode-remote://ssh-remote+${encodeURIComponent(targetAlias)}${remotePath}`
  );
  const reservationSource = `open-attempt:${traceId}`;
  openNextRemoteSessionInFlight = {
    traceId,
    targetAlias
  };
  const armedSnapshot = await buildRemoteSessionBootstrapSnapshot(context);
  await writeRemoteSessionBootstrapTrace(context, {
    traceId,
    armedAt: new Date().toISOString(),
    currentAlias,
    targetAlias,
    mode: openMode,
    remotePath,
    armedSnapshot
  });
  await appendDebugLog(context, outputChannel, "open-next-remote-session-debug-armed", {
    traceId,
    currentAlias,
    targetAlias,
    mode: openMode,
    remotePath,
    armedSnapshot
  });

  await appendDebugLog(context, outputChannel, "open-next-remote-session-start", {
    traceId,
    currentAlias,
    targetAlias,
    mode: openMode,
    remotePath,
    probes: Array.isArray(nextRemote.probeResults)
      ? nextRemote.probeResults.map((entry) => ({
          alias: entry.alias,
          reachable: entry.reachable,
          active: entry.active,
          detail: entry.detail || null,
          error: entry.error || null
        }))
      : []
  });

  try {
    await markRemoteSessionAliasLive(context, outputChannel, targetAlias, {
      source: reservationSource,
      status: "pending",
      log: false
    });
    const shouldOpenSidebarAfterNewWindow = false;
    await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, shouldOpenSidebarAfterNewWindow);
    await appendDebugLog(context, outputChannel, "open-next-remote-session-sidebar-armed", {
      traceId,
      targetAlias,
      shouldOpenSidebar: shouldOpenSidebarAfterNewWindow,
      configuredAutoOpenSidebar: settings.autoOpenCodexSidebar
    });
    await switchToExplorerBeforeWindowLifecycle(context, outputChannel, "open-next-remote-session");
    await appendDebugLog(context, outputChannel, "open-next-remote-session-openfolder-attempt", {
      traceId,
      variant: "options-forceNewWindow",
      uri: remoteUri.toString()
    });
    await vscode.commands.executeCommand("vscode.openFolder", remoteUri, {
      forceNewWindow: true
    });
    const knownRaw = context.globalState.get(REMOTE_SESSION_KNOWN_ALIASES_KEY, []);
    const knownAliases = new Set(Array.isArray(knownRaw) ? knownRaw.map((value) => String(value || "").trim()).filter(Boolean) : []);
    if (currentAlias) {
      knownAliases.add(currentAlias);
    }
    knownAliases.add(targetAlias);
    await context.globalState.update(REMOTE_SESSION_KNOWN_ALIASES_KEY, Array.from(knownAliases).slice(-32));
    await context.globalState.update(REMOTE_SESSION_FALLBACK_LAST_TARGET_KEY, targetAlias);
    await markRemoteSessionAliasLive(context, outputChannel, targetAlias, {
      source: "open-success",
      status: "pending"
    });
    await appendDebugLog(context, outputChannel, "open-next-remote-session-success", {
      traceId,
      targetAlias,
      remotePath
    });
  } catch (firstError) {
    try {
      await appendDebugLog(context, outputChannel, "open-next-remote-session-openfolder-attempt", {
        traceId,
        variant: "boolean-true-fallback",
        uri: remoteUri.toString(),
        firstError: firstError instanceof Error ? firstError.message : String(firstError)
      });
      await vscode.commands.executeCommand("vscode.openFolder", remoteUri, true);
      const knownRaw = context.globalState.get(REMOTE_SESSION_KNOWN_ALIASES_KEY, []);
      const knownAliases = new Set(Array.isArray(knownRaw) ? knownRaw.map((value) => String(value || "").trim()).filter(Boolean) : []);
      if (currentAlias) {
        knownAliases.add(currentAlias);
      }
      knownAliases.add(targetAlias);
      await context.globalState.update(REMOTE_SESSION_KNOWN_ALIASES_KEY, Array.from(knownAliases).slice(-32));
      await context.globalState.update(REMOTE_SESSION_FALLBACK_LAST_TARGET_KEY, targetAlias);
      await markRemoteSessionAliasLive(context, outputChannel, targetAlias, {
        source: "open-success",
        status: "pending"
      });
      await appendDebugLog(context, outputChannel, "open-next-remote-session-success", {
        traceId,
        targetAlias,
        remotePath,
        mode: "boolean-true-fallback"
      });
    } catch (secondError) {
      const message = secondError instanceof Error ? secondError.message : String(secondError);
      await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, false);
      await clearRemoteSessionAliasReservation(context, targetAlias, reservationSource);
      await clearRemoteSessionBootstrapTrace(context);
      await appendDebugLog(context, outputChannel, "open-next-remote-session-failed", {
        traceId,
        targetAlias,
        remotePath,
        firstError: firstError instanceof Error ? firstError.message : String(firstError),
        message
      });
      void vscode.window.showErrorMessage(
        `Could not open SSH session ${targetAlias} (${remotePath}): ${message}`
      );
    }
  } finally {
    openNextRemoteSessionInFlight = null;
  }
}

async function openLaneCommand(context, outputChannel) {
  if (openNextRemoteSessionInFlight) {
    await appendDebugLog(context, outputChannel, "open-lane-ignored", {
      reason: "in-flight",
      targetAlias: openNextRemoteSessionInFlight.targetAlias,
      traceId: openNextRemoteSessionInFlight.traceId
    });
    void vscode.window.showInformationMessage(
      `Already opening ${openNextRemoteSessionInFlight.targetAlias || "lane window"}...`
    );
    return;
  }

  const manifest = await readCoderRoomsLaneManifest();
  if (!manifest.lanes.length) {
    await appendDebugLog(context, outputChannel, "open-lane-missing-manifest", {
      manifestPath: manifest.manifestPath
    });
    void vscode.window.showErrorMessage(
      `Could not load coder rooms lane manifest: ${manifest.manifestPath}`
    );
    return;
  }

  const selection = await vscode.window.showQuickPick(
    manifest.lanes.map((lane) => ({
      label: `Lane ${lane.laneId}`,
      description: `${lane.remoteAlias} • ${lane.role || "worker"} • ${lane.parityStatus || "ready"}`,
      detail: `${lane.path} • ${lane.expectedBranch || lane.branch || "no branch"}`,
      lane
    })),
    {
      title: "Codex: Open Lane 01..08",
      placeHolder: "Select numbered worktree lane to open",
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true
    }
  );
  if (!selection || !selection.lane) {
    return;
  }

  const lane = selection.lane;
  if (lane.launchBlocked) {
    await appendDebugLog(context, outputChannel, "open-lane-blocked", {
      laneId: lane.laneId,
      remoteAlias: lane.remoteAlias,
      expectedPath: lane.path,
      expectedBranch: lane.expectedBranch || null,
      manifestPath: manifest.manifestPath
    });
    void vscode.window.showErrorMessage(
      `Lane ${lane.laneId} is blocked. Check ${manifest.manifestPath} for path/branch state.`
    );
    return;
  }

  const settings = getSettings();
  const traceId = `open-lane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const currentAliasResolution = await resolveCurrentRemoteSessionAlias(context, outputChannel);
  const currentAlias = String(currentAliasResolution && currentAliasResolution.alias || "").trim();
  const remoteUri = vscode.Uri.parse(
    `vscode-remote://ssh-remote+${encodeURIComponent(lane.remoteAlias)}${lane.path}`
  );
  const reservationSource = `open-attempt:${traceId}`;
  openNextRemoteSessionInFlight = {
    traceId,
    targetAlias: lane.remoteAlias
  };

  const armedSnapshot = await buildRemoteSessionBootstrapSnapshot(context);
  await writeRemoteSessionBootstrapTrace(context, {
    traceId,
    armedAt: new Date().toISOString(),
    currentAlias,
    targetAlias: lane.remoteAlias,
    remoteAlias: lane.remoteAlias,
    mode: "lane-manifest",
    remotePath: lane.path,
    manifestPath: lane.manifestPath || manifest.manifestPath,
    laneId: lane.laneId,
    expectedPath: lane.path,
    expectedBranch: lane.expectedBranch || lane.branch || "",
    role: lane.role || null,
    roomId: lane.roomId || null,
    parityStatus: lane.parityStatus || null,
    workspaceAliasStrong: true,
    armedSnapshot
  });
  await appendDebugLog(context, outputChannel, "open-lane-debug-armed", {
    traceId,
    currentAlias: currentAlias || null,
    laneId: lane.laneId,
    remoteAlias: lane.remoteAlias,
    remotePath: lane.path,
    expectedBranch: lane.expectedBranch || lane.branch || null,
    manifestPath: lane.manifestPath || manifest.manifestPath
  });

  try {
    await markRemoteSessionAliasLive(context, outputChannel, lane.remoteAlias, {
      source: reservationSource,
      status: "pending",
      log: false
    });
    const shouldOpenSidebarAfterNewWindow = false;
    await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, shouldOpenSidebarAfterNewWindow);
    await appendDebugLog(context, outputChannel, "open-lane-sidebar-armed", {
      traceId,
      laneId: lane.laneId,
      remoteAlias: lane.remoteAlias,
      shouldOpenSidebar: shouldOpenSidebarAfterNewWindow,
      configuredAutoOpenSidebar: settings.autoOpenCodexSidebar
    });
    await switchToExplorerBeforeWindowLifecycle(context, outputChannel, "open-lane");
    await appendDebugLog(context, outputChannel, "open-lane-openfolder-attempt", {
      traceId,
      variant: "options-forceNewWindow",
      uri: remoteUri.toString()
    });
    await vscode.commands.executeCommand("vscode.openFolder", remoteUri, {
      forceNewWindow: true
    });
    const knownRaw = context.globalState.get(REMOTE_SESSION_KNOWN_ALIASES_KEY, []);
    const knownAliases = new Set(Array.isArray(knownRaw) ? knownRaw.map((value) => String(value || "").trim()).filter(Boolean) : []);
    if (currentAlias) {
      knownAliases.add(currentAlias);
    }
    knownAliases.add(lane.remoteAlias);
    await context.globalState.update(REMOTE_SESSION_KNOWN_ALIASES_KEY, Array.from(knownAliases).slice(-32));
    await context.globalState.update(REMOTE_SESSION_FALLBACK_LAST_TARGET_KEY, lane.remoteAlias);
    await markRemoteSessionAliasLive(context, outputChannel, lane.remoteAlias, {
      source: "open-success",
      status: "pending"
    });
    await appendDebugLog(context, outputChannel, "open-lane-success", {
      traceId,
      laneId: lane.laneId,
      remoteAlias: lane.remoteAlias,
      remotePath: lane.path
    });
  } catch (firstError) {
    try {
      await appendDebugLog(context, outputChannel, "open-lane-openfolder-attempt", {
        traceId,
        variant: "boolean-true-fallback",
        uri: remoteUri.toString(),
        firstError: firstError instanceof Error ? firstError.message : String(firstError)
      });
      await vscode.commands.executeCommand("vscode.openFolder", remoteUri, true);
      const knownRaw = context.globalState.get(REMOTE_SESSION_KNOWN_ALIASES_KEY, []);
      const knownAliases = new Set(Array.isArray(knownRaw) ? knownRaw.map((value) => String(value || "").trim()).filter(Boolean) : []);
      if (currentAlias) {
        knownAliases.add(currentAlias);
      }
      knownAliases.add(lane.remoteAlias);
      await context.globalState.update(REMOTE_SESSION_KNOWN_ALIASES_KEY, Array.from(knownAliases).slice(-32));
      await context.globalState.update(REMOTE_SESSION_FALLBACK_LAST_TARGET_KEY, lane.remoteAlias);
      await markRemoteSessionAliasLive(context, outputChannel, lane.remoteAlias, {
        source: "open-success",
        status: "pending"
      });
      await appendDebugLog(context, outputChannel, "open-lane-success", {
        traceId,
        laneId: lane.laneId,
        remoteAlias: lane.remoteAlias,
        remotePath: lane.path,
        mode: "boolean-true-fallback"
      });
    } catch (secondError) {
      const message = secondError instanceof Error ? secondError.message : String(secondError);
      await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, false);
      await clearRemoteSessionAliasReservation(context, lane.remoteAlias, reservationSource);
      await clearRemoteSessionBootstrapTrace(context);
      await appendDebugLog(context, outputChannel, "open-lane-failed", {
        traceId,
        laneId: lane.laneId,
        remoteAlias: lane.remoteAlias,
        remotePath: lane.path,
        firstError: firstError instanceof Error ? firstError.message : String(firstError),
        message
      });
      void vscode.window.showErrorMessage(
        `Could not open lane ${lane.laneId} (${lane.remoteAlias}, ${lane.path}): ${message}`
      );
    }
  } finally {
    openNextRemoteSessionInFlight = null;
  }
}

async function listDirectoryNames(directoryPath) {
  try {
    return await fs.readdir(directoryPath);
  } catch {
    return [];
  }
}

function isCleanRestoreStaleExtensionName(name) {
  return CLEAN_RESTORE_STALE_EXTENSION_PATTERNS.some((pattern) => pattern.test(String(name || "")));
}

async function restoreOpenAiCodexManifest(openAiExtensionDir, backupRoot) {
  const packageJsonPath = path.join(openAiExtensionDir, "package.json");
  const existingManifest = await readJsonIfExists(packageJsonPath);
  if (!existingManifest) {
    return {
      restored: false,
      reason: "missing-openai-package-json"
    };
  }

  await copyPathToBackup(packageJsonPath, backupRoot);
  const artifactNames = (await listDirectoryNames(openAiExtensionDir))
    .filter((name) => /\.bak/i.test(name) || /patch/i.test(name) || /\.orig$/i.test(name));
  const backupPackageName = artifactNames.find((name) => /^package\.json\.bak/i.test(name));
  const backupManifest = backupPackageName
    ? await readJsonIfExists(path.join(openAiExtensionDir, backupPackageName))
    : null;
  const normalizedManifest = normalizeOpenAiCodexManifest(backupManifest || existingManifest);
  await writeJsonFile(packageJsonPath, normalizedManifest);

  const movedArtifacts = [];
  for (const artifactName of artifactNames) {
    const movedTo = await movePathToBackup(path.join(openAiExtensionDir, artifactName), backupRoot);
    if (movedTo) {
      movedArtifacts.push(movedTo);
    }
  }

  return {
    restored: true,
    usedBackupPackage: Boolean(backupManifest),
    movedArtifactCount: movedArtifacts.length
  };
}

async function ensureCustomExtensionFolder(context, customExtensionDir, backupRoot) {
  const existingTarget = await statIfExists(customExtensionDir);
  if (existingTarget) {
    return {
      ensured: true,
      source: "existing-target"
    };
  }

  const extensionSource = context && context.extensionPath ? context.extensionPath : "";
  const sourceStat = extensionSource ? await statIfExists(extensionSource) : null;
  if (!sourceStat || !sourceStat.isDirectory()) {
    return {
      ensured: false,
      source: null
    };
  }

  const comparableSource = normalizeComparableFsPath(extensionSource);
  const comparableTarget = normalizeComparableFsPath(customExtensionDir);
  if (comparableSource === comparableTarget) {
    return {
      ensured: true,
      source: "current-target"
    };
  }

  await copyPathToBackup(extensionSource, backupRoot);
  await fs.mkdir(path.dirname(customExtensionDir), { recursive: true });
  await fs.cp(extensionSource, customExtensionDir, { recursive: true, force: true });
  return {
    ensured: true,
    source: extensionSource
  };
}

async function cleanRestoreSettingsFile(filePath, backupRoot) {
  const payload = await readJsonIfExists(filePath);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      changed: false,
      reason: "missing-or-invalid"
    };
  }

  const cleaned = cleanRestoreSensitiveSettings(payload);
  if (JSON.stringify(cleaned) === JSON.stringify(payload)) {
    return {
      changed: false,
      reason: "already-clean"
    };
  }

  await copyPathToBackup(filePath, backupRoot);
  await writeJsonFile(filePath, cleaned);
  return {
    changed: true
  };
}

async function moveCustomWorkspaceStorage(workspaceStorageRoot, backupRoot) {
  const workspaceIds = await listDirectoryNames(workspaceStorageRoot);
  let movedCount = 0;
  for (const workspaceId of workspaceIds) {
    const movedTo = await movePathToBackup(
      path.join(workspaceStorageRoot, workspaceId, "oll4com.codex-session-tools"),
      backupRoot
    );
    if (movedTo) {
      movedCount += 1;
    }
  }
  return movedCount;
}

function isSafeVsCodeServerLogsPath(candidatePath, vscodeServerDir) {
  return normalizeComparableFsPath(candidatePath) === normalizeComparableFsPath(
    path.join(vscodeServerDir, VSCODE_SERVER_LOGS_RELATIVE_PATH)
  );
}

async function collectPathStats(targetPath) {
  const stat = await statIfExists(targetPath);
  if (!stat) {
    return {
      exists: false,
      files: 0,
      directories: 0,
      bytes: 0
    };
  }
  if (stat.isFile()) {
    return {
      exists: true,
      files: 1,
      directories: 0,
      bytes: stat.size
    };
  }
  if (!stat.isDirectory()) {
    return {
      exists: true,
      files: 0,
      directories: 0,
      bytes: 0
    };
  }

  const totals = {
    exists: true,
    files: 0,
    directories: 1,
    bytes: 0
  };

  async function walk(directoryPath) {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        totals.directories += 1;
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const entryStat = await statIfExists(entryPath);
      totals.files += 1;
      totals.bytes += entryStat ? entryStat.size : 0;
    }
  }

  await walk(targetPath);
  return totals;
}

async function clearVsCodeServerLogFilesInPlace(logsRoot) {
  const result = {
    truncatedFiles: 0,
    skippedSpecialFiles: 0,
    errors: []
  };

  async function walk(directoryPath) {
    let entries = [];
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (isMissingFileError(error)) {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        result.skippedSpecialFiles += 1;
        continue;
      }

      try {
        await fs.truncate(entryPath, 0);
        result.truncatedFiles += 1;
      } catch (error) {
        if (isMissingFileError(error)) {
          continue;
        }
        result.errors.push({
          path: entryPath,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  await walk(logsRoot);
  if (result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new Error(`Failed to truncate ${result.errors.length} VS Code log file(s); first error at ${firstError.path}: ${firstError.message}`);
  }

  return result;
}

function formatByteCount(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function parseLocalProcessTable(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/.exec(line);
      if (!match) {
        return null;
      }
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        stat: match[3],
        ageSeconds: Number(match[4]),
        command: match[5]
      };
    })
    .filter((entry) => entry && Number.isFinite(entry.pid) && Number.isFinite(entry.ppid));
}

async function readLocalProcessTable() {
  const { stdout } = await execFilePromise(
    "ps",
    ["-eo", "pid=,ppid=,stat=,etimes=,args="],
    STALE_CODEX_PROCESS_SCAN_TIMEOUT_MS
  );
  return parseLocalProcessTable(stdout);
}

function isOpenAiCodexAppServerCommand(command) {
  const text = String(command || "");
  return text.includes("/openai.chatgpt-") && text.includes("/codex app-server");
}

function isVsCodeExtensionHostCommand(command) {
  return String(command || "").includes("--type=extensionHost");
}

function isCodexMcpServerCommand(command) {
  const text = String(command || "");
  return text.includes("/mcp-servers/olla/server.js")
    || text.includes("/mcp-servers/capturelab/server.js")
    || text.includes("chrome_devtools_mcp_stdio_bridge.js");
}

function buildStaleCodexProcessCleanupPlan(processes, options = {}) {
  const currentPid = Number(options.currentPid || 0);
  const byPid = new Map();
  for (const processInfo of Array.isArray(processes) ? processes : []) {
    if (!processInfo || !Number.isFinite(Number(processInfo.pid))) {
      continue;
    }
    byPid.set(Number(processInfo.pid), {
      pid: Number(processInfo.pid),
      ppid: Number(processInfo.ppid || 0),
      stat: String(processInfo.stat || ""),
      ageSeconds: Number(processInfo.ageSeconds || 0),
      command: String(processInfo.command || processInfo.args || "")
    });
  }

  const childrenByParent = new Map();
  for (const processInfo of byPid.values()) {
    if (!childrenByParent.has(processInfo.ppid)) {
      childrenByParent.set(processInfo.ppid, []);
    }
    childrenByParent.get(processInfo.ppid).push(processInfo);
  }

  function descendantsOf(pid) {
    const directChildren = childrenByParent.get(Number(pid)) || [];
    const descendants = [];
    for (const child of directChildren) {
      descendants.push(child, ...descendantsOf(child.pid));
    }
    return descendants;
  }

  const candidates = [];
  const skipped = [];
  const candidatePids = new Set();

  for (const processInfo of byPid.values()) {
    if (!isOpenAiCodexAppServerCommand(processInfo.command)) {
      continue;
    }
    const descendants = descendantsOf(processInfo.pid);
    const unsafeChildren = descendants.filter((child) => !isCodexMcpServerCommand(child.command));
    if (processInfo.pid === currentPid) {
      skipped.push({ ...processInfo, kind: "openai-codex-app-server", reason: "current-extension-host-process" });
      continue;
    }
    if (unsafeChildren.length > 0) {
      skipped.push({
        ...processInfo,
        kind: "openai-codex-app-server",
        reason: "active-child-processes",
        childPids: unsafeChildren.map((child) => child.pid).slice(0, 8)
      });
      continue;
    }
    const parent = byPid.get(processInfo.ppid);
    if (parent && isVsCodeExtensionHostCommand(parent.command)) {
      skipped.push({ ...processInfo, kind: "openai-codex-app-server", reason: "parent-extension-host-alive" });
      continue;
    }
    if (parent && processInfo.ppid !== 1) {
      skipped.push({ ...processInfo, kind: "openai-codex-app-server", reason: "unexpected-parent-alive" });
      continue;
    }

    candidates.push({ ...processInfo, kind: "openai-codex-app-server" });
    candidatePids.add(processInfo.pid);
  }

  for (const processInfo of byPid.values()) {
    if (!isCodexMcpServerCommand(processInfo.command) || candidatePids.has(processInfo.ppid)) {
      continue;
    }
    const descendants = descendantsOf(processInfo.pid);
    if (descendants.length > 0) {
      skipped.push({
        ...processInfo,
        kind: "codex-mcp-server",
        reason: "active-child-processes",
        childPids: descendants.map((child) => child.pid).slice(0, 8)
      });
      continue;
    }
    const parent = byPid.get(processInfo.ppid);
    if (parent && isOpenAiCodexAppServerCommand(parent.command)) {
      skipped.push({ ...processInfo, kind: "codex-mcp-server", reason: "parent-app-server-alive" });
      continue;
    }
    if (parent && processInfo.ppid !== 1) {
      skipped.push({ ...processInfo, kind: "codex-mcp-server", reason: "unexpected-parent-alive" });
      continue;
    }

    candidates.push({ ...processInfo, kind: "codex-mcp-server" });
    candidatePids.add(processInfo.pid);
  }

  return {
    scannedCount: byPid.size,
    candidates,
    skipped
  };
}

function formatProcessSummary(processInfo) {
  return `${processInfo.pid} ${processInfo.kind || "process"} ${clipText(processInfo.command, 130)}`;
}

function isProcessAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateStaleCodexProcess(pid) {
  const targetPid = Number(pid);
  if (!Number.isFinite(targetPid) || targetPid <= 1) {
    return {
      pid: targetPid,
      status: "invalid-pid"
    };
  }
  if (!isProcessAlive(targetPid)) {
    return {
      pid: targetPid,
      status: "already-exited"
    };
  }

  try {
    process.kill(targetPid, "SIGTERM");
  } catch (error) {
    return {
      pid: targetPid,
      status: "term-failed",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  await delay(STALE_CODEX_PROCESS_TERM_GRACE_MS);
  if (!isProcessAlive(targetPid)) {
    return {
      pid: targetPid,
      status: "terminated"
    };
  }

  try {
    process.kill(targetPid, "SIGKILL");
  } catch (error) {
    return {
      pid: targetPid,
      status: "kill-failed",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  await delay(STALE_CODEX_PROCESS_KILL_GRACE_MS);
  return {
    pid: targetPid,
    status: isProcessAlive(targetPid) ? "still-running" : "killed"
  };
}

async function cleanupStaleCodexProcessesCommand(context, outputChannel) {
  const processes = await readLocalProcessTable();
  const plan = buildStaleCodexProcessCleanupPlan(processes, {
    currentPid: process.pid
  });
  const skippedActive = plan.skipped.filter((entry) =>
    entry.reason === "active-child-processes"
    || entry.reason === "parent-extension-host-alive"
    || entry.reason === "parent-app-server-alive"
  );

  await appendDebugLog(context, outputChannel, "cleanup-stale-codex-processes-scan", {
    scannedCount: plan.scannedCount,
    candidatePids: plan.candidates.map((entry) => entry.pid),
    skipped: plan.skipped.map((entry) => ({
      pid: entry.pid,
      kind: entry.kind,
      reason: entry.reason,
      childPids: entry.childPids || []
    }))
  });

  if (plan.candidates.length === 0) {
    outputChannel.show(true);
    appendOutputChannelLine(
      outputChannel,
      `Cleanup stale Codex processes: no safe stale targets. Skipped ${plan.skipped.length} active/protected process(es).`
    );
    void vscode.window.showInformationMessage(
      `Δεν βρήκα σίγουρα stale Codex processes για kill. Έκανα skip ${skippedActive.length} ενεργά/protected process(es). Δες το log για λεπτομέρειες.`
    );
    return;
  }

  const candidatePreview = plan.candidates.map(formatProcessSummary).slice(0, 8).join("\n");
  const confirm = await vscode.window.showWarningMessage(
    `Θα κάνω kill μόνο ${plan.candidates.length} σίγουρα stale/orphan Codex process(es). Θα κάνω skip ${skippedActive.length} ενεργά/protected process(es).\n\nTargets:\n${candidatePreview}\n\nΣυνέχεια;`,
    { modal: true },
    "Cleanup Stale"
  );
  if (confirm !== "Cleanup Stale") {
    await appendDebugLog(context, outputChannel, "cleanup-stale-codex-processes-cancelled", {
      candidatePids: plan.candidates.map((entry) => entry.pid),
      skippedCount: plan.skipped.length
    });
    return;
  }

  outputChannel.show(true);
  appendOutputChannelLine(outputChannel, `Cleanup stale Codex processes: killing ${plan.candidates.length} target(s)...`);
  const results = [];
  for (const candidate of plan.candidates) {
    const result = await terminateStaleCodexProcess(candidate.pid);
    results.push({
      ...result,
      kind: candidate.kind
    });
    appendOutputChannelLine(outputChannel, `Cleanup stale Codex process ${candidate.pid}: ${result.status}`);
  }

  await appendDebugLog(context, outputChannel, "cleanup-stale-codex-processes-complete", {
    results,
    skippedCount: plan.skipped.length
  });
  const killedCount = results.filter((entry) => ["terminated", "killed", "already-exited"].includes(entry.status)).length;
  void vscode.window.showInformationMessage(
    `Cleanup complete: ${killedCount}/${results.length} stale process(es) cleaned. Skipped ${plan.skipped.length} active/protected.`
  );
}

async function clearVsCodeServerLogsCommand(context, outputChannel) {
  const homeDir = os.homedir();
  const vscodeServerDir = path.join(homeDir, ".vscode-server");
  const logsRoot = path.join(vscodeServerDir, VSCODE_SERVER_LOGS_RELATIVE_PATH);
  if (!isSafeVsCodeServerLogsPath(logsRoot, vscodeServerDir)) {
    void vscode.window.showErrorMessage(`Refusing to clear unexpected VS Code logs path: ${logsRoot}`);
    return;
  }

  const beforeStats = await collectPathStats(logsRoot);
  if (!beforeStats.exists) {
    await appendDebugLog(context, outputChannel, "clear-vscode-logs-missing", {
      logsRoot
    });
    void vscode.window.showInformationMessage("Δεν υπάρχουν VS Code Server logs για καθάρισμα.");
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Θα καθαρίσω τα VS Code Server logs (${beforeStats.files} files, ${formatByteCount(beforeStats.bytes)}) με backup copy πρώτα και in-place truncate, χωρίς να μετακινήσω τον live logs φάκελο. Συνέχεια;`,
    { modal: true },
    "Clear VS Code Logs"
  );
  if (confirm !== "Clear VS Code Logs") {
    await appendDebugLog(context, outputChannel, "clear-vscode-logs-cancelled", {
      logsRoot,
      beforeStats
    });
    return;
  }

  outputChannel.show(true);
  appendOutputChannelLine(outputChannel, "Clear VS Code logs: starting...");
  const backupRoot = path.join(
    homeDir,
    "agent-workspace",
    "backups",
    `${createRestoreStamp()}-vscode-server-logs-clear`
  );
  await fs.mkdir(backupRoot, { recursive: true });
  await appendDebugLog(context, outputChannel, "clear-vscode-logs-start", {
    logsRoot,
    backupRoot,
    beforeStats
  });

  const copiedTo = await copyPathToBackup(logsRoot, backupRoot);
  const clearResult = await clearVsCodeServerLogFilesInPlace(logsRoot);
  const afterStats = await collectPathStats(logsRoot);
  await appendDebugLog(context, outputChannel, "clear-vscode-logs-complete", {
    logsRoot,
    backupRoot,
    copiedTo,
    clearResult,
    beforeStats,
    afterStats
  });

  const summary = `backed up ${beforeStats.files} files (${formatByteCount(beforeStats.bytes)}) and truncated ${clearResult.truncatedFiles} files in place`;
  appendOutputChannelLine(outputChannel, `Clear VS Code logs: complete (${summary}).`);
  appendOutputChannelLine(outputChannel, `VS Code logs backup: ${backupRoot}`);
  const choice = await vscode.window.showInformationMessage(
    `VS Code logs καθαρίστηκαν: ${summary}. Backup: ${backupRoot}`,
    { modal: true },
    "Reload Window",
    "Show Log"
  );
  if (choice === "Reload Window") {
    await reloadWindowCommand(context, outputChannel);
  } else if (choice === "Show Log") {
    outputChannel.show(true);
  }
}

async function restoreCleanVsCodeCodexInstallCommand(context, outputChannel) {
  const confirm = await vscode.window.showWarningMessage(
    "Θα επαναφέρω το VS Code Stable/Codex στην καθαρή κατάσταση: official OpenAI Codex + Codex Session Tools, καθαρά settings/storage/cache, με backup πρώτα. Συνέχεια;",
    { modal: true },
    "Επαναφορά"
  );
  if (confirm !== "Επαναφορά") {
    await appendDebugLog(context, outputChannel, "restore-clean-codex-install-cancelled");
    return;
  }

  outputChannel.show(true);
  appendOutputChannelLine(outputChannel, "Restore clean VS Code/Codex state: starting...");

  const homeDir = os.homedir();
  const vscodeServerDir = path.join(homeDir, ".vscode-server");
  const extensionsDir = path.join(vscodeServerDir, "extensions");
  const openAiExtensionDir = path.join(extensionsDir, CLEAN_STABLE_OPENAI_EXTENSION_REL);
  const customExtensionDir = path.join(extensionsDir, CLEAN_STABLE_CUSTOM_EXTENSION_REL);
  const backupRoot = path.join(
    homeDir,
    "agent-workspace",
    "backups",
    `${createRestoreStamp()}-vscode-codex-clean-restore-button`
  );

  await fs.mkdir(backupRoot, { recursive: true });
  await appendDebugLog(context, outputChannel, "restore-clean-codex-install-start", {
    backupRoot,
    vscodeServerDir,
    openAiExtensionDir,
    customExtensionDir
  });

  const openAiStat = await statIfExists(openAiExtensionDir);
  if (!openAiStat || !openAiStat.isDirectory()) {
    void vscode.window.showErrorMessage(`Δεν βρέθηκε το official Codex extension: ${openAiExtensionDir}`);
    await appendDebugLog(context, outputChannel, "restore-clean-codex-install-missing-openai", {
      openAiExtensionDir
    });
    return;
  }

  const movedExtensions = [];
  for (const extensionName of await listDirectoryNames(extensionsDir)) {
    if (!isCleanRestoreStaleExtensionName(extensionName)) {
      continue;
    }
    const movedTo = await movePathToBackup(path.join(extensionsDir, extensionName), backupRoot);
    if (movedTo) {
      movedExtensions.push(extensionName);
    }
  }

  const customEnsureResult = await ensureCustomExtensionFolder(context, customExtensionDir, backupRoot);
  if (!customEnsureResult.ensured) {
    void vscode.window.showErrorMessage(`Δεν μπόρεσα να βρω source για το custom extension: ${customExtensionDir}`);
    await appendDebugLog(context, outputChannel, "restore-clean-codex-install-missing-custom-source", {
      customExtensionDir,
      extensionPath: context && context.extensionPath ? context.extensionPath : null
    });
    return;
  }

  const openAiManifestResult = await restoreOpenAiCodexManifest(openAiExtensionDir, backupRoot);
  await writeJsonFile(
    path.join(extensionsDir, "extensions.json"),
    buildCleanStableExtensionProfileEntries(homeDir)
  );
  await fs.writeFile(path.join(extensionsDir, ".obsolete"), "{}\n", "utf8");

  const movedCaches = [];
  for (const relativePath of CLEAN_RESTORE_STALE_CACHE_RELATIVE_PATHS) {
    const movedTo = await movePathToBackup(path.join(vscodeServerDir, relativePath), backupRoot);
    if (movedTo) {
      movedCaches.push(relativePath);
    }
  }

  const settingsResults = [];
  for (const settingsPath of [
    path.join(vscodeServerDir, "data", "User", "settings.json"),
    path.join(vscodeServerDir, "data", "Machine", "settings.json"),
    path.join(homeDir, ".config", "Code", "User", "settings.json")
  ]) {
    const result = await cleanRestoreSettingsFile(settingsPath, backupRoot);
    settingsResults.push({
      path: settingsPath,
      ...result
    });
  }

  const movedGlobalStorage = await movePathToBackup(
    path.join(vscodeServerDir, "data", "User", "globalStorage", "oll4com.codex-session-tools"),
    backupRoot
  );
  const movedWorkspaceStorageCount = await moveCustomWorkspaceStorage(
    path.join(vscodeServerDir, "data", "User", "workspaceStorage"),
    backupRoot
  );

  await appendDebugLog(context, outputChannel, "restore-clean-codex-install-complete", {
    backupRoot,
    movedExtensions,
    movedCaches,
    settingsChangedCount: settingsResults.filter((entry) => entry.changed).length,
    movedGlobalStorage: Boolean(movedGlobalStorage),
    movedWorkspaceStorageCount,
    openAiManifestResult,
    customEnsureResult
  });

  const settingsChangedCount = settingsResults.filter((entry) => entry.changed).length;
  const visibleSummary = [
    movedExtensions.length > 0 ? `${movedExtensions.length} stale extension dirs moved` : "extension dirs already clean",
    movedCaches.length > 0 ? `${movedCaches.length} stale caches moved` : "caches already clean",
    settingsChangedCount > 0 ? `${settingsChangedCount} settings files cleaned` : "settings already clean",
    movedGlobalStorage ? "custom global storage reset" : "custom global storage already clean",
    movedWorkspaceStorageCount > 0 ? `${movedWorkspaceStorageCount} workspace storage dirs reset` : "workspace storage already clean",
    openAiManifestResult && openAiManifestResult.restored ? "OpenAI Codex manifest normalized" : "OpenAI Codex manifest unchanged",
    customEnsureResult && customEnsureResult.ensured ? "custom extension present" : "custom extension missing"
  ].join("; ");
  appendOutputChannelLine(outputChannel, `Restore clean VS Code/Codex state: complete (${visibleSummary}).`);
  appendOutputChannelLine(outputChannel, `Restore backup: ${backupRoot}`);

  const reloadChoice = await vscode.window.showInformationMessage(
    `Η επαναφορά ολοκληρώθηκε: ${visibleSummary}. Backup: ${backupRoot}`,
    { modal: true },
    "Reload Window",
    "Show Log"
  );
  if (reloadChoice === "Reload Window") {
    await reloadWindowCommand(context, outputChannel);
  } else if (reloadChoice === "Show Log") {
    outputChannel.show(true);
  }
}

async function openQuickActions(context, outputChannel, statusBarItem) {
  const selection = await vscode.window.showQuickPick(
    [
      {
        id: "restore-clean-codex-install",
        label: "Restore clean VS Code/Codex state",
        description: "Return Stable to the known-good OpenAI Codex + Codex Session Tools install."
      },
      {
        id: "clear-vscode-logs",
        label: "Clear VS Code logs",
        description: "Copy VS Code Server logs to a timestamped backup and truncate log files in place."
      },
      {
        id: "cleanup-stale-codex-processes",
        label: "Cleanup stale Codex processes",
        description: "Kill only orphaned Codex app-server/MCP processes; skip active windows and child jobs."
      },
      {
        id: "logout-best",
        label: "Logout to best account",
        description: "Reads account ranking from the configured usage host and runs codex logout."
      },
      {
        id: "show-current-next",
        label: "Show current/next account",
        description: "Preview current account and the next ranked target."
      },
      {
        id: "show-current-metrics",
        label: "Show current remaining metrics",
        description: "Display 5h Remaining and Weekly Remaining for the active account."
      },
      {
        id: "login-saved-account",
        label: "Login with saved account",
        description: "Pick one saved account snapshot and login directly with that account."
      },
      {
        id: "save-current-auth",
        label: "Save current auth snapshot",
        description: "Store the current ChatGPT login cache for future one-click account switching."
      },
      {
        id: "show-debug-log",
        label: "Show debug log",
        description: "Open provider-statusbar.log."
      },
      {
        id: "clear-task-history",
        label: "Clear task history",
        description: "Delete local Codex task history immediately from local Codex state files."
      },
      {
        id: "repair-codex-sqlite-state",
        label: "Repair Codex state",
        description: "Fix root-owned thread recorders, move bad SQLite WAL/SHM directories aside, and run health checks."
      },
      {
        id: "reload-window",
        label: "Reload window",
        description: "Reload VS Code window; this stops any active Codex run."
      },
      {
        id: "open-new-window",
        label: "Open new window",
        description: "Equivalent to Ctrl+Shift+N."
      },
      {
        id: "open-next-remote-session",
        label: "Open next remote session",
        description: "Open a new SSH window on the next codex-dev session (fallback: codex-dev7)."
      },
      {
        id: "open-lane",
        label: "Open lane 01..08",
        description: "Open a numbered coder room worktree from the shared lane manifest."
      },
      {
        id: "show-codex-lb-status",
        label: "Show Codex LB status",
        description: "Show active LB route, configured model, live usage, and cache state."
      },
      {
        id: "refresh-codex-lb-usage",
        label: "Refresh Codex LB usage",
        description: "Refresh live weekly remaining usage from the active Codex-LB endpoint."
      },
      {
        id: "refresh-codex-lb-models",
        label: "Refresh Codex LB models",
        description: "Refresh the cached model list from the active Codex-LB route."
      },
      {
        id: "select-codex-lb-route",
        label: "Select Codex LB route",
        description: "Switch the editor proxy between primary, fallback, or auto failover."
      },
      {
        id: "open-codex-lb-dashboard",
        label: "Open Codex LB dashboard",
        description: "Open the live Codex-LB dashboard in the browser."
      },
      {
        id: "switch-provider",
        label: "Switch provider",
        description: "Open the provider picker (OpenAI profile)."
      }
    ],
    {
      placeHolder: "Codex Provider quick actions"
    }
  );

  if (!selection) {
    return;
  }

  if (selection.id === "restore-clean-codex-install") {
    await restoreCleanVsCodeCodexInstallCommand(context, outputChannel);
    return;
  }
  if (selection.id === "clear-vscode-logs") {
    await clearVsCodeServerLogsCommand(context, outputChannel);
    return;
  }
  if (selection.id === "cleanup-stale-codex-processes") {
    await cleanupStaleCodexProcessesCommand(context, outputChannel);
    return;
  }
  if (selection.id === "logout-best") {
    await logoutToBestAccount(context, outputChannel);
    return;
  }
  if (selection.id === "show-current-next") {
    await showCurrentAndNextAccount(context, outputChannel);
    return;
  }
  if (selection.id === "show-current-metrics") {
    await showCurrentRemainingMetrics(context, outputChannel);
    return;
  }
  if (selection.id === "login-saved-account") {
    await loginWithSavedAccount(context, outputChannel);
    return;
  }
  if (selection.id === "save-current-auth") {
    await captureCurrentAuthSnapshot(context, outputChannel);
    return;
  }
  if (selection.id === "show-debug-log") {
    await vscode.commands.executeCommand("codexProviderStatusbar.showDebugLog");
    return;
  }
  if (selection.id === "clear-task-history") {
    await clearCodexTaskHistoryCommand(context, outputChannel);
    return;
  }
  if (selection.id === "repair-codex-sqlite-state") {
    await repairCodexSqliteStateCommand(context, outputChannel);
    return;
  }
  if (selection.id === "reload-window") {
    await reloadWindowCommand(context, outputChannel);
    return;
  }
  if (selection.id === "open-new-window") {
    await openNewWindowCommand(context, outputChannel);
    return;
  }
  if (selection.id === "open-next-remote-session") {
    await openNextRemoteSessionCommand(context, outputChannel);
    return;
  }
  if (selection.id === "open-lane") {
    await openLaneCommand(context, outputChannel);
    return;
  }
  if (selection.id === "show-codex-lb-status") {
    await showCodexLbStatusCommand(context, outputChannel);
    return;
  }
  if (selection.id === "refresh-codex-lb-usage") {
    await refreshCodexLbUsageCommand(context, outputChannel, { silent: false });
    return;
  }
  if (selection.id === "refresh-codex-lb-models") {
    await refreshCodexLbModelsCommand(context, outputChannel, { silent: false });
    return;
  }
  if (selection.id === "select-codex-lb-route") {
    await selectCodexLbRouteCommand(context, outputChannel, statusBarItem);
    return;
  }
  if (selection.id === "open-codex-lb-dashboard") {
    await openCodexLbDashboardCommand(context, outputChannel);
    return;
  }
  if (selection.id === "switch-provider") {
    await switchProvider(context, outputChannel, statusBarItem);
  }
}

function clipText(text, maxChars) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function extractMessageText(content) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      if (typeof item.text === "string") {
        return item.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function uniqKeepOrder(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item || "").trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function switchProvider(context, outputChannel, statusBarItem) {
  const { configText, info: current } = await getCurrentProviderInfo();
  await appendDebugLog(context, outputChannel, "switch-provider-start", {
    currentProviderId: current.providerId,
    currentProfile: current.profile,
    currentLabel: current.label
  });

  const selection = await vscode.window.showQuickPick(
    [
      {
        label: "OpenAI",
        description: "profile=openai",
        providerId: "openai"
      }
    ],
    {
      placeHolder: `Current provider: ${current.label}`
    }
  );

  if (!selection) {
    await appendDebugLog(context, outputChannel, "switch-provider-cancelled");
    return;
  }

  if (selection.providerId === current.providerId && current.providerId !== "custom") {
    await appendDebugLog(context, outputChannel, "switch-provider-noop", {
      providerId: selection.providerId
    });
    return;
  }

  const settings = getSettings();

  const nextText = buildUpdatedConfigText(configText, {
    providerId: selection.providerId,
    openaiModel: settings.openaiModel
  });

  await writeConfigText(DEFAULTS.configPath, nextText);
  const nextInfo = detectProviderInfo(nextText);
  await appendDebugLog(context, outputChannel, "switch-provider-config-written", {
    selectedProviderId: selection.providerId,
    nextProviderId: nextInfo.providerId,
    nextProfile: nextInfo.profile,
    nextLabel: nextInfo.label
  });
  await refreshStatusBar(context, outputChannel, statusBarItem);

  if (settings.autoOpenCodexSidebar) {
    await context.globalState.update(OPEN_SIDEBAR_AFTER_RESTART_KEY, true);
    await appendDebugLog(context, outputChannel, "switch-provider-post-restart-sidebar-armed");
  }

  void vscode.window.showInformationMessage(
    `Switching provider to ${selection.label}. Restarting only the extension host so Codex reloads the new profile.`
  );
  await appendDebugLog(context, outputChannel, "switch-provider-restart-extension-host", {
    selectedProviderId: selection.providerId,
    nextProfile: nextInfo.profile
  });
  await switchToExplorerBeforeWindowLifecycle(context, outputChannel, "switch-provider-restart-extension-host");
  await vscode.commands.executeCommand("workbench.action.restartExtensionHost");
}

function codexLbRouteShouldOwnProvider(settings) {
  const routeState = getCodexLbRouteState(settings);
  return ["headroom", "direct"].includes(String(routeState.routeMode || "").trim());
}

async function restoreCodexLbProviderForActiveRoute(context, outputChannel, statusBarItem, metricsStatusBarItem, reason) {
  if (pendingOpenAiDirectLogin || Date.now() < openAiDirectLoginAllowedUntilMs) {
    return false;
  }
  const settings = getSettings();
  if (!codexLbRouteShouldOwnProvider(settings)) {
    return false;
  }
  const providerInfo = await getCurrentProviderInfo();
  if (providerInfo.info.providerId !== "openai") {
    return false;
  }
  const nextText = buildUpdatedConfigText(providerInfo.configText, {
    providerId: "codex-lb"
  });
  const nextInfo = detectProviderInfo(nextText);
  if (nextText !== providerInfo.configText) {
    await writeConfigText(DEFAULTS.configPath, nextText);
  }
  await appendDebugLog(context, outputChannel, "codex-lb-provider-drift-restored", {
    reason,
    previousProviderId: providerInfo.info.providerId,
    nextProviderId: nextInfo.providerId,
    route: formatCodexLbRouteLine(settings)
  });
  await refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
  return true;
}

async function handleConfigFileChanged(context, outputChannel, statusBarItem, metricsStatusBarItem, eventName) {
  await appendDebugLog(context, outputChannel, eventName);
  const restored = await restoreCodexLbProviderForActiveRoute(
    context,
    outputChannel,
    statusBarItem,
    metricsStatusBarItem,
    eventName
  );
  if (!restored) {
    await refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
  }
}

function registerConfigWatchers(context, outputChannel, statusBarItem, metricsStatusBarItem) {
  const configWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(path.dirname(DEFAULTS.configPath), path.basename(DEFAULTS.configPath))
  );
  const authWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(path.dirname(CODEX_AUTH_FILE), path.basename(CODEX_AUTH_FILE))
  );
  context.subscriptions.push(
    configWatcher,
    authWatcher,
    configWatcher.onDidChange(() => {
      void handleConfigFileChanged(context, outputChannel, statusBarItem, metricsStatusBarItem, "config-file-changed");
    }),
    configWatcher.onDidCreate(() => {
      void handleConfigFileChanged(context, outputChannel, statusBarItem, metricsStatusBarItem, "config-file-created");
    }),
    configWatcher.onDidDelete(() => {
      void appendDebugLog(context, outputChannel, "config-file-deleted");
      void refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
    }),
    authWatcher.onDidChange(() => {
      void appendDebugLog(context, outputChannel, "auth-file-changed");
      void refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
      void maybeFinalizePendingOpenAiDirectLogin(context, outputChannel);
    }),
    authWatcher.onDidCreate(() => {
      void appendDebugLog(context, outputChannel, "auth-file-created");
      void refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
      void maybeFinalizePendingOpenAiDirectLogin(context, outputChannel);
    }),
    authWatcher.onDidDelete(() => {
      void appendDebugLog(context, outputChannel, "auth-file-deleted");
      void refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
    })
  );
}

async function activate(context) {
  const outputChannel = vscode.window.createOutputChannel("Codex Provider Status Bar");
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  const metricsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, -10000);
  lbUsageStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  statusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
  statusBarItem.command = "codexProviderStatusbar.openQuickActions";
  metricsStatusBarItem.command = "codexProviderStatusbar.showCurrentRemainingMetrics";
  lbUsageStatusBarItem.command = "codexProviderStatusbar.showCodexLbUsage";
  context.subscriptions.push(statusBarItem, metricsStatusBarItem, lbUsageStatusBarItem, outputChannel);
  updateCodexLbUsageStatusItem();

  context.subscriptions.push(
    vscode.commands.registerCommand("codexProviderStatusbar.openQuickActions", () =>
      openQuickActions(context, outputChannel, statusBarItem)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.restoreCleanCodexInstall", () =>
      restoreCleanVsCodeCodexInstallCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.clearVsCodeLogs", () =>
      clearVsCodeServerLogsCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.cleanupStaleCodexProcesses", () =>
      cleanupStaleCodexProcessesCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.pickProvider", () => switchProvider(context, outputChannel, statusBarItem)),
    vscode.commands.registerCommand("codexProviderStatusbar.logoutToBestAccount", () =>
      logoutToBestAccount(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.loginWithSavedAccount", () =>
      loginWithSavedAccount(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.saveCurrentAuthSnapshot", () =>
      captureCurrentAuthSnapshot(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.showCurrentAndNextAccount", () =>
      showCurrentAndNextAccount(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.showCurrentRemainingMetrics", () =>
      showCurrentRemainingMetrics(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.showDebugLog", async () => {
      outputChannel.show(true);
      await appendDebugLog(context, outputChannel, "show-debug-log-command", {
        logPath: getLogPath(context)
      });
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(getLogPath(context)));
    }),
    vscode.commands.registerCommand("codexProviderStatusbar.reloadWindow", () =>
      reloadWindowCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.sendContinuePrompt", () =>
      sendContinuePromptCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.openVoiceDraft", () =>
      openVoiceDraftCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.openScreenClipTool", () =>
      openScreenClipToolCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.captureScreenToChat", () =>
      captureScreenToChatCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.showCodexLbStatus", () =>
      showCodexLbStatusCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.showCodexLbUsage", () =>
      showCodexLbUsageCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.refreshCodexLbUsage", () =>
      refreshCodexLbUsageCommand(context, outputChannel, { silent: false })
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.refreshCodexLbModels", () =>
      refreshCodexLbModelsCommand(context, outputChannel, { silent: false })
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.selectCodexLbRoute", () =>
      selectCodexLbRouteCommand(context, outputChannel, statusBarItem)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.openCodexLbDashboard", () =>
      openCodexLbDashboardCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.lowReasoningAndSaveMemoryPrompt", () =>
      lowReasoningAndSaveMemoryPromptCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.openNewWindow", () =>
      openNewWindowCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.openNextRemoteSession", () =>
      openNextRemoteSessionCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.openLane", () =>
      openLaneCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.openCodexSidebar", async () => {
      const opened = await openCodexSidebarBestEffort(context, outputChannel);
      if (!opened) {
        void vscode.window.showWarningMessage("Δεν μπόρεσα να ανοίξω το Codex sidebar.");
      }
    }),
    vscode.commands.registerCommand("codexProviderStatusbar.clearTaskHistory", () =>
      clearCodexTaskHistoryCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.repairCodexSqliteState", () =>
      repairCodexSqliteStateCommand(context, outputChannel)
    ),
    vscode.commands.registerCommand("codexProviderStatusbar.newCodexThread", async () => {
      const opened = await openCodexSidebarBestEffort(context, outputChannel);
      if (!opened) {
        void vscode.window.showWarningMessage("Δεν μπόρεσα να ανοίξω το Codex sidebar για νέο thread.");
        return;
      }
      await vscode.commands.executeCommand("chatgpt.newChat");
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("codexProviderStatusbar")) {
        void appendDebugLog(context, outputChannel, "settings-changed", getSettings());
        void refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
        updateCodexLbUsageStatusItem();
      }
    })
  );

  await primeRemoteSessionWorkspaceState(context, outputChannel);
  const workspaceAlias = String(context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_KEY, "") || "").trim();
  const workspaceAliasStoredSource = normalizeRemoteSessionAliasSource(
    context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_SOURCE_KEY, "")
  );
  const workspaceAliasStrongStored = Boolean(context.workspaceState.get(REMOTE_SESSION_WORKSPACE_ALIAS_STRONG_KEY, false));
  const workspaceLaneId = String(context.workspaceState.get(REMOTE_SESSION_LANE_ID_KEY, "") || "").trim();
  const workspaceLaneExpectedPath = String(context.workspaceState.get(REMOTE_SESSION_LANE_EXPECTED_PATH_KEY, "") || "").trim();
  const workspaceLaneExpectedBranch = String(context.workspaceState.get(REMOTE_SESSION_LANE_EXPECTED_BRANCH_KEY, "") || "").trim();
  const workspaceAliasEffectiveSource = workspaceAlias
    ? (workspaceAliasStoredSource ? `workspace-state:${workspaceAliasStoredSource}` : "workspace-state")
    : "";
  void appendDebugLog(context, outputChannel, "activate", {
    configPath: DEFAULTS.configPath,
    logPath: getLogPath(context),
    workspaceStoragePath: context.storageUri ? context.storageUri.fsPath : null,
    workspaceAlias: workspaceAlias || null,
    workspaceAliasSource: workspaceAliasEffectiveSource || null,
    workspaceAliasStoredSource: workspaceAliasStoredSource || null,
    workspaceAliasStrong: Boolean(workspaceAlias && (workspaceAliasStrongStored || isStrongRemoteSessionAliasSource(workspaceAliasStoredSource))),
    laneId: workspaceLaneId || null,
    laneExpectedPath: workspaceLaneExpectedPath || null,
    laneExpectedBranch: workspaceLaneExpectedBranch || null
  });
  void maybeRunRemoteSessionBootstrapDiagnostics(context, outputChannel);
  void heartbeatRemoteSessionAlias(context, outputChannel, "activate");
  registerConfigWatchers(context, outputChannel, statusBarItem, metricsStatusBarItem);
  void refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
  void refreshCodexLbUsageCommand(context, outputChannel, { silent: true });
  void refreshCodexLbModelsCommand(context, outputChannel, { silent: true });
  const refreshTimer = setInterval(() => {
    void refreshStatusBar(context, outputChannel, statusBarItem, metricsStatusBarItem);
  }, STATUSBAR_REFRESH_INTERVAL_MS);
  context.subscriptions.push({
    dispose: () => clearInterval(refreshTimer)
  });
  lbUsageRefreshTimer = setInterval(() => {
    void refreshCodexLbUsageCommand(context, outputChannel, { silent: true });
  }, CODEX_LB_USAGE_REFRESH_INTERVAL_MS);
  context.subscriptions.push({
    dispose: () => {
      if (lbUsageRefreshTimer) {
        clearInterval(lbUsageRefreshTimer);
        lbUsageRefreshTimer = null;
      }
    }
  });
  const remoteSessionHeartbeatTimer = setInterval(() => {
    void heartbeatRemoteSessionAlias(context, outputChannel, "heartbeat");
  }, REMOTE_SESSION_HEARTBEAT_INTERVAL_MS);
  context.subscriptions.push({
    dispose: () => clearInterval(remoteSessionHeartbeatTimer)
  });
  context.subscriptions.push({
    dispose: () => {
      void removeRemoteSessionPresence(context, outputChannel, "dispose");
    }
  });
  void appendDebugLog(context, outputChannel, "statusbar-refresh-timer-started", {
    everyMs: STATUSBAR_REFRESH_INTERVAL_MS
  });
  void appendDebugLog(context, outputChannel, "remote-session-heartbeat-timer-started", {
    everyMs: REMOTE_SESSION_HEARTBEAT_INTERVAL_MS,
    liveTimeoutMs: REMOTE_SESSION_LIVE_TIMEOUT_MS,
    pendingTimeoutMs: REMOTE_SESSION_PENDING_TIMEOUT_MS
  });
  void (async () => {
    await Promise.allSettled([
      maybeOpenSidebarAfterRestart(context, outputChannel),
      maybeCloseAuxiliaryBarOnActivate(context, outputChannel)
    ]);
  })();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  __test: {
    buildProviderAwareLbUsageStatusState,
    buildStaleCodexProcessCleanupPlan,
    buildCleanStableExtensionProfileEntries,
    clearVsCodeServerLogFilesInPlace,
    cleanRestoreSensitiveSettings,
    getCodexLbActiveAccountsRemainingPercent,
    getCodexLbAllAccountsRemainingPercent,
    normalizeOpenAiCodexManifest
  }
};
