const form = document.querySelector("#settingsForm");
const statusNode = document.querySelector("#saveStatus");
const confidence = document.querySelector("#confidenceThreshold");
const confidenceValue = document.querySelector("#confidenceValue");
const apiKey = document.querySelector("#apiKey");
const toggleSecret = document.querySelector("#toggleSecret");
const testButton = document.querySelector("#testConnection");
const resetButton = document.querySelector("#resetDefaults");
const exportRulesButton = document.querySelector("#exportRules");
const importRulesButton = document.querySelector("#importRules");
const rulesFile = document.querySelector("#rulesFile");
const presetButtons = [...document.querySelectorAll("[data-preset]")];
const presetState = document.querySelector("#presetState");
const providerButtons = [...document.querySelectorAll("[data-provider]")];
const providerLead = document.querySelector("#providerLead");
const providerDocs = document.querySelector("#providerDocs");
const apiKeyLabel = document.querySelector("#apiKeyLabel");
const autoMode = document.querySelector("#autoMode");
const overviewAuto = document.querySelector("#overviewAuto");
const overviewPreset = document.querySelector("#overviewPreset");
const overviewProvider = document.querySelector("#overviewProvider");
const connectionState = document.querySelector("#connectionState");
const navLinks = [...document.querySelectorAll("[data-nav]")];
const trackedSections = [...document.querySelectorAll("[data-section]")];
const presetControlledFields = new Set([
  "profile",
  "keepRules",
  "filterAds",
  "displayMode",
  "confidenceThreshold"
]);
let activePreset = "balanced";
let activeProvider = "typesafe";

loadIntoForm().catch((error) => setStatus(error.message, "error"));

confidence.addEventListener("input", updateConfidenceLabel);
presetButtons.forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});
providerButtons.forEach((button) => {
  button.addEventListener("click", () => applyProvider(button.dataset.provider));
});
form.addEventListener("input", (event) => {
  if (presetControlledFields.has(event.target.name) && event.isTrusted) {
    activePreset = "custom";
    renderPresetState();
  }
  if (event.isTrusted) setStatus("有未保存的修改。");
  renderOverviewState();
});
toggleSecret.addEventListener("click", () => {
  const reveal = apiKey.type === "password";
  apiKey.type = reveal ? "text" : "password";
  toggleSecret.textContent = reveal ? "隐藏" : "显示";
});
apiKey.addEventListener("input", renderConnectionReadiness);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = readForm();
  const endpoint = JingliuCore.validateEndpoint(settings.apiEndpoint);
  if (!endpoint.valid) {
    setStatus(endpoint.error, "error");
    document.querySelector("#apiEndpoint").focus();
    return;
  }

  setStatus("正在保存…");
  const permissionGranted = await ensureEndpointPermission(endpoint.originPattern);
  if (!permissionGranted) {
    setStatus("没有获得自定义 Jev 域名权限，设置未保存。", "error");
    return;
  }

  await chrome.storage.local.set(settings);
  setStatus("已保存。回到 X 后，新规则会在下一轮扫描时生效。", "good");
});

testButton.addEventListener("click", async () => {
  const config = readForm();
  const endpoint = JingliuCore.validateEndpoint(config.apiEndpoint);
  if (!endpoint.valid) {
    setStatus(endpoint.error, "error");
    return;
  }
  if (!config.apiKey) {
    setStatus("请先填写 API Key。", "error");
    apiKey.focus();
    return;
  }

  testButton.disabled = true;
  testButton.textContent = "连接中…";
  setStatus("正在向 Jev 发送一条最小测试请求…");
  try {
    const permissionGranted = await ensureEndpointPermission(endpoint.originPattern);
    if (!permissionGranted) throw new Error("没有获得该接口域名的访问权限");
    const response = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION", config });
    if (!response?.ok) throw new Error(response?.error?.message || "测试失败");
    connectionState.dataset.ready = "true";
    connectionState.textContent = "连接正常";
    setStatus(`连接成功：${response.model || config.model} 已响应。`, "good");
  } catch (error) {
    setStatus(error.message || "测试失败", "error");
  } finally {
    testButton.disabled = false;
    testButton.textContent = "测试连接";
  }
});

resetButton.addEventListener("click", async () => {
  const accepted = confirm("恢复静流默认规则？当前 API Key 也会从设置中清除。");
  if (!accepted) return;
  await chrome.storage.local.set({ ...JingliuShared.DEFAULT_SETTINGS });
  await loadIntoForm();
  setStatus("已恢复默认设置。", "good");
});

