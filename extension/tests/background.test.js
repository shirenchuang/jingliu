const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../core.js");

const source = fs.readFileSync(path.resolve(__dirname, "../background.js"), "utf8");

test("background worker calls OpenRouter and stores privacy-safe history", async () => {
  const settings = {
    provider: "openrouter",
    apiEndpoint: "https://openrouter.ai/api/alpha/decisions",
    apiKey: "test-key",
    model: "~typesafe/jev-latest",
    profile: "过滤广告",
    keepRules: "保留技术分析",
    filterAds: true,
    displayMode: "collapse",
    confidenceThreshold: 0.76,
    maxTextLength: 1400,
    decisionPrompt: "保守判断",
    autoMode: true,
    autoModeTouched: false,
    settingsVersion: 4
  };
  const storage = { ...settings };
  const requests = [];
  let messageListener;
  let installListener;
  const context = {
    importScripts: () => {},
    JingliuShared: { DEFAULT_SETTINGS: settings, loadSettings: async () => ({ ...settings }) },
    JingliuCore: core,
    chrome: {
      runtime: {
        onInstalled: { addListener: (listener) => { installListener = listener; } },
        onMessage: { addListener: (listener) => { messageListener = listener; } }
      },
      storage: { local: {
        get: async (defaults) => ({ ...(defaults || {}), ...storage }),
        set: async (values) => Object.assign(storage, values)
      } },
      permissions: { contains: async () => true }
    },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, headers: options.headers, body });
      const answers = {};
      Object.keys(body.questions).forEach((id) => {
        if (id.startsWith("action_")) answers[id] = { choice: "hide", probabilities: { hide: 0.9 } };
        else if (id.startsWith("reason_")) answers[id] = { choice: "commercial", probabilities: { commercial: 0.92 } };
        else if (id.startsWith("commercial_")) answers[id] = { noul: 0.94 };
        else answers[id] = { noul: 0.99 };
      });
      return { ok: true, status: 200, text: async () => JSON.stringify({ model: "jev-1.13.0", answers }) };
    },
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    console
  };

  vm.runInNewContext(source, context, { filename: "background.js" });
  const classified = await dispatch(messageListener, {
    type: "CLASSIFY_ITEMS",
    items: [{ id: "1", author: "@seller", text: "邀请码推广", labels: [] }]
  });
  assert.equal(classified.ok, true);
  assert.equal(classified.decisions[0].action, "collapse");
  assert.equal(requests[0].headers["X-OpenRouter-Title"], "Jingliu");

  await dispatch(messageListener, { type: "RECORD_SESSION", entry: { found: 5, filtered: 2, kept: 3 } });
  assert.equal(storage.filterHistory.length, 1);
  assert.equal("text" in storage.filterHistory[0], false);

  storage.autoMode = false;
  storage.autoModeTouched = false;
  await installListener({ reason: "update" });
  assert.equal(storage.autoMode, true);
});

function dispatch(listener, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`消息 ${message.type} 未响应`)), 2_000);
    const sendResponse = (response) => {
      clearTimeout(timeout);
      resolve(response);
    };
    const keepChannel = listener(message, {}, sendResponse);
    if (!keepChannel) {
      clearTimeout(timeout);
      resolve(undefined);
    }
  });
}
