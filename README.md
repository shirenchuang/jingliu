# Jingliu (静流) — AI Feed Filter

> Quiet the feed. Keep the signal.

English · [简体中文](README.zh-CN.md)

Jingliu is a local-first, user-controlled AI feed filter. It applies ad labels, keywords, author rules, and allowlists directly in your browser. Only uncertain public feed items are sent to the Jev provider you choose: TypeSafe, OpenRouter, or a compatible custom endpoint.

**X / Twitter is the first working adapter, not the product boundary.** The filtering engine is separated from platform-specific DOM adapters so Jingliu can grow into a multi-platform feed layer.

[![CI](https://github.com/shirenchuang/jingliu/actions/workflows/ci.yml/badge.svg)](https://github.com/shirenchuang/jingliu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-101820.svg)](LICENSE)
[![Download](https://img.shields.io/badge/Download-v0.6.0-315CFF.svg)](https://github.com/shirenchuang/jingliu/releases/latest)

Website: [Chinese](https://jingliu.srcsxx.workers.dev/) · [English](https://jingliu.srcsxx.workers.dev/en)

![Jingliu control console](website/assets/control-console.png)

## Why Jingliu

Most feed algorithms decide what deserves your attention. Jingliu gives that decision back to you: you choose the rules, model provider, API key, and filtering strength. Content is collapsed by default instead of deleted, so every decision stays reversible.

## Install

| Channel | Status | Notes |
| --- | --- | --- |
| [GitHub Releases](https://github.com/shirenchuang/jingliu/releases/latest) | ✅ Available | Download the beta ZIP and load it in developer mode |
| Chrome Web Store | 🚧 Preparing | One-click installation and automatic updates after publication |
| Microsoft Edge Add-ons | 🧭 Planned | After cross-browser validation |
| Firefox Add-ons | 🧭 Planned | Requires WebExtension compatibility work |

### Install the current beta

1. Download the latest ZIP from [GitHub Releases](https://github.com/shirenchuang/jingliu/releases/latest) and extract it.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open or refresh `https://x.com/home`.

## Platform roadmap

| Platform | Status | Scope |
| --- | --- | --- |
| X / Twitter web | ✅ Beta | Feed filtering, continuous scrolling, virtual-list recovery |
| Reddit | 🧭 Planned | Communities, posts, and promoted content |
| YouTube | 🧭 Planned | Home recommendations, search results, and comments |
| LinkedIn | 🧭 Planned | Home feed and sponsored content |
| Generic web feeds | 🔬 Exploring | Configurable extractors and a community adapter SDK |

Roadmap items describe direction, not delivery dates. See [ROADMAP.md](ROADMAP.md) for the proposed sequence.

## Features available today

- Automatic filtering for newly loaded X / Twitter posts
- Local ad-label, keyword, author blocklist, and allowlist rules
- Balanced, research, aggressive, and ads-only presets
- TypeSafe Jev, OpenRouter Jev, and custom SystemOne-compatible endpoints
- Bring your own API key, stored in `chrome.storage.local`
- Confidence safeguards, per-item restore, restore-all, and rescan
- Import and export filter rules without API keys, history, or post content
- No Jingliu account, telemetry SDK, or proxy server

## How it works

```text
Platform feed
    │
    ▼
Local browser rules ── clear decision ──▶ keep / collapse
    │
    └── uncertain ──▶ your Jev provider ──▶ keep / collapse / hide
```

The website only serves documentation and downloads. Extension requests go directly from the user's browser to the provider selected by that user.

## Repository layout

```text
extension/            Chrome Manifest V3 extension and tests
website/              Static product website
scripts/              Release packaging
.github/workflows/    CI and website deployment
```

## Development

```bash
cd extension
npm install
npm run check
npm test
npm run test:e2e
```

The extension has no build step. From the repository root, create a release ZIP with:

```bash
npm run package
```

## Privacy and security

Read [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md). Never include real API keys, cookies, private messages, or personal feed data in issues, logs, or screenshots.

## Contributing

Platform adapters, bug fixes, documentation, and product improvements are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Shizhen and Jingliu contributors.
