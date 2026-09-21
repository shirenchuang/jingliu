const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const extensionPath = path.resolve(__dirname, "..");
let executablePathPromise;

test("content filtering replaces the complete X cell and repairs removed UI", { timeout: 30_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await installContentMocks(page, { ...testSettings(), autoMode: false });
    await page.setContent(feedFixture());
    await injectContentScript(page);
    const result = await page.evaluate(() => globalThis.__dispatchExtensionMessage({ type: "RUN_FILTER" }));
    assert.equal(result.ok, true);
    assert.equal(result.found, 3);
    assert.equal(await page.locator(".qf-placeholder").count(), 2);
    assert.equal(await page.locator(".qf-host-filtered").count(), 2);
    assert.equal(await page.locator(".qf-host-filtered").first().evaluate((node) => getComputedStyle(node).display), "block");
    assert.equal(await page.locator('.qf-host-filtered article[data-testid="tweet"]').first().evaluate((node) => getComputedStyle(node).display), "none");
    const placeholderBox = await page.locator(".qf-placeholder").first().boundingBox();
    const hostBox = await page.locator(".qf-host-filtered").first().boundingBox();
    assert.ok(placeholderBox.height <= 40);
    assert.ok(Math.abs(placeholderBox.width - hostBox.width) <= 1);

    await page.evaluate(() => {
      const host = document.querySelector(".qf-host-filtered");
      host.querySelector(".qf-placeholder")?.remove();
      host.classList.remove("qf-host-filtered", "qf-host-action-collapse");
      host.querySelector("article")?.classList.remove("qf-filtered", "qf-action-collapse");
    });
    await page.waitForFunction(() => document.querySelectorAll(".qf-placeholder").length === 2);

    const restored = await page.evaluate(() => globalThis.__dispatchExtensionMessage({ type: "RESTORE_ALL" }));
    assert.equal(restored.restored, 2);
    assert.equal(await page.locator(".qf-placeholder").count(), 0);
  } finally {
    await browser.close();
  }
});

