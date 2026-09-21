const test = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../shared.js");

test("rule backups exclude credentials and local history", () => {
  const backup = shared.createRulesBackup({
    ...shared.DEFAULT_SETTINGS,
    apiKey: "secret-key",
    apiEndpoint: "https://private.example/api",
    filterHistory: [{ found: 4 }],
    filterFeedback: [{ reason: "other" }]
  }, new Date("2026-09-21T00:00:00.000Z"));

  assert.equal(backup.product, "Jingliu");
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.exportedAt, "2026-09-21T00:00:00.000Z");
  assert.equal(backup.rules.profile, shared.DEFAULT_SETTINGS.profile);
  assert.equal("apiKey" in backup.rules, false);
  assert.equal("apiEndpoint" in backup.rules, false);
  assert.equal("filterHistory" in backup.rules, false);
  assert.equal("filterFeedback" in backup.rules, false);
});

test("rule imports whitelist fields and clamp confidence", () => {
  const rules = shared.parseRulesBackup({
    product: "Jingliu",
    schemaVersion: 1,
    rules: {
      activePreset: "research",
      autoMode: false,
      profile: "Keep primary sources",
      filterAds: true,
      displayMode: "hide",
      confidenceThreshold: 4,
      apiKey: "must-not-import",
      unexpected: "ignored"
    }
  });

  assert.equal(rules.activePreset, "research");
  assert.equal(rules.autoMode, false);
  assert.equal(rules.confidenceThreshold, 0.95);
  assert.equal("apiKey" in rules, false);
  assert.equal("unexpected" in rules, false);
});

test("rule imports reject unrelated JSON", () => {
  assert.throws(() => shared.parseRulesBackup({ hello: "world" }), /Jingliu|\u9759\u6d41/);
});
