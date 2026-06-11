# Publishing

This repository is now structured so one extension can cover both Codex and Kilo without patching either upstream bundle.

## Before public release

1. Choose a real publisher namespace.
2. The current manifest already uses the namespace `oll4com`.
3. Choose a final public license and replace `"UNLICENSED"`.
4. Verify all default URLs, SSH aliases, and helper paths match what you want to ship.

## VS Code Marketplace

1. Install tooling:

```bash
npm install -g @vscode/vsce
```

2. Login once:

```bash
vsce login <publisher>
```

3. Package:

```bash
vsce package
```

4. Publish:

```bash
vsce publish
```

Official docs:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## Open VSX

1. Install tooling:

```bash
npm install -g ovsx
```

2. Publish:

```bash
ovsx publish *.vsix -p <openvsx_token>
```

Official docs:

- https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions

## Notes

- Keep the extension external to Codex/Kilo for upgrade safety.
- Prefer settings over hardcoded personal paths for anything new.
- If you want a public store release under a cleaner id later, create a new extension name before first public publish. Changing name after adoption is a breaking migration.
