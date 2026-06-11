# Codex Session Tools

Publisher namespace: `oll4com`
Brand: `OLL4.com`

Single custom VS Code extension for:

- provider switching via `~/.codex/config.toml`
- account rotation and saved auth snapshots
- remote Codex/Kilo session helpers
- Codex LB status, route selection, usage, and model-cache refresh
- toolbar icons on public Codex and Kilo views

The extension does not patch the official Codex or Kilo bundles. It binds only through public VS Code contribution points such as `view/title`, `editor/title`, commands, status bar items, and user settings.

## Supported surfaces

- Codex sidebar views: `chatgpt.sidebarView`, `chatgpt.sidebarSecondaryView`
- Kilo sidebar view: `kilo-code.SidebarProvider`
- Kilo tab panel: `kilo-code.new.TabPanel`

## Main features

- `Quick Actions` menu for the operational workflows
- `Reload`, `Screenshot`, `Next Remote Session`, and `Select Codex LB Route` icons in Codex/Kilo
- account rotation from saved snapshots
- `συνεχισε` and memory-oriented helper prompts
- right-side Codex LB usage status item

## Important defaults

- Codex account rotation still assumes your own cache source and SSH alias defaults unless reconfigured in settings.
- Codex LB helper commands depend on local helper files and `CODEX_LB_API_KEY`.
- The manifest is prepared for packaging, but public release still requires choosing a final license and publisher namespace.

## Packaging

See `PUBLISHING.md` for Marketplace/Open VSX steps.
