# Changelog

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