test("auto mode keeps filtering during continuous virtual-list mutations", { timeout: 30_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await installContentMocks(page, { ...testSettings(), autoMode: true });
    await page.setContent(`<!doctype html><main></main><div id="churn"></div>`);
    await injectContentScript(page);
    await page.evaluate(() => {
      const timer = setInterval(() => {
        document.querySelector("#churn").replaceChildren(document.createElement("i"));
      }, 20);
      setTimeout(() => clearInterval(timer), 1_200);
      document.querySelector("main").innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet">
        <a href="/brand">@brand</a><a href="/brand/status/201">time</a>
        <div data-testid="tweetText">立即购买</div><span>Ad</span></article></div>`;
    });
    await page.waitForFunction(() => document.querySelectorAll(".qf-placeholder").length === 1, null, { timeout: 800 });

    await page.evaluate(() => {
      document.querySelector('[data-testid="cellInnerDiv"]').innerHTML = `
        <article data-testid="tweet"><a href="/brand">@brand</a><a href="/brand/status/201">time</a>
        <div data-testid="tweetText">立即购买</div><span>Ad</span></article>`;
    });
    await page.waitForFunction(() =>
      document.querySelector('article[data-qf-item-id="201"]')?.dataset.qfState === "collapse" &&
      document.querySelectorAll(".qf-placeholder").length === 1
    );
  } finally {
    await browser.close();
  }
});

test("popup and redesigned control console load, edit and save settings", { timeout: 30_000 }, async () => {
  const server = await startStaticServer();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    await context.addInitScript(({ settings }) => {
      const stored = { ...settings };
      globalThis.__jingliuMock = { stored, permissionRequests: [], openedOptions: false };
      globalThis.chrome = {
        storage: { local: {
          get: async (defaults) => ({ ...(defaults || {}), ...stored }),
          set: async (values) => Object.assign(stored, values)
        } },
        permissions: {
          contains: async () => false,
          request: async (permission) => {
            globalThis.__jingliuMock.permissionRequests.push(permission);
            return true;
          }
        },
        tabs: {
          query: async () => [{ id: 7 }],
          sendMessage: async (_, message) => {
            if (message.type === "GET_PAGE_STATE") return { ok: true, available: 2, stats: { kept: 6, filtered: 2 } };
            if (message.type === "RESET_AND_RUN") return { ok: true, found: 8, stats: { kept: 5, filtered: 3 } };
            if (message.type === "RESTORE_ALL") return { ok: true, restored: 3, stats: { kept: 8, filtered: 0 } };
            return { ok: true };
          }
        },
        runtime: {
          openOptionsPage: () => { globalThis.__jingliuMock.openedOptions = true; },
          sendMessage: async (message) => message.type === "TEST_CONNECTION"
            ? { ok: true, model: message.config.model, ready: 0.99 }
            : { ok: false }
        }
      };
    }, {
      settings: {
        ...testSettings(),
        provider: "openrouter",
        apiEndpoint: "https://openrouter.ai/api/alpha/decisions",
        model: "~typesafe/jev-latest",
        autoMode: true,
        filterHistory: [{ timestamp: Date.now(), found: 8, kept: 5, filtered: 3 }],
        filterFeedback: [{ timestamp: Date.now(), reason: "low_signal" }]
      }
    });

    const popup = await context.newPage();
    await popup.goto(`${server.origin}/popup.html`);
    await waitForText(popup, "#status", "还有 2 条新内容待处理");
    assert.equal(await popup.locator("#autoTitle").innerText(), "已开启");
    assert.equal(await popup.locator("#pageSummary").innerText(), "本页：已折叠 2 · 已保留 6");

    const options = await context.newPage();
    await options.goto(`${server.origin}/options.html`);
    assert.equal(await options.locator("h1").innerText(), "过滤控制台");
    assert.equal(await options.locator("#overviewAuto").innerText(), "已开启");
    assert.equal(await options.locator("#overviewProvider").innerText(), "OpenRouter");
    assert.equal(await options.locator("#historyRuns").innerText(), "1");

    await options.locator('[data-preset="research"]').click();
    assert.equal(await options.locator("#overviewPreset").innerText(), "研究模式");
    assert.match(await options.locator("#profile").inputValue(), /缺乏技术细节/);
    await options.locator("#autoMode").setChecked(false, { force: true });
    assert.equal(await options.locator("#overviewAuto").innerText(), "已关闭");

    await options.locator('[data-provider="custom"]').click();
    await options.locator("#apiEndpoint").fill("https://custom.example/v1/systemone");
    await options.locator("#apiKey").fill("custom-test-key");
    assert.equal(await options.locator("#connectionState").innerText(), "已配置");
    await options.locator('button[type="submit"]').click();
    await waitForText(options, "#saveStatus", "已保存。回到 X");
    assert.equal(await options.evaluate(() => globalThis.__jingliuMock.stored.autoMode), false);
    assert.deepEqual(
      await options.evaluate(() => globalThis.__jingliuMock.permissionRequests),
      [{ origins: ["https://custom.example/*"] }]
    );
    await options.locator("#testConnection").click();
    await waitForText(options, "#saveStatus", "连接成功");
    assert.equal(await options.locator("#connectionState").innerText(), "连接正常");

    const downloadPromise = options.waitForEvent("download");
    await options.locator("#exportRules").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assert.equal(exported.product, "Jingliu");
    assert.equal(exported.rules.profile, await options.locator("#profile").inputValue());
    assert.equal("apiKey" in exported.rules, false);
    assert.equal("filterHistory" in exported.rules, false);

    const importedBackup = JSON.stringify({
      product: "Jingliu",
      schemaVersion: 1,
      rules: {
        activePreset: "research",
        autoMode: true,
        profile: "优先保留原始研究",
        keepRules: "论文与一手数据",
        hardBlockTerms: "抽奖",
        blockedAuthors: "@noise",
        alwaysKeepAuthors: "@researcher",
        filterAds: true,
        displayMode: "collapse",
        confidenceThreshold: 0.9,
        decisionPrompt: "保守判断"
      }
    });
    await options.locator("#rulesFile").setInputFiles({
      name: "jingliu-rules.json",
      mimeType: "application/json",
      buffer: Buffer.from(importedBackup)
    });
    await waitForText(options, "#saveStatus", "规则已导入");
    assert.equal(await options.locator("#profile").inputValue(), "优先保留原始研究");
    assert.equal(await options.locator("#overviewPreset").innerText(), "自定义");
    assert.equal(await options.locator("#confidenceValue").innerText(), "90%");
    assert.equal(await options.locator("#apiKey").inputValue(), "custom-test-key");
    assert.notEqual(await options.evaluate(() => globalThis.__jingliuMock.stored.profile), "优先保留原始研究");

    await options.locator('button[type="submit"]').click();
    await waitForText(options, "#saveStatus", "已保存。回到 X");
    assert.equal(await options.evaluate(() => globalThis.__jingliuMock.stored.profile), "优先保留原始研究");
  } finally {
    await browser.close();
    await server.close();
  }
});

async function installContentMocks(page, settings) {
  await page.evaluate(({ settings: values }) => {
    const listeners = [];
    globalThis.chrome = {
      storage: { local: { get: async (defaults) => ({ ...(defaults || {}), ...values }) } },
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(listener) },
        sendMessage: async (message) => {
          if (message.type !== "CLASSIFY_ITEMS") return { ok: true };
          return {
            ok: true,
            decisions: message.items.map((item) => ({
              id: item.id,
              action: item.text.includes("邀请码") ? "collapse" : "keep",
              reason: item.text.includes("邀请码") ? "commercial" : "allowed",
              confidence: 0.94,
              source: "jev"
            }))
          };
        }
      }
    };
    globalThis.__dispatchExtensionMessage = (message) => new Promise((resolve) => {
      for (const listener of listeners) {
        if (listener(message, {}, resolve)) return;
      }
      resolve(null);
    });
  }, { settings });
}

async function injectContentScript(page) {
  await page.addScriptTag({ path: path.join(extensionPath, "shared.js") });
  await page.addScriptTag({ path: path.join(extensionPath, "core.js") });
  await page.addStyleTag({ path: path.join(extensionPath, "content/x.css") });
  await page.addScriptTag({ path: path.join(extensionPath, "content/x.js") });
}

function testSettings() {
  return {
    provider: "typesafe",
    apiEndpoint: "https://api.typesafe.ai/v1/systemone",
    apiKey: "e2e-placeholder-key",
    model: "jev-latest",
    activePreset: "balanced",
    profile: "过滤广告、引流和低信息内容",
    keepRules: "保留原创技术分析",
    hardBlockTerms: "加群领资料",
    blockedAuthors: "",
    alwaysKeepAuthors: "@trusted",
    filterAds: true,
    autoMode: false,
    displayMode: "collapse",
    confidenceThreshold: 0.76,
    batchSize: 6,
    maxTextLength: 1400,
    decisionPrompt: "按用户政策保守判断。"
  };
}

function feedFixture() {
  const article = (handle, id, text, label = "") => `
    <div data-testid="cellInnerDiv" style="display:grid;grid-template-columns:1fr 1fr;width:600px">
      <article data-testid="tweet"><a href="/${handle}">@${handle}</a><a href="/${handle}/status/${id}">time</a>
      <div data-testid="tweetText">${text}</div>${label ? `<span>${label}</span>` : ""}</article>
    </div>`;
  return `<!doctype html><main>
    ${article("brand", "101", "新品发布", "Ad")}
    ${article("trusted", "102", "加群领资料")}
    ${article("seller", "103", "使用邀请码 ABC 可享折扣")}
  </main>`;
}

async function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    const requested = new URL(request.url, "http://127.0.0.1").pathname;
    const filePath = path.resolve(extensionPath, `.${requested}`);
    if (!filePath.startsWith(`${extensionPath}${path.sep}`)) return response.writeHead(403).end("Forbidden");
    try {
      const body = await fs.readFile(filePath);
      const type = filePath.endsWith(".js") ? "text/javascript" : filePath.endsWith(".css") ? "text/css" : "text/html";
      response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` }).end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function waitForText(page, selector, expected, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await page.locator(selector).textContent().catch(() => "");
    if (text.includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`等待 ${selector} 显示“${expected}”超时`);
}

async function launchBrowser() {
  const executablePath = await resolveBrowserExecutable();
  return chromium.launch({ executablePath, headless: true });
}

async function resolveBrowserExecutable() {
  if (!executablePathPromise) {
    executablePathPromise = (async () => {
      const candidates = [
        process.env.CHROME_PATH,
        chromium.executablePath(),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium"
      ].filter(Boolean);
      for (const candidate of candidates) {
        try {
          await fs.access(candidate);
          return candidate;
        } catch {
          // Try the next local browser.
        }
      }
      throw new Error("没有找到 Chrome/Chromium");
    })();
  }
  return executablePathPromise;
}
