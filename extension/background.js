importScripts("shared.js", "core.js");

const { loadSettings } = JingliuShared;
const { buildJevRequest, parseJevResponse, validateEndpoint } = JingliuCore;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const current = await chrome.storage.local.get(null);
  if (reason === "install" && !Object.keys(current).length) {
    await chrome.storage.local.set({ ...JingliuShared.DEFAULT_SETTINGS });
    return;
  }
  if (reason === "update") {
    const migration = { settingsVersion: JingliuShared.DEFAULT_SETTINGS.settingsVersion };
    if (!current.autoModeTouched) migration.autoMode = true;
    await chrome.storage.local.set(migration);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CLASSIFY_ITEMS") {
    classifyItems(message.items || [])
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  }

  if (message?.type === "TEST_CONNECTION") {
    testConnection(message.config || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  }

  if (message?.type === "RECORD_SESSION") {
    appendRecord("filterHistory", message.entry || {}, 30)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  }

  if (message?.type === "RECORD_FEEDBACK") {
    appendRecord("filterFeedback", message.entry || {}, 100)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  }

  return false;
});

async function classifyItems(items) {
  if (!items.length) return { decisions: [], usage: null };
  const settings = await loadSettings();
  assertConfigured(settings);
  await assertEndpointPermission(settings.apiEndpoint);

  const request = buildJevRequest(items, settings);
  const payload = await callJev(settings, request);
  return {
    decisions: parseJevResponse(payload, items, settings),
    usage: payload.usage || null,
    model: payload.model || settings.model
  };
}

async function appendRecord(key, entry, limit) {
  const stored = await chrome.storage.local.get({ [key]: [] });
  const records = Array.isArray(stored[key]) ? stored[key] : [];
  const safeEntry = {
    ...entry,
    id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Number(entry.timestamp) || Date.now()
  };
  await chrome.storage.local.set({ [key]: [safeEntry, ...records].slice(0, limit) });
}

async function testConnection(config) {
  const settings = { ...(await loadSettings()), ...config };
  assertConfigured(settings);
  await assertEndpointPermission(settings.apiEndpoint);
  const payload = await callJev(settings, {
    state: "This is a connection test for Jingliu.",
    model: settings.model,
    questions: {
      ready: {
        type: "noul",
        instructions: "Is this a short connection test message?"
      }
    }
  });
  return {
    model: payload.model || settings.model,
    ready: payload.answers?.ready?.noul ?? null
  };
}

function assertConfigured(settings) {
  const endpoint = validateEndpoint(settings.apiEndpoint);
  if (!endpoint.valid) {
    throw createError("INVALID_ENDPOINT", endpoint.error);
  }
  if (!String(settings.apiKey || "").trim()) {
    throw createError("MISSING_API_KEY", "还没有配置 Jev API Key，本地硬规则仍会正常生效。");
  }
}

async function assertEndpointPermission(endpoint) {
  const parsed = validateEndpoint(endpoint);
  if (!parsed.valid) throw createError("INVALID_ENDPOINT", parsed.error);
  if (["https://api.typesafe.ai/*", "https://openrouter.ai/*"].includes(parsed.originPattern)) return;
  const granted = await chrome.permissions.contains({ origins: [parsed.originPattern] });
  if (!granted) {
    throw createError(
      "MISSING_HOST_PERMISSION",
      "当前自定义 Jev 域名还没有授权，请在设置页重新保存。"
    );
  }
}

async function callJev(settings, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  try {
    const headers = {
      Authorization: `Bearer ${String(settings.apiKey).trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (settings.provider === "openrouter" || new URL(settings.apiEndpoint).hostname === "openrouter.ai") {
      headers["X-OpenRouter-Title"] = "Jingliu";
    }
    response = await fetch(settings.apiEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createError("TIMEOUT", "Jev 请求超过 25 秒，已停止本次过滤。");
    }
    throw createError("NETWORK_ERROR", `无法连接 Jev：${error?.message || "网络错误"}`);
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.detail || payload?.error?.message || payload?.message || raw.slice(0, 220);
    throw createError(
      `HTTP_${response.status}`,
      `Jev 返回 ${response.status}${detail ? `：${detail}` : ""}`
    );
  }
  if (!payload?.answers) {
    throw createError("INVALID_RESPONSE", "Jev 响应中没有 answers 字段。");
  }
  return payload;
}

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function serializeError(error) {
  return {
    code: error?.code || "UNKNOWN_ERROR",
    message: error?.message || "未知错误"
  };
}
