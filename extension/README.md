# 静流 Jingliu — Jev 信息流过滤器

静流是一个无需构建、可以直接加载到 Chrome 的 Manifest V3 扩展。当前支持 X / Twitter：先用本地规则过滤平台广告、关键词和作者，再把剩余公开推文批量交给用户自己的 Jev 做语义判断。Jev 可以直连 TypeSafe，也可以通过 OpenRouter 原生 Decisions API 调用。

过滤结果默认只折叠、不删除，单条可展开，整页也可恢复。

## MVP 已实现

- 自动模式默认开启：刷新页面和滚动时处理新出现的推文
- 适配 X 虚拟列表：持续滚动、DOM 复用或节点重建后会恢复已有判断
- 弹窗内可一键重扫、恢复本页并切换四种过滤模式
- 过滤控制台：首页状态总览、固定目录、分区设置和常驻保存栏
- 自然语言过滤偏好与优先保留主题
- 本地广告标签、硬过滤词、作者黑白名单
- 用户自带 TypeSafe API Key、模型名和 Jev 决策指令
- 支持 OpenRouter API Key，默认使用 `~typesafe/jev-latest`
- 自定义 SystemOne 兼容端点，并按域名单独请求权限
- 均衡、研究、强力降噪、只去广告四种规则预设
- Jev 批量判断：`keep` / `collapse` / `hide`、原因类别、商业概率
- 低置信度保护、单条恢复和按当前规则重新扫描
- 误判反馈与本地过滤记录，不保存推文原文、作者或链接
- 不配置 API Key 时，本地规则仍可独立运行

## 安装

1. 在 Chrome 打开 `chrome://extensions`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `extension`。
5. 打开 `https://x.com/home` 或刷新已经打开的 X 页面，静流会默认自动过滤。
6. 点击工具栏里的静流图标，可以直接切换过滤模式、重扫页面或恢复内容。
7. 如需语义过滤，点击弹窗中明确的“配置 Jev”，选择 TypeSafe 或 OpenRouter，填写 API Key，再测试连接并保存。本地广告与关键词过滤无需 API Key。

从旧版本升级时，请在 `chrome://extensions` 中点击静流卡片上的“重新加载”，并刷新所有已经打开的 X 标签页，让新的内容脚本替换旧版。0.4.0 起默认开启自动过滤；如果之后由用户手动关闭，升级时会保留该选择。0.4.1 修复了持续滚动与折叠状态问题，0.5.0 重做了设置控制台的信息结构。

TypeSafe 官方资料：[快速开始](https://docs.typesafe.ai/introduction/quickstart) · [API 参考](https://docs.typesafe.ai/api) · [模型](https://docs.typesafe.ai/models)

## 自定义 Jev

默认调用：

```text
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
```

自定义端点需要兼容 SystemOne 的请求和响应结构。接口必须使用 HTTPS；本机调试允许 `http://localhost` 和 `http://127.0.0.1`。扩展只会为实际填写的自定义域名申请可选权限。

OpenRouter 模式调用：

```text
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer <OPENROUTER_API_KEY>
model: ~typesafe/jev-latest
```

OpenRouter 的 Jev 模式仍使用原生 typed questions 和概率答案，不是用聊天模型模拟分类。

## 结构

```text
manifest.json       Chrome Manifest V3
background.js       Jev 请求、超时、权限与错误处理
core.js             可测试的本地规则和 Jev 请求/响应转换
content/x.js        X DOM 适配器、过滤与恢复
content/x.css       轻量收起条样式
popup.*             自动状态、主操作与快速设置
options.*           过滤控制台、规则与 Jev 设置
tests/core.test.js  核心逻辑测试
```

## 验证

```bash
npm test
npm run check
npm install
npm run test:e2e
```

当前验证覆盖 7 项核心/后台测试和 3 项浏览器端到端测试，包括刷新后自动运行、持续 DOM 变化、虚拟列表节点重建、判断缓存、X 内容区完整替换和收起条尺寸。端到端测试会使用本机 Chrome/Chromium 的隔离上下文；也可以通过 `CHROME_PATH` 指定浏览器。

## MVP 边界

- 只支持 X / Twitter 网页版；不读取私信或未加载内容。
- X 调整 DOM 结构后，`content/x.js` 的平台适配器可能需要更新。
- 当前 API Key 存在本地扩展存储，适合个人 BYOK 验证，不等于面向大规模用户的密钥托管方案。
- 没有云端账号、跨设备同步、团队规则市场和服务器侧计费。
- 当前只判断文字与平台标签，不理解图片或视频本身。

后续要支持 Reddit、YouTube、LinkedIn 等平台时，复用 `core.js` 和 UI，只为每个平台新增内容提取与折叠适配器即可。

隐私边界详见 [PRIVACY.md](./PRIVACY.md)。