exportRulesButton.addEventListener("click", () => {
  const backup = JingliuShared.createRulesBackup(readForm());
  const date = backup.exportedAt.slice(0, 10);
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `jingliu-rules-${date}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  setStatus("规则已导出；文件中不包含 API Key 或历史记录。", "good");
});

importRulesButton.addEventListener("click", () => rulesFile.click());
rulesFile.addEventListener("change", async () => {
  const file = rulesFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > 100_000) throw new Error("规则备份不能超过 100 KB");
    const rules = JingliuShared.parseRulesBackup(JSON.parse(await file.text()));
    applyImportedRules(rules);
    setStatus("规则已导入到当前页面；检查后点击“保存设置”生效。", "good");
  } catch (error) {
    setStatus(error.message || "规则导入失败", "error");
  } finally {
    rulesFile.value = "";
  }
});

async function loadIntoForm() {
  const settings = await JingliuShared.loadSettings();
  activePreset = JingliuShared.FILTER_PRESETS[settings.activePreset]
    ? settings.activePreset
    : "custom";
  activeProvider = inferProvider(settings.apiEndpoint, settings.provider);
  writeSettingsToForm(settings);
  updateConfidenceLabel();
  renderPresetState();
  renderProviderState();
  renderOverviewState();
  await renderHistory();
}

function writeSettingsToForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const input = form.elements.namedItem(key);
    if (!input) continue;
    if (input instanceof RadioNodeList) {
      input.value = String(value);
    } else if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = String(value ?? "");
    }
  }
}

function applyImportedRules(rules) {
  writeSettingsToForm(rules);
  const preset = JingliuShared.FILTER_PRESETS[rules.activePreset];
  const matchesPreset = preset && [
    "profile",
    "keepRules",
    "filterAds",
    "displayMode",
    "confidenceThreshold"
  ].every((key) => rules[key] === preset[key]);
  activePreset = matchesPreset ? rules.activePreset : "custom";
  updateConfidenceLabel();
  renderPresetState();
  renderOverviewState();
}

function readForm() {
  const data = new FormData(form);
  return {
    provider: activeProvider,
    activePreset,
    autoMode: autoMode.checked,
    autoModeTouched: true,
    profile: String(data.get("profile") || "").trim(),
    keepRules: String(data.get("keepRules") || "").trim(),
    hardBlockTerms: String(data.get("hardBlockTerms") || "").trim(),
    blockedAuthors: String(data.get("blockedAuthors") || "").trim(),
    alwaysKeepAuthors: String(data.get("alwaysKeepAuthors") || "").trim(),
    displayMode: data.get("displayMode") === "hide" ? "hide" : "collapse",
    filterAds: document.querySelector("#filterAds").checked,
    confidenceThreshold: Number(data.get("confidenceThreshold") || 0.76),
    apiEndpoint: String(data.get("apiEndpoint") || "").trim(),
    apiKey: String(data.get("apiKey") || "").trim(),
    model: String(data.get("model") || "jev-latest").trim(),
    decisionPrompt: String(data.get("decisionPrompt") || "").trim()
  };
}

function applyProvider(id) {
  const provider = JingliuShared.JEV_PROVIDERS[id];
  if (!provider) return;
  const changedProvider = activeProvider !== id;
  activeProvider = id;
  if (changedProvider) apiKey.value = "";
  if (id !== "custom") {
    form.elements.namedItem("apiEndpoint").value = provider.endpoint;
    form.elements.namedItem("model").value = provider.model;
  } else if (changedProvider) {
    form.elements.namedItem("model").value = provider.model;
  }
  renderProviderState();
  setStatus(`已选择 ${provider.name}。为避免把密钥发给错误的服务商，请填写对应 Key。`);
}

function renderProviderState() {
  const provider = JingliuShared.JEV_PROVIDERS[activeProvider] || JingliuShared.JEV_PROVIDERS.custom;
  providerButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.provider === activeProvider));
  });
  const endpoint = form.elements.namedItem("apiEndpoint");
  endpoint.readOnly = activeProvider !== "custom";
  apiKey.placeholder = provider.keyHint;
  apiKeyLabel.textContent = `${provider.name} API Key`;
  renderConnectionReadiness();
  if (activeProvider === "openrouter") {
    providerLead.textContent = "通过 OpenRouter 原生 Decisions API 调用 TypeSafe Jev，使用你的 OpenRouter 余额与 Key。";
    providerDocs.href = "https://openrouter.ai/~typesafe/jev-latest";
    providerDocs.textContent = "查看 OpenRouter Jev 模型 ↗";
  } else if (activeProvider === "typesafe") {
    providerLead.textContent = "直连 TypeSafe SystemOne，使用 TypeSafe API Key 和官方 Jev 模型别名。";
    providerDocs.href = "https://docs.typesafe.ai/introduction/quickstart";
    providerDocs.textContent = "查看 TypeSafe 快速开始 ↗";
  } else {
    providerLead.textContent = "填写兼容 SystemOne typed questions 与 answers 响应格式的自托管网关。";
    providerDocs.href = "https://docs.typesafe.ai/api";
    providerDocs.textContent = "查看兼容格式 ↗";
  }
  renderOverviewState();
}

function inferProvider(endpoint, savedProvider) {
  const value = String(endpoint || "");
  if (value.startsWith("https://openrouter.ai/")) return "openrouter";
  if (value.startsWith("https://api.typesafe.ai/")) return "typesafe";
  return savedProvider === "custom" ? "custom" : "custom";
}

function applyPreset(id) {
  const preset = JingliuShared.FILTER_PRESETS[id];
  if (!preset) return;
  activePreset = id;
  form.elements.namedItem("profile").value = preset.profile;
  form.elements.namedItem("keepRules").value = preset.keepRules;
  form.elements.namedItem("filterAds").checked = preset.filterAds;
  form.elements.namedItem("displayMode").value = preset.displayMode;
  form.elements.namedItem("confidenceThreshold").value = String(preset.confidenceThreshold);
  updateConfidenceLabel();
  renderPresetState();
  setStatus(`已套用“${preset.name}”，保存后生效。`);
}

function renderPresetState() {
  presetButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.preset === activePreset));
  });
  presetState.textContent = JingliuShared.FILTER_PRESETS[activePreset]?.name || "已自定义";
  renderOverviewState();
}

function renderOverviewState() {
  const preset = JingliuShared.FILTER_PRESETS[activePreset];
  const provider = JingliuShared.JEV_PROVIDERS[activeProvider];
  overviewAuto.textContent = autoMode.checked ? "已开启" : "已关闭";
  overviewPreset.textContent = preset?.name || "自定义";
  overviewProvider.textContent = provider?.name || "自定义";
}

function renderConnectionReadiness() {
  const configured = Boolean(String(apiKey.value || "").trim());
  connectionState.dataset.ready = String(configured);
  connectionState.textContent = configured ? "已配置" : "等待配置";
}

async function renderHistory() {
  const stored = await chrome.storage.local.get({ filterHistory: [], filterFeedback: [] });
  const history = Array.isArray(stored.filterHistory) ? stored.filterHistory : [];
  const feedback = Array.isArray(stored.filterFeedback) ? stored.filterFeedback : [];
  document.querySelector("#historyRuns").textContent = String(history.length);
  document.querySelector("#historyFiltered").textContent = String(
    history.reduce((total, entry) => total + (Number(entry.filtered) || 0), 0)
  );
  document.querySelector("#feedbackCount").textContent = String(feedback.length);

  const list = document.querySelector("#historyList");
  list.replaceChildren();
  if (!history.length) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "还没有过滤记录。";
    list.append(empty);
  } else {
    history.slice(0, 7).forEach((entry) => {
      const item = document.createElement("li");
      const time = document.createElement("time");
      time.dateTime = new Date(entry.timestamp).toISOString();
      time.textContent = formatTime(entry.timestamp);
      const summary = document.createElement("strong");
      summary.textContent = `处理 ${entry.found || 0} 条 · 保留 ${entry.kept || 0} 条`;
      const filtered = document.createElement("span");
      filtered.textContent = `折叠 ${entry.filtered || 0}`;
      item.append(time, summary, filtered);
      list.append(item);
    });
  }

  const feedbackSummary = document.querySelector("#feedbackSummary");
  if (!feedback.length) {
    feedbackSummary.textContent = "误判反馈会显示在这里，帮助你调整规则。";
    return;
  }
  const counts = feedback.reduce((result, entry) => {
    const key = entry.reason || "other";
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  const leading = Object.entries(counts).sort((left, right) => right[1] - left[1])[0];
  feedbackSummary.textContent = `最常见误判：${JingliuShared.REASON_LABELS[leading[0]] || "其他"}（${leading[1]} 次）。可以提高置信度，或在保留偏好中补充说明。`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

async function ensureEndpointPermission(originPattern) {
  if (["https://api.typesafe.ai/*", "https://openrouter.ai/*"].includes(originPattern)) return true;
  const alreadyGranted = await chrome.permissions.contains({ origins: [originPattern] });
  if (alreadyGranted) return true;
  return chrome.permissions.request({ origins: [originPattern] });
}

function updateConfidenceLabel() {
  confidenceValue.value = `${Math.round(Number(confidence.value || 0) * 100)}%`;
  confidenceValue.textContent = confidenceValue.value;
}

function setStatus(message, tone = "") {
  statusNode.textContent = message;
  statusNode.dataset.tone = tone;
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => setActiveNav(link.dataset.nav));
});

if ("IntersectionObserver" in globalThis) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visible) setActiveNav(visible.target.id);
    },
    { rootMargin: "-18% 0px -64% 0px", threshold: [0.05, 0.25, 0.5] }
  );
  trackedSections.forEach((section) => sectionObserver.observe(section));
}

function setActiveNav(id) {
  navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.nav === id));
}
