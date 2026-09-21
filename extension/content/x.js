(function initJingliuX() {
  const { loadSettings, REASON_LABELS } = JingliuShared;
  const { localDecision } = JingliuCore;
  const AD_LABELS = new Set([
    "ad",
    "promoted",
    "sponsored",
    "广告",
    "推广",
    "赞助",
    "anzeige",
    "sponsorisé"
  ]);

  let running = false;
  let observerTimer = null;
  let reconcileTimer = null;
  let autoRunPending = false;
  let autoMode = false;
  let lastError = null;
  const decisionCache = new Map();
  const DECISION_CACHE_LIMIT = 600;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "RUN_FILTER") {
      runFilter({ recordHistory: true, trigger: "manual" })
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
      return true;
    }

    if (message?.type === "RESET_AND_RUN") {
      decisionCache.clear();
      const restored = restoreAll({ resetDecisions: true });
      runFilter({ recordHistory: true, trigger: "rescan" })
        .then((result) => sendResponse({ ok: true, restored, ...result }))
        .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
      return true;
    }

    if (message?.type === "GET_PAGE_STATE") {
      sendResponse({ ok: true, ...pageState() });
      return false;
    }

    if (message?.type === "RESTORE_ALL") {
      const restored = restoreAll();
      sendResponse({ ok: true, restored, ...pageState() });
      return false;
    }

    if (message?.type === "SET_AUTO_MODE") {
      autoMode = Boolean(message.enabled);
      if (autoMode) scheduleAutomaticRun(80);
      sendResponse({ ok: true, autoMode });
      return false;
    }

    return false;
  });

  async function runFilter({ recordHistory = false, trigger = "auto" } = {}) {
    if (running) return { busy: true, ...pageState() };
    running = true;
    lastError = null;

    try {
      const settings = await loadSettings();
      autoMode = Boolean(settings.autoMode);
      reconcileDecisionViews();
      const cards = extractUnprocessedCards(settings.maxTextLength);
      const remoteCards = [];

      for (const card of cards) {
        card.element.dataset.qfState = "queued";
        card.element.dataset.qfItemId = card.id;
        const decision = localDecision(card, settings);
        if (decision) {
          applyDecision(card.element, { ...decision, id: card.id });
        } else {
          remoteCards.push(card);
        }
      }

      let remoteProcessed = 0;
      const batchSize = Math.max(1, Math.min(12, Number(settings.batchSize) || 6));
      for (let cursor = 0; cursor < remoteCards.length; cursor += batchSize) {
        const batch = remoteCards.slice(cursor, cursor + batchSize);
        const response = await chrome.runtime.sendMessage({
          type: "CLASSIFY_ITEMS",
          items: batch.map(stripElement)
        });

        if (!response?.ok) {
          batch.forEach(({ element }) => delete element.dataset.qfState);
          const error = response?.error || { code: "UNKNOWN_ERROR", message: "Jev 判断失败" };
          lastError = error;
          remoteCards.slice(cursor + batch.length).forEach(({ element }) => {
            delete element.dataset.qfState;
          });
          break;
        }

        const byId = new Map(batch.map((card) => [card.id, card.element]));
        for (const decision of response.decisions || []) {
          const element = byId.get(decision.id);
          if (element) {
            applyDecision(element, decision);
            remoteProcessed += 1;
          }
        }
        batch.forEach(({ element }) => {
          if (element.dataset.qfState === "queued") delete element.dataset.qfState;
        });
      }

      const result = {
        found: cards.length,
        localProcessed: cards.length - remoteCards.length,
        remoteProcessed,
        warning: lastError,
        ...pageState()
      };
      if (recordHistory && cards.length) {
        recordSession({
          trigger,
          found: result.found,
          localProcessed: result.localProcessed,
          remoteProcessed: result.remoteProcessed,
          filtered: result.stats.filtered,
          kept: result.stats.kept,
          ads: result.stats.ads,
          warningCode: result.warning?.code || null
        });
      }
      return result;
    } finally {
      running = false;
      if (autoRunPending) {
        autoRunPending = false;
        scheduleAutomaticRun(120);
      }
    }
  }

  function extractUnprocessedCards(maxTextLength = 1400) {
    const seen = new Set();
    return [...document.querySelectorAll('article[data-testid="tweet"]')]
      .filter((article) => !article.dataset.qfState)
      .map((article) => extractCard(article, maxTextLength))
      .filter((card) => {
        if (!card.text || seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      });
  }

  function extractCard(article, maxTextLength) {
    const statusLink = [...article.querySelectorAll('a[href*="/status/"]')]
      .map((link) => link.getAttribute("href") || "")
      .find((href) => /\/status\/\d+/.test(href));
    const authorLink = [...article.querySelectorAll('a[href^="/"]')]
      .map((link) => link.getAttribute("href") || "")
      .find((href) => /^\/[A-Za-z0-9_]{1,15}$/.test(href));
    const tweetText = [...article.querySelectorAll('[data-testid="tweetText"]')]
      .map((node) => String(node.textContent || "").trim())
      .filter(Boolean)
      .join("\n");
    const fallbackText = String(article.textContent || "").trim();
    const text = String(tweetText || fallbackText).slice(0, Number(maxTextLength) || 1400);
    const labels = [...article.querySelectorAll("span")]
      .map((span) => span.innerText.trim())
      .filter((label) => label.length > 0 && label.length < 24);
    const isPlatformAd = labels.some((label) => AD_LABELS.has(label.toLowerCase()));
    const fingerprint = simpleHash(`${authorLink}|${text.slice(0, 180)}`);

    return {
      id: statusLink?.match(/\/status\/(\d+)/)?.[1] || `visible-${fingerprint}`,
      author: authorLink ? `@${authorLink.slice(1)}` : "unknown",
      text,
      labels: [...new Set(labels)].slice(0, 8),
      isPlatformAd,
      element: article
    };
  }

  function applyDecision(article, decision) {
    clearDecisionView(article);
    const action = ["keep", "collapse", "hide"].includes(decision.action)
      ? decision.action
      : "keep";
    const itemId = decision.id || article.dataset.qfItemId || getArticleIdentity(article);

    article.dataset.qfState = action;
    if (itemId) article.dataset.qfItemId = itemId;
    article.dataset.qfSource = decision.source || "unknown";
    article.dataset.qfReason = decision.reason || "other";
    article.dataset.qfConfidence = String(Number(decision.confidence) || 0);
    rememberDecision(itemId, { ...decision, action, id: itemId });

    if (action === "keep") return;

    const host = getDecisionHost(article);
    article.classList.add("qf-filtered", `qf-action-${action}`);
    host.classList.add("qf-host-filtered", `qf-host-action-${action}`);
    const placeholder = document.createElement("div");
    placeholder.className = "qf-placeholder";
    placeholder.setAttribute("role", "status");

    const mark = document.createElement("span");
    mark.className = "qf-placeholder__mark";
    mark.setAttribute("aria-hidden", "true");

    const copy = document.createElement("div");
    copy.className = "qf-placeholder__copy";
    const title = document.createElement("strong");
    title.textContent = action === "hide" ? "已隐藏" : "已收起";
    const meta = document.createElement("span");
    const confidence = Math.round((Number(decision.confidence) || 0) * 100);
    const source = decision.source === "jev" ? "Jev" : "本地规则";
    const reason = REASON_LABELS[decision.reason] || REASON_LABELS.other;
    meta.textContent = reason;
    placeholder.title = `${reason} · ${source}${confidence ? ` ${confidence}%` : ""}`;
    copy.append(title, meta);

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "qf-placeholder__restore";
    restore.textContent = "显示";
    restore.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      restoreCard(article);
    });

    const feedback = document.createElement("button");
    feedback.type = "button";
    feedback.className = "qf-placeholder__feedback";
    feedback.textContent = "纠正";
    feedback.title = "记录一次误判并显示原内容";
    feedback.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      recordFeedback(decision);
      restoreCard(article);
    });

    const actions = document.createElement("div");
    actions.className = "qf-placeholder__actions";
    actions.append(feedback, restore);

    placeholder.append(mark, copy, actions);
    host.append(placeholder);
  }

  function restoreCard(article, { resetDecision = false } = {}) {
    const itemId = article.dataset.qfItemId || getArticleIdentity(article);
    clearDecisionView(article);
    if (resetDecision) {
      clearDecisionData(article);
      return;
    }
    article.dataset.qfState = "keep";
    if (itemId) article.dataset.qfItemId = itemId;
    article.dataset.qfSource = "user";
    article.dataset.qfReason = "allowed";
    article.dataset.qfConfidence = "1";
    rememberDecision(itemId, {
      id: itemId,
      action: "keep",
      source: "user",
      reason: "allowed",
      confidence: 1
    });
  }

  function clearDecisionView(article) {
    const host = getDecisionHost(article);
    article.classList.remove("qf-filtered", "qf-action-collapse", "qf-action-hide");
    article.querySelector(":scope > .qf-placeholder")?.remove();
    host.classList.remove("qf-host-filtered", "qf-host-action-collapse", "qf-host-action-hide");
    if (host !== article) host.querySelector(":scope > .qf-placeholder")?.remove();
  }

  function getDecisionHost(article) {
    return article.closest('[data-testid="cellInnerDiv"]') || article;
  }

  function getArticleIdentity(article) {
    const statusHref = [...article.querySelectorAll('a[href*="/status/"]')]
      .map((link) => link.getAttribute("href") || "")
      .find((href) => /\/status\/\d+/.test(href));
    const statusId = statusHref?.match(/\/status\/(\d+)/)?.[1];
    if (statusId) return statusId;

    const authorHref = [...article.querySelectorAll('a[href^="/"]')]
      .map((link) => link.getAttribute("href") || "")
      .find((href) => /^\/[A-Za-z0-9_]{1,15}$/.test(href));
    const text = [...article.querySelectorAll('[data-testid="tweetText"]')]
      .map((node) => String(node.textContent || "").trim())
      .filter(Boolean)
      .join("\n");
    if (!authorHref && !text) return "";
    return `visible-${simpleHash(`${authorHref}|${text.slice(0, 180)}`)}`;
  }

  function rememberDecision(itemId, decision) {
    if (!itemId) return;
    if (decisionCache.has(itemId)) decisionCache.delete(itemId);
    decisionCache.set(itemId, {
      id: itemId,
      action: decision.action || "keep",
      source: decision.source || "unknown",
      reason: decision.reason || "other",
      confidence: Number(decision.confidence) || 0
    });
    if (decisionCache.size > DECISION_CACHE_LIMIT) {
      decisionCache.delete(decisionCache.keys().next().value);
    }
  }

  function decisionFromDataset(article) {
    return {
      id: article.dataset.qfItemId || getArticleIdentity(article),
      action: article.dataset.qfState,
      source: article.dataset.qfSource || "unknown",
      reason: article.dataset.qfReason || "other",
      confidence: Number(article.dataset.qfConfidence) || 0
    };
  }

  function clearDecisionData(article) {
    delete article.dataset.qfState;
    delete article.dataset.qfItemId;
    delete article.dataset.qfSource;
    delete article.dataset.qfReason;
    delete article.dataset.qfConfidence;
  }

  function reconcileDecisionViews() {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    for (const article of articles) {
      const currentId = getArticleIdentity(article);
      const storedId = article.dataset.qfItemId;

      if (storedId && currentId && storedId !== currentId) {
        clearDecisionView(article);
        clearDecisionData(article);
      }

      if (!article.dataset.qfState && currentId && decisionCache.has(currentId)) {
        applyDecision(article, decisionCache.get(currentId));
        continue;
      }

      if (!["collapse", "hide"].includes(article.dataset.qfState)) continue;
      if (!article.dataset.qfItemId && currentId) article.dataset.qfItemId = currentId;
      const host = getDecisionHost(article);
      const placeholder = host.querySelector(":scope > .qf-placeholder");
      const actionClass = `qf-host-action-${article.dataset.qfState}`;
      if (
        !placeholder ||
        !article.classList.contains("qf-filtered") ||
        !host.classList.contains("qf-host-filtered") ||
        !host.classList.contains(actionClass)
      ) {
        applyDecision(article, decisionFromDataset(article));
      }
    }

    document.querySelectorAll(".qf-host-filtered").forEach((host) => {
      const filteredArticle = host.matches('article[data-qf-state="collapse"], article[data-qf-state="hide"]')
        ? host
        : host.querySelector('article[data-qf-state="collapse"], article[data-qf-state="hide"]');
      if (filteredArticle) return;
      host.classList.remove("qf-host-filtered", "qf-host-action-collapse", "qf-host-action-hide");
      host.querySelector(":scope > .qf-placeholder")?.remove();
    });
  }

  function restoreAll({ resetDecisions = false } = {}) {
    const selector = resetDecisions
      ? 'article[data-qf-state]'
      : 'article[data-qf-state="collapse"], article[data-qf-state="hide"]';
    const decided = [...document.querySelectorAll(selector)];
    decided.forEach((article) => restoreCard(article, { resetDecision: resetDecisions }));
    lastError = null;
    return decided.length;
  }

  function pageState() {
    const cards = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const count = (state) => cards.filter((card) => card.dataset.qfState === state).length;
    const collapsed = count("collapse");
    const hidden = count("hide");
    const filteredCards = cards.filter((card) => ["collapse", "hide"].includes(card.dataset.qfState));
    return {
      stats: {
        visible: cards.length,
        processed: cards.filter((card) => ["keep", "collapse", "hide"].includes(card.dataset.qfState)).length,
        kept: count("keep"),
        collapsed,
        hidden,
        filtered: collapsed + hidden,
        ads: filteredCards.filter((card) => ["local_ad", "commercial"].includes(card.dataset.qfReason)).length,
        jev: cards.filter((card) => card.dataset.qfSource === "jev").length
      },
      available: cards.filter((card) => !card.dataset.qfState).length,
      running,
      autoMode,
      lastError
    };
  }

  function stripElement(card) {
    const { element, ...serializable } = card;
    return serializable;
  }

  function simpleHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function normalizeError(error) {
    return {
      code: error?.code || "CONTENT_ERROR",
      message: error?.message || "页面过滤失败"
    };
  }

  function recordSession(entry) {
    chrome.runtime.sendMessage({
      type: "RECORD_SESSION",
      entry: { ...entry, timestamp: Date.now(), platform: "X" }
    }).catch(() => {});
  }

  function recordFeedback(decision) {
    chrome.runtime.sendMessage({
      type: "RECORD_FEEDBACK",
      entry: {
        timestamp: Date.now(),
        platform: "X",
        kind: "false_positive",
        action: decision.action || "collapse",
        reason: decision.reason || "other",
        source: decision.source || "unknown"
      }
    }).catch(() => {});
  }

  function scheduleAutomaticRun(delay = 900) {
    if (!autoMode) return;
    if (running) {
      autoRunPending = true;
      return;
    }
    if (observerTimer) return;
    observerTimer = setTimeout(() => {
      observerTimer = null;
      if (autoMode && document.querySelector('article[data-testid="tweet"]:not([data-qf-state])')) {
        runFilter({ recordHistory: false, trigger: "auto" }).catch(() => {});
      }
    }, delay);
  }

  function scheduleReconciliation(delay = 60) {
    if (reconcileTimer) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      reconcileDecisionViews();
      scheduleAutomaticRun(140);
    }, delay);
  }

  const observer = new MutationObserver(() => scheduleReconciliation());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href"]
  });
  loadSettings()
    .then((settings) => {
      autoMode = Boolean(settings.autoMode);
      if (autoMode) scheduleAutomaticRun(250);
    })
    .catch(() => {});
})();
