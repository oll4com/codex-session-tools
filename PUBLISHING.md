# Publishing

Codex Session Tools is prepared as a public-source repository and can be packaged without exposing internal infrastructure defaults.

## Public Release Checklist

1. Review the version in `package.json`.
2. Confirm the README, changelog, and screenshots reflect the current feature set.
3. Verify your local settings override any example helper paths or local endpoints you do not want to ship as defaults.
4. Package from a clean working tree.

## VS Code Marketplace

Install tooling:

```bash
npm install -g @vscode/vsce
```

Login once:

```bash
vsce login <publisher>
```

Package locally:

```bash
vsce package
```

Publish:

```bash
vsce publish
```

Official docs:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## Open VSX

Install tooling:

```bash
npm install -g ovsx
```

Publish:

```bash
ovsx publish *.vsix -p <openvsx_token>
```

Official docs:

- https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions

## Notes

- Keep the extension external to Codex and Kilo for upgrade safety.
- Prefer documented settings over hardcoded machine-specific paths.
- If you later want a marketplace-specific identity, create it before public adoption to avoid a breaking rename.
