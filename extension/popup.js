const elements = {
  run: document.querySelector("#runFilter"),
  runLabel: document.querySelector("#runLabel"),
  status: document.querySelector("#status"),
  pageSummary: document.querySelector("#pageSummary"),
  auto: document.querySelector("#autoMode"),
  autoTitle: document.querySelector("#autoTitle"),
  autoDescription: document.querySelector("#autoDescription"),
  preset: document.querySelector("#quickPreset"),
  presetDescription: document.querySelector("#presetDescription"),
  apiDot: document.querySelector("#apiDot"),
  apiStatus: document.querySelector("#apiStatus"),
  profile: document.querySelector("#profileSummary"),
  settings: document.querySelector("#openSettings"),
  configure: document.querySelector("#configureJev"),
  restore: document.querySelector("#restoreAll")
};

let activeTabId = null;
let pageAvailable = false;

init().catch((error) => setStatus(error.message, "error"));

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  const settings = await JingliuShared.loadSettings();
  renderSettings(settings);

  if (!activeTabId) {
    disablePageActions("没有可用的浏览器标签页。");
    return;
  }

  const page = await sendToPage({ type: "GET_PAGE_STATE" });
  if (!page?.ok) {
    disablePageActions("打开或刷新 X 后，静流会自动生效。");
    return;
  }

  pageAvailable = true;
  renderStats(page.stats);
  setStatus(page.available ? `还有 ${page.available} 条新内容待处理` : "当前页面已自动处理", "good");
}

elements.run.addEventListener("click", async () => {
  setBusy(true);
  setStatus("正在按当前规则重新扫描…");
  try {
    const result = await sendToPage({ type: "RESET_AND_RUN" });
    if (!result?.ok) throw new Error(result?.error?.message || "扫描失败");
    renderStats(result.stats);
    renderRunResult(result);
  } catch (error) {
    setStatus(error.message || "扫描失败", "error");
  } finally {
    setBusy(false);
  }
});

elements.restore.addEventListener("click", async () => {
  try {
    const result = await sendToPage({ type: "RESTORE_ALL" });
    if (!result?.ok) throw new Error("恢复失败");
    renderStats(result.stats);
    setStatus(`已恢复 ${result.restored || 0} 条，本页不再自动折叠这些内容。`, "good");
  } catch (error) {
    setStatus(error.message || "恢复失败", "error");
  }
});

elements.auto.addEventListener("change", async () => {
  const enabled = elements.auto.checked;
  renderAutoMode(enabled);
  await chrome.storage.local.set({ autoMode: enabled, autoModeTouched: true });
  const result = await sendToPage({ type: "SET_AUTO_MODE", enabled });
  if (!result?.ok) {
    setStatus(`设置已保存；打开 X 后会${enabled ? "自动生效" : "保持关闭"}。`, "good");
    return;
  }
  setStatus(enabled ? "自动过滤已开启，刷新页面也会生效。" : "自动过滤已关闭。", "good");
});

elements.preset.addEventListener("change", async () => {
  const preset = JingliuShared.FILTER_PRESETS[elements.preset.value];
  if (!preset) return;
  await chrome.storage.local.set({ activePreset: elements.preset.value, ...preset });
  renderPreset(elements.preset.value);
  setStatus(`已切换为“${preset.name}”。`, "good");
  if (!pageAvailable) return;
  setBusy(true);
  try {
    const result = await sendToPage({ type: "RESET_AND_RUN" });
    if (result?.ok) {
      renderStats(result.stats);
      setStatus(`“${preset.name}”已应用到当前页面。`, "good");
    }
  } finally {
    setBusy(false);
  }
});

elements.settings.addEventListener("click", openSettings);
elements.configure.addEventListener("click", openSettings);

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function renderSettings(settings) {
  renderAutoMode(Boolean(settings.autoMode));
  renderPreset(JingliuShared.FILTER_PRESETS[settings.activePreset] ? settings.activePreset : "custom");
  const hasKey = Boolean(String(settings.apiKey || "").trim());
  const providerName = JingliuShared.JEV_PROVIDERS[settings.provider]?.name || "Jev";
  elements.apiDot.dataset.ready = String(hasKey);
  elements.apiStatus.textContent = hasKey ? `${providerName} · 已连接` : "Jev 尚未配置";
  elements.profile.textContent = hasKey
    ? settings.model || "jev-latest"
    : "本地广告与关键词过滤仍可使用";
  elements.configure.textContent = hasKey ? "更改" : "配置 Jev";
  elements.configure.dataset.needed = String(!hasKey);
}

function renderAutoMode(enabled) {
  elements.auto.checked = enabled;
  elements.autoTitle.textContent = enabled ? "已开启" : "已关闭";
  elements.autoDescription.textContent = enabled
    ? "刷新和滚动 X 时自动生效"
    : "需要手动点击下方按钮";
}

function renderPreset(id) {
  const preset = JingliuShared.FILTER_PRESETS[id];
  elements.preset.value = preset ? id : "custom";
  elements.presetDescription.textContent = preset?.description || "正在使用高级设置中的自定义规则";
}

function renderRunResult(result) {
  if (result.warning?.code === "MISSING_API_KEY") {
    setStatus(`本地规则已处理 ${result.localProcessed || 0} 条；配置 Jev 可识别语义内容。`, "error");
  } else if (result.warning) {
    setStatus(`本地规则已生效；Jev 暂未完成：${result.warning.message}`, "error");
  } else if (!result.found) {
    setStatus("没有新内容需要处理。", "good");
  } else {
    setStatus(`扫描完成：折叠 ${result.stats?.filtered || 0} 条。`, "good");
  }
}

function renderStats(stats = {}) {
  elements.pageSummary.textContent = `本页：已折叠 ${stats.filtered || 0} · 已保留 ${stats.kept || 0}`;
}

function disablePageActions(message) {
  pageAvailable = false;
  elements.run.disabled = true;
  elements.restore.disabled = true;
  elements.pageSummary.textContent = "本页：等待打开 X";
  setStatus(message, "error");
}

function setBusy(busy) {
  elements.run.disabled = busy || !pageAvailable;
  elements.runLabel.textContent = busy ? "正在扫描…" : "立即扫描当前页面";
}

function setStatus(message, tone = "") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

async function sendToPage(message) {
  if (!activeTabId) return null;
  try {
    return await chrome.tabs.sendMessage(activeTabId, message);
  } catch {
    return null;
  }
}
