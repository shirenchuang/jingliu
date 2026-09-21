(function initJingliuCore(scope) {
  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function parseList(value) {
    return String(value || "")
      .split(/[\n,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeHandle(value) {
    return normalize(value).replace(/^@/, "");
  }

  function localDecision(item, settings) {
    const author = normalizeHandle(item.author);
    const text = normalize(item.text);
    const keepAuthors = parseList(settings.alwaysKeepAuthors).map(normalizeHandle);
    const blockedAuthors = parseList(settings.blockedAuthors).map(normalizeHandle);

    if (author && keepAuthors.includes(author)) {
      return { action: "keep", reason: "allowed", confidence: 1, source: "local" };
    }

    if (author && blockedAuthors.includes(author)) {
      return { action: settings.displayMode === "hide" ? "hide" : "collapse", reason: "blocked_author", confidence: 1, source: "local" };
    }

    if (settings.filterAds && item.isPlatformAd) {
      return { action: settings.displayMode === "hide" ? "hide" : "collapse", reason: "local_ad", confidence: 1, source: "local" };
    }

    const matchedTerm = parseList(settings.hardBlockTerms).find((term) =>
      text.includes(normalize(term))
    );
    if (matchedTerm) {
      return {
        action: settings.displayMode === "hide" ? "hide" : "collapse",
        reason: "local_term",
        confidence: 1,
        source: "local",
        matchedTerm
      };
    }

    return null;
  }

  function buildJevRequest(items, settings) {
    const state = {
      platform: "X",
      user_policy: {
        filter_out: settings.profile,
        actively_keep: settings.keepRules,
        filter_commercial_content: Boolean(settings.filterAds)
      },
      content_items: items.map((item, index) => ({
        index,
        author: item.author || "unknown",
        text: String(item.text || "").slice(0, settings.maxTextLength || 1400),
        platform_labels: item.labels || []
      }))
    };

    const questions = {};
    items.forEach((_, index) => {
      const ref = `content_items[${index}]`;
      questions[`action_${index}`] = {
        type: "choice",
        instructions: `${settings.decisionPrompt}\n请只判断 \`${ref}\`应该如何处理。`,
        criteria: {
          keep: "保留显示：符合用户偏好、有信息增量、属于重大新闻，或不能确定应该过滤",
          collapse: "可逆折叠：低信息量、边界命中、疑似软广或对用户价值较低",
          hide: "强过滤：明确命中用户不想看的内容，或明确属于广告、带货、欺诈引流"
        }
      };

      questions[`reason_${index}`] = {
        type: "choice",
        instructions: `根据用户政策，\`${ref}\`最适合的单一内容类别是什么？`,
        criteria: {
          commercial: "广告、软广、课程、带货、邀请码、联盟营销或明显的自我推广",
          unwanted_topic: "明确命中用户不希望看到的主题",
          low_signal: "空洞、缺少事实、只有态度或没有信息增量",
          ragebait: "标题党、故意激怒、制造恐慌或强迫互动",
          duplicate: "重复发布、无补充搬运或机械改写",
          allowed: "有信息增量或明确命中用户希望保留的内容",
          other: "不属于以上类别"
        }
      };

      questions[`commercial_${index}`] = {
        type: "noul",
        instructions: `\`${ref}\`的主要目的是否为了销售、引流、推广产品服务或获取商业转化？`,
        criteria: {
          true: "内容以商业转化为核心目的，即使伪装成经验分享",
          false: "内容主要是信息、观点、讨论或非商业个人表达"
        }
      };
    });

    return {
      state,
      model: settings.model || "jev-latest",
      questions
    };
  }

  function maxProbability(answer) {
    const values = Object.values(answer?.probabilities || {}).filter(
      (value) => typeof value === "number"
    );
    return values.length ? Math.max(...values) : 0;
  }

  function parseJevResponse(payload, items, settings) {
    const answers = payload?.answers || {};
    const threshold = Number(settings.confidenceThreshold || 0.76);

    return items.map((item, index) => {
      const actionAnswer = answers[`action_${index}`] || {};
      const reasonAnswer = answers[`reason_${index}`] || {};
      const commercialAnswer = answers[`commercial_${index}`] || {};
      const actionProbability = Number(
        actionAnswer.probabilities?.[actionAnswer.choice] ??
          actionAnswer.confidence ??
          maxProbability(actionAnswer)
      );
      const commercialProbability = Number(commercialAnswer.noul || 0);
      let action = ["keep", "collapse", "hide"].includes(actionAnswer.choice)
        ? actionAnswer.choice
        : "keep";
      let reason = reasonAnswer.choice || "other";
      let confidence = Math.max(actionProbability, commercialProbability);

      if (settings.filterAds && commercialProbability >= threshold) {
        action = "hide";
        reason = "commercial";
        confidence = commercialProbability;
      } else if (action === "hide" && actionProbability < threshold) {
        action = "collapse";
      } else if (action === "collapse" && actionProbability < Math.max(0.5, threshold - 0.18)) {
        action = "keep";
      }

      if (settings.displayMode === "collapse" && action === "hide") {
        action = "collapse";
      }

      return {
        id: item.id,
        action,
        reason,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        commercialProbability,
        source: "jev",
        model: payload.model || settings.model,
        usage: payload.usage || null
      };
    });
  }

  function validateEndpoint(value) {
    let url;
    try {
      url = new URL(String(value || ""));
    } catch {
      return { valid: false, error: "Jev 接口地址不是有效 URL" };
    }

    const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
      return { valid: false, error: "自定义接口必须使用 HTTPS，仅本地调试可使用 HTTP" };
    }
    if (url.username || url.password) {
      return { valid: false, error: "请不要把密钥写在 URL 里" };
    }
    if (url.hash) {
      return { valid: false, error: "Jev 接口地址不能包含锚点" };
    }
    return { valid: true, url: url.toString(), originPattern: `${url.origin}/*` };
  }

  const api = {
    parseList,
    localDecision,
    buildJevRequest,
    parseJevResponse,
    validateEndpoint
  };

  scope.JingliuCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
