(function initJingliuShared(scope) {
  const DEFAULT_SETTINGS = Object.freeze({
    provider: "typesafe",
    apiEndpoint: "https://api.typesafe.ai/v1/systemone",
    apiKey: "",
    model: "jev-latest",
    activePreset: "balanced",
    profile:
      "隐藏商业广告、带货、课程推广、无实质信息的情绪化内容和重复搬运。保留原创分析、重大新闻、技术细节与有明确信息增量的观点。",
    keepRules: "AI、机器人、开发者工具、创业、芯片、前沿科技、重大突发新闻",
    hardBlockTerms: "代投\n高收益带单\n加群领资料",
    blockedAuthors: "",
    alwaysKeepAuthors: "",
    filterAds: true,
    autoMode: true,
    autoModeTouched: false,
    settingsVersion: 4,
    displayMode: "collapse",
    confidenceThreshold: 0.76,
    batchSize: 6,
    maxTextLength: 1400,
    decisionPrompt:
      "以用户的过滤政策为最高优先级。明确违反政策或明确广告才选 hide；低信息量、边界命中或判断不确定时选 collapse；有信息增量、命中保留偏好或属于重大新闻时选 keep。"
  });

  const FILTER_PRESETS = Object.freeze({
    balanced: Object.freeze({
      name: "均衡",
      description: "过滤明显噪声，边界内容保守折叠",
      profile: "隐藏商业广告、带货、课程推广、无实质信息的情绪化内容和重复搬运。保留原创分析、重大新闻、技术细节与有明确信息增量的观点。",
      keepRules: "AI、机器人、开发者工具、创业、芯片、前沿科技、重大突发新闻",
      filterAds: true,
      displayMode: "collapse",
      confidenceThreshold: 0.76
    }),
    research: Object.freeze({
      name: "研究模式",
      description: "优先留下论文、技术细节和一手资料",
      profile: "隐藏广告、泛泛而谈、没有来源的断言、单纯情绪表达、重复新闻和缺乏技术细节的转述。",
      keepRules: "论文、原始数据、代码、技术实现、实验结果、产品文档、一手采访、深度行业分析",
      filterAds: true,
      displayMode: "collapse",
      confidenceThreshold: 0.82
    }),
    strict: Object.freeze({
      name: "强力降噪",
      description: "更积极地折叠低信息量与情绪内容",
      profile: "隐藏广告、软广、带货、课程、抽奖、互动诱导、情绪煽动、标题党、重复搬运、无事实支撑的观点和没有信息增量的短评。",
      keepRules: "原创调查、重大突发新闻、数据充分的分析、详细教程和可验证的一手信息",
      filterAds: true,
      displayMode: "collapse",
      confidenceThreshold: 0.68
    }),
    adsOnly: Object.freeze({
      name: "只去广告",
      description: "只处理商业推广，其他内容尽量保留",
      profile: "只隐藏明确广告、软广、带货、课程销售、联盟营销、邀请码推广和商业引流。其他内容全部保留。",
      keepRules: "非商业内容全部保留",
      filterAds: true,
      displayMode: "collapse",
      confidenceThreshold: 0.84
    })
  });

  const JEV_PROVIDERS = Object.freeze({
    typesafe: Object.freeze({
      name: "TypeSafe",
      endpoint: "https://api.typesafe.ai/v1/systemone",
      model: "jev-latest",
      keyHint: "TypeSafe API Key"
    }),
    openrouter: Object.freeze({
      name: "OpenRouter",
      endpoint: "https://openrouter.ai/api/alpha/decisions",
      model: "~typesafe/jev-latest",
      keyHint: "OpenRouter API Key（sk-or-v1-…）"
    }),
    custom: Object.freeze({
      name: "自定义",
      endpoint: "",
      model: "jev-latest",
      keyHint: "自定义接口 API Key"
    })
  });

  const REASON_LABELS = Object.freeze({
    commercial: "商业推广",
    unwanted_topic: "不想看的主题",
    low_signal: "信息量较低",
    ragebait: "情绪诱导",
    duplicate: "重复或搬运",
    allowed: "符合保留偏好",
    local_ad: "平台广告标记",
    local_term: "命中本地硬过滤词",
    blocked_author: "已屏蔽作者",
    other: "不符合当前规则"
  });

  const RULE_EXPORT_KEYS = Object.freeze([
    "activePreset",
    "autoMode",
    "profile",
    "keepRules",
    "hardBlockTerms",
    "blockedAuthors",
    "alwaysKeepAuthors",
    "filterAds",
    "displayMode",
    "confidenceThreshold",
    "decisionPrompt"
  ]);

  function createRulesBackup(settings, exportedAt = new Date()) {
    const rules = {};
    for (const key of RULE_EXPORT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(settings || {}, key)) {
        rules[key] = settings[key];
      }
    }
    return {
      product: "Jingliu",
      schemaVersion: 1,
      exportedAt: exportedAt.toISOString(),
      rules
    };
  }

  function parseRulesBackup(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("备份文件不是有效的 JSON 对象");
    }
    if (payload.product && payload.product !== "Jingliu") {
      throw new Error("这不是静流规则备份");
    }
    if (payload.schemaVersion && payload.schemaVersion !== 1) {
      throw new Error("该备份版本尚不支持");
    }

    const source = payload.rules && typeof payload.rules === "object" ? payload.rules : payload;
    const rules = {};
    const textKeys = [
      "profile",
      "keepRules",
      "hardBlockTerms",
      "blockedAuthors",
      "alwaysKeepAuthors",
      "decisionPrompt"
    ];
    for (const key of textKeys) {
      if (typeof source[key] === "string") rules[key] = source[key].slice(0, 20_000);
    }
    if (["balanced", "research", "strict", "adsOnly", "custom"].includes(source.activePreset)) {
      rules.activePreset = source.activePreset;
    }
    if (typeof source.autoMode === "boolean") rules.autoMode = source.autoMode;
    if (typeof source.filterAds === "boolean") rules.filterAds = source.filterAds;
    if (["collapse", "hide"].includes(source.displayMode)) rules.displayMode = source.displayMode;
    if (Number.isFinite(Number(source.confidenceThreshold))) {
      rules.confidenceThreshold = Math.min(0.95, Math.max(0.5, Number(source.confidenceThreshold)));
    }
    if (!Object.keys(rules).length) {
      throw new Error("备份中没有可导入的静流规则");
    }
    return rules;
  }

  async function loadSettings() {
    const stored = await chrome.storage.local.get(null);
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    if (!stored.provider) {
      if (String(settings.apiEndpoint).startsWith("https://openrouter.ai/")) {
        settings.provider = "openrouter";
      } else if (!String(settings.apiEndpoint).startsWith("https://api.typesafe.ai/")) {
        settings.provider = "custom";
      }
    }
    return settings;
  }

  scope.JingliuShared = {
    DEFAULT_SETTINGS,
    FILTER_PRESETS,
    JEV_PROVIDERS,
    REASON_LABELS,
    RULE_EXPORT_KEYS,
    createRulesBackup,
    parseRulesBackup,
    loadSettings
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = scope.JingliuShared;
  }
})(globalThis);
