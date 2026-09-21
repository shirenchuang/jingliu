const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");

const settings = {
  alwaysKeepAuthors: "@trusted",
  blockedAuthors: "@blocked",
  hardBlockTerms: "加群领资料\n高收益带单",
  filterAds: true,
  displayMode: "collapse",
  confidenceThreshold: 0.76,
  profile: "过滤广告与低信息内容",
  keepRules: "保留技术分析",
  decisionPrompt: "按用户政策保守判断",
  model: "jev-latest",
  maxTextLength: 1400
};

test("local rules keep an allowlisted author before other checks", () => {
  const decision = core.localDecision({ author: "@trusted", text: "加群领资料", isPlatformAd: true }, settings);
  assert.deepEqual(decision, { action: "keep", reason: "allowed", confidence: 1, source: "local" });
});

test("local rules collapse platform ads and blocked terms", () => {
  assert.equal(core.localDecision({ author: "@brand", text: "新品", isPlatformAd: true }, settings).reason, "local_ad");
  assert.equal(core.localDecision({ author: "@noise", text: "加群领资料", isPlatformAd: false }, settings).reason, "local_term");
});

test("Jev request produces three typed questions per item", () => {
  const request = core.buildJevRequest([{ id: "1", author: "@a", text: "hello", labels: [] }], settings);
  assert.equal(Object.keys(request.questions).length, 3);
  assert.equal(request.questions.action_0.type, "choice");
  assert.equal(request.questions.reason_0.type, "choice");
  assert.equal(request.questions.commercial_0.type, "noul");
});

test("Jev parser folds strong commercial results into a reversible collapse", () => {
  const payload = {
    model: "jev-1.13.0",
    answers: {
      action_0: { choice: "keep", probabilities: { keep: 0.7 } },
      reason_0: { choice: "allowed" },
      commercial_0: { noul: 0.94 }
    }
  };
  const [decision] = core.parseJevResponse(payload, [{ id: "1" }], settings);
  assert.equal(decision.action, "collapse");
  assert.equal(decision.reason, "commercial");
});

test("low-confidence collapse is kept to reduce false positives", () => {
  const payload = {
    answers: {
      action_0: { choice: "collapse", probabilities: { collapse: 0.51 } },
      reason_0: { choice: "low_signal" },
      commercial_0: { noul: 0.1 }
    }
  };
  const [decision] = core.parseJevResponse(payload, [{ id: "1" }], settings);
  assert.equal(decision.action, "keep");
});

test("custom endpoints require HTTPS except localhost", () => {
  assert.equal(core.validateEndpoint("http://example.com/api").valid, false);
  assert.equal(core.validateEndpoint("http://localhost:8787/api").valid, true);
  assert.equal(core.validateEndpoint("https://example.com/api").originPattern, "https://example.com/*");
});
