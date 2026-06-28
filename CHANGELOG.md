# Changelog

## 0.2.8 - 2026-06-28

- Fixed `Clear VS Code Logs` so it no longer moves the live `.vscode-server/data/logs` directory while VS Code is running.
- The logs cleanup command now copies logs to a timestamped backup first, then truncates regular log files in place and preserves the directory tree/open file handles.
- Kept the Auxiliary Bar open during Codex sidebar auto-open to avoid racing the official OpenAI Codex webview startup.
- Added `Cleanup Stale Codex Processes`, a conservative process cleanup action that only targets orphaned Codex app-server/MCP processes and skips active VS Code windows or app-servers with live child jobs.
- Updated the clean restore baseline to `oll4com.codex-session-tools@0.2.8`.

## 0.2.7 - 2026-06-28

- Added `Clear VS Code Logs` as a Codex view title icon, command palette action, and Quick Actions item.
- The logs cleanup command moves `.vscode-server/data/logs` to a timestamped backup under `agent-workspace/backups` and recreates an empty logs directory after confirmation.
- Updated the clean restore baseline to `oll4com.codex-session-tools@0.2.7`.

## 0.2.6 - 2026-06-28

- Made the clean restore command visibly report progress in the Codex Session Tools output channel.
- Changed the clean restore completion notification to a modal summary with `Reload Window` and `Show Log` actions, so a successful no-op clean state does not look like nothing happened.
- Updated the clean restore baseline to `oll4com.codex-session-tools@0.2.6`.

## 0.2.5 - 2026-06-28

- Bumped the extension version so VS Code refreshes command/menu contributions after the clean-restore button install.
- Put `Restore Clean VS Code/Codex State` first in the Codex view title menu.
- Kept `Repair Codex State` available from Quick Actions and the command palette, but removed it from the top Codex view overflow menu because it is an emergency state repair rather than a normal workflow action.

## 0.2.4 - 2026-06-27

- Defaulted Codex sidebar auto-open to on for the remote VS Code workflow.
- Fixed the blank-window fallback so empty remote windows actually reopen the Codex sidebar instead of staying on Explorer.
- Added startup layout settling that hides other workbench surfaces and closes clean editor tabs before focusing Codex, while preserving dirty editors.

## 0.2.3 - 2026-06-17

- Added the Codex-LB VS Code route selector helper script to source control and packaged files.
- Fixed Codex-LB route restore from direct OpenAI mode so it returns to Codex-LB without restarting the extension host.
- Made the Codex-LB usage badge provider-aware so direct OpenAI mode shows a plain `openai` state instead of stale LB quota data.
- Changed new SSH remote-session windows to open `/etc` by default instead of the remote home directory.

## 0.2.2 - 2026-06-17

- Added a `Clear task history` action that removes local Codex task history data and reloads the window for a clean sidebar refresh.
- Expanded local history cleanup to remove Codex session index entries, rollout files, shell snapshots, and matching VS Code thread rows instead of clearing only the database rows.
- Fixed remote SSH window opening so root-only targets fall back to the current project path and avoid triggering Codex's missing-project state.
- Prevented duplicate post-restart Codex sidebar open attempts and removed noisy reload success logging after the extension host is already shutting down.
- Disabled remote-session presence sync by default so installs without a dedicated presence host do not spam `codex-usage-host` SSH warnings on startup.

## 0.2.1 - 2026-06-16

- Added clearer Codex LB route labels for headroom, direct primary, auto failover, and strict `.234` direct selection.
- Added a direct `OpenAI / ChatGPT Plus-Pro` sign-in action from the route picker to switch provider and launch `codex login`.
- Added VS Code task-history provider normalization helpers so provider switches can move user threads between `openai` and `codex-lb` buckets.
- Updated provider detection to support top-level `model_provider` config without relying on a `profile` entry.

## 0.2.0 - 2026-06-14

- Reframed the repository as the canonical public home for Codex Session Tools.
- Replaced internal Codex-LB IP defaults with local, public-safe example defaults.
- Moved account rotation and remote-session presence sync to configurable host/path settings.
- Added an overview graphic and rewrote the README for clearer public positioning.
- Switched the package metadata from `UNLICENSED` to MIT and documented the public release flow.
