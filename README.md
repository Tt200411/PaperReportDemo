# PaperReportDemo

This repository contains the current local source snapshot for the desktop MVP and its two Claude skills.

## Layout

- `ai-study-assistant-mvp/`: Electron desktop app source
- `skills/essay-craft/`: essay writing skill source
- `skills/report-ta-orchestrator/`: report writing skill source

## Excluded

- `火种/` is intentionally excluded from this repository
- Generated folders such as `node_modules/`, `out/`, and `dist/` are not committed

## Release

Pushing a tag named `release-*` triggers a macOS GitHub Actions build that packages the Electron app and uploads the zip file to GitHub Releases.
