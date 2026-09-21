# Chrome Web Store listing — Jingliu

## Core listing

- Product name: `Jingliu — AI Feed Filter`
- Category: `Productivity`
- Default language: `English`
- Homepage: `https://jingliu.srcsxx.workers.dev/en`
- Privacy policy: `https://jingliu.srcsxx.workers.dev/privacy-en`
- Support: `https://github.com/shirenchuang/jingliu/issues`
- Distribution: `Public`, all regions, no in-app purchases

### English summary

Filter X feeds with local rules and your Jev provider. Collapse ads, low-signal posts, and unwanted topics.

### English description

Jingliu is a local-first AI feed filter that helps you quiet noisy timelines without giving up control.

What it does:

- Automatically filters newly loaded X / Twitter posts as you scroll.
- Applies ad labels, keywords, author lists, and allowlists locally first.
- Sends only uncertain public post text to the Jev provider you configure.
- Supports TypeSafe Jev, OpenRouter Jev, and compatible custom endpoints.
- Collapses filtered posts into compact, reversible placeholders.
- Lets you define filtering and keep preferences in natural language.
- Exports and imports portable rule backups without API keys or history.

Privacy by design:

- No Jingliu account, telemetry, analytics SDK, or developer-operated proxy.
- Rules, API keys, settings, counters, and corrections stay in Chrome local storage.
- API requests go directly from your browser to your selected provider.
- The website is static and never receives feed content or API keys.

Platform support:

Jingliu currently supports X / Twitter. The project uses a platform-adapter architecture so additional feeds can be added in future releases. Only X / Twitter is included in this version.

Jingliu is open source under the MIT License.

### 中文简述

用本地规则和你自己的 Jev 过滤 X 信息流，收起广告、低价值内容和不想看的主题。

### 中文详细说明

静流是一款本地优先的 AI 信息流过滤器，让你在不失去控制权的前提下收起时间线噪声。

- 滚动时自动处理新加载的 X / Twitter 内容。
- 广告标签、关键词、作者黑白名单优先在本地判断。
- 只有本地规则拿不准的公开内容才会发送给你配置的 Jev。
- 支持 TypeSafe Jev、OpenRouter Jev 与兼容的自定义接口。
- 默认将内容收成一行，可随时恢复查看。
- 支持自然语言偏好与不含密钥、历史记录的规则备份。
- 不需要静流账号，不含遥测、分析 SDK 或静流中转服务器。

当前版本只支持 X / Twitter；未来平台会通过适配器逐步加入。

## Single purpose

Jingliu filters the visible X / Twitter web feed according to user-defined rules, collapsing unwanted public posts while keeping every decision reversible.

## Permission justifications

### `storage`

Stores user settings, filter rules, provider selection, API key, aggregate counters, and correction categories in Chrome extension local storage. Jingliu has no developer-operated account or sync service.

### `https://x.com/*` and `https://twitter.com/*`

Reads only public feed cards already loaded in the current X / Twitter page so it can apply local rules, request a semantic decision when needed, and collapse or restore matching cards.

### `https://api.typesafe.ai/*`

Sends uncertain public post text directly to TypeSafe Jev only after the user configures a TypeSafe API key. Requests are necessary to provide semantic filtering.

### `https://openrouter.ai/*`

Sends uncertain public post text directly to OpenRouter's Jev Decisions API only after the user selects OpenRouter and configures an API key.

### Optional `https://*/*`, `http://localhost/*`, and `http://127.0.0.1/*`

Allows an advanced user to connect a compatible custom Jev endpoint. Jingliu requests access only for the exact configured origin when the user saves that custom endpoint; access is not requested for unrelated sites.

## User data disclosure

- Website content: Yes. Public post text, author identifier, and visible platform labels are read to provide filtering. Clear local matches remain on-device; only uncertain public content is sent to the user-selected Jev provider.
- Authentication information: Yes. A user-supplied provider API key is stored locally and sent only to that provider as request authentication.
- Browsing history: No. Jingliu does not collect a browsing history or inspect unopened pages.
- Personal communications: No. Jingliu does not read direct messages, email, chat, or form input.
- Data sale, advertising, credit, or unrelated transfer: No.
- Human review: No, except when required by law, necessary for security, or explicitly requested by the user for support.

Limited Use disclosure: `https://jingliu.srcsxx.workers.dev/privacy-en`

## Reviewer test instructions

1. Install the extension and open `https://x.com/home` with the reviewer's own X account.
2. Open the Jingliu popup. Automatic filtering is enabled by default.
3. Open Settings and choose “Ads only” or add a hard-block term that appears in the current feed, then click “Save settings”.
4. Return to X and scroll. Matching feed cards become compact placeholders. Click “Show” on a placeholder to verify that the decision is reversible.
5. Semantic filtering is optional and requires a reviewer-owned TypeSafe or OpenRouter API key. All local rule, ad-label, author-list, restore, and backup features work without a key.

The extension does not require a Jingliu account and no publisher credentials are needed.

## Asset inventory

- `assets/icon-128.png` — 128 × 128 store icon
- `assets/screenshot-1-overview.png` — 1280 × 800
- `assets/screenshot-2-rules.png` — 1280 × 800
- `assets/screenshot-3-jev.png` — 1280 × 800
- `assets/small-promo-440x280.png` — required small promo tile
- `assets/marquee-1400x560.png` — optional marquee promo tile

