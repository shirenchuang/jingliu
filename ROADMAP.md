# Jingliu roadmap

Jingliu is intended to become a multi-platform feed filter, not an X-only extension. This roadmap describes product direction and does not promise delivery dates.

## 0.5 — X beta

- X / Twitter feed adapter
- Local rules and reversible filtering
- TypeSafe, OpenRouter, and custom Jev providers
- Control console, browser tests, website, and public release

## Next — Distribution and internationalization

- Submit to Chrome Web Store
- Add English extension UI and localized store listings
- Validate Microsoft Edge compatibility
- Define a stable platform-adapter interface
- Add configuration import and export

## Multi-platform expansion

- Reddit feed and promoted-post adapter
- YouTube home, search, and comments adapters
- LinkedIn home-feed and sponsored-content adapter
- Community documentation for third-party adapters

## Longer term

- Explore a configurable generic-feed extractor
- Optional cross-device sync without weakening local-first defaults
- Better request batching, cost controls, and local-model support
- Evaluate Firefox support and Firefox Add-ons distribution

## Adapter contract

Each platform adapter should own only platform-specific behavior:

1. Discover visible feed items.
2. Extract stable IDs, public text, author identity, and platform labels.
3. Collapse, restore, and repair recycled DOM nodes.
4. Pass normalized items to the shared local/Jev decision engine.

This keeps user rules, provider integrations, decision caching, and privacy boundaries reusable across platforms.
