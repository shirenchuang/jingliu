import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const extensionRoot = path.join(projectRoot, "extension");
const outputRoot = path.join(projectRoot, "store-listing", "assets");
const { chromium } = require(path.join(extensionRoot, "node_modules", "playwright"));

await fs.mkdir(outputRoot, { recursive: true });
await fs.copyFile(path.join(extensionRoot, "icons", "icon-128.png"), path.join(outputRoot, "icon-128.png"));

const executablePath = await resolveBrowserExecutable();
const browser = await chromium.launch({ executablePath, headless: true });
const server = await startStaticServer();

try {
  await createProductScreenshots(browser, server.origin);
  await createPromoAssets(browser);
} finally {
  await browser.close();
  await server.close();
}

console.log(`Created Chrome Web Store assets in ${outputRoot}`);

async function createProductScreenshots(browserInstance, origin) {
  const context = await browserInstance.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addInitScript(({ settings }) => {
    const stored = { ...settings };
    globalThis.chrome = {
      storage: {
        local: {
          get: async (defaults) => ({ ...(defaults || {}), ...stored }),
          set: async (values) => Object.assign(stored, values)
        }
      },
      permissions: {
        contains: async () => true,
        request: async () => true
      },
      tabs: {
        query: async () => [{ id: 7 }],
        sendMessage: async (_, message) => {
          if (message.type === "GET_PAGE_STATE") return { ok: true, available: 18, stats: { kept: 43, filtered: 12 } };
          if (message.type === "RESET_AND_RUN") return { ok: true, found: 55, stats: { kept: 43, filtered: 12 } };
          if (message.type === "RESTORE_ALL") return { ok: true, restored: 12, stats: { kept: 55, filtered: 0 } };
          return { ok: true };
        }
      },
      runtime: {
        openOptionsPage: () => {},
        sendMessage: async (message) => message.type === "TEST_CONNECTION"
          ? { ok: true, model: message.config.model, ready: 0.99 }
          : { ok: false }
      }
    };
  }, {
    settings: {
      provider: "openrouter",
      apiEndpoint: "https://openrouter.ai/api/alpha/decisions",
      apiKey: "",
      model: "~typesafe/jev-latest",
      activePreset: "research",
      profile: "隐藏软广、课程推广、情绪化争吵和没有信息增量的内容。",
      keepRules: "优先保留 AI、机器人、开发工具、原创技术分析与一手研究。",
      hardBlockTerms: "加群领资料\n限时优惠\n私信领取",
      blockedAuthors: "@noise_account",
      alwaysKeepAuthors: "@researcher\n@open_source",
      filterAds: true,
      autoMode: true,
      displayMode: "collapse",
      confidenceThreshold: 0.82,
      batchSize: 6,
      maxTextLength: 1400,
      decisionPrompt: "按用户政策保守判断；有明确技术信息或一手来源时优先保留。",
      filterHistory: [
        { timestamp: Date.now() - 86_400_000, found: 48, kept: 38, filtered: 10 },
        { timestamp: Date.now(), found: 55, kept: 43, filtered: 12 }
      ],
      filterFeedback: [{ timestamp: Date.now(), reason: "low_signal" }]
    }
  });

  const page = await context.newPage();
  await page.goto(`${origin}/options.html`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(outputRoot, "screenshot-1-overview.png") });

  await page.locator("#rules").evaluate((element) => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, element.offsetTop - 78);
  });
  await page.screenshot({ path: path.join(outputRoot, "screenshot-2-rules.png") });

  await page.locator("#jev").evaluate((element) => window.scrollTo(0, element.offsetTop - 78));
  await page.screenshot({ path: path.join(outputRoot, "screenshot-3-jev.png") });
  await context.close();
}

async function createPromoAssets(browserInstance) {
  const icon = await fs.readFile(path.join(extensionRoot, "icons", "icon-128.png"));
  const iconData = `data:image/png;base64,${icon.toString("base64")}`;

  const small = await browserInstance.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await small.setContent(promoDocument({ iconData, variant: "small" }));
  await small.screenshot({ path: path.join(outputRoot, "small-promo-440x280.png") });
  await small.close();

  const marquee = await browserInstance.newPage({ viewport: { width: 1400, height: 560 }, deviceScaleFactor: 1 });
  await marquee.setContent(promoDocument({ iconData, variant: "marquee" }));
  await marquee.screenshot({ path: path.join(outputRoot, "marquee-1400x560.png") });
  await marquee.close();
}

function promoDocument({ iconData, variant }) {
  const marquee = variant === "marquee";
  return `<!doctype html>
  <html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{background:#f1f5f8;color:#101820;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .frame{height:100%;position:relative;padding:${marquee ? "66px 86px" : "25px 28px"};display:flex;align-items:center;overflow:hidden}
    .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(16,24,32,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(16,24,32,.055) 1px,transparent 1px);background-size:${marquee ? "56px 56px" : "28px 28px"};mask-image:linear-gradient(90deg,#000,transparent 84%)}
    .signal{position:absolute;top:0;left:0;height:${marquee ? "14px" : "8px"};width:100%;display:flex}.signal i{display:block}.signal i:nth-child(1){background:#315efb;width:58%}.signal i:nth-child(2){background:#f2b24b;width:18%}.signal i:nth-child(3){background:#64d6bf;width:9%}
    .copy{position:relative;z-index:2;max-width:${marquee ? "790px" : "275px"}}
    .label{color:#315efb;font:800 ${marquee ? "15px" : "9px"}/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;margin-bottom:${marquee ? "24px" : "12px"}}
    h1{font-family:"Arial Narrow","Avenir Next Condensed",sans-serif;font-size:${marquee ? "104px" : "46px"};letter-spacing:-.055em;line-height:.84;margin:0;text-transform:uppercase}
    h1 span{display:block;color:#315efb}
    p{color:#4f5e69;font-size:${marquee ? "24px" : "12px"};font-weight:620;line-height:1.45;margin:${marquee ? "28px" : "15px"} 0 0;max-width:${marquee ? "680px" : "245px"}}
    .chips{display:flex;gap:${marquee ? "12px" : "6px"};margin-top:${marquee ? "30px" : "16px"}}.chips b{background:#fff;border:1px solid #d9e2e8;border-radius:999px;font-size:${marquee ? "15px" : "8px"};padding:${marquee ? "11px 16px" : "6px 8px"}}
    .icon{position:absolute;z-index:2;right:${marquee ? "100px" : "27px"};top:${marquee ? "92px" : "30px"};width:${marquee ? "250px" : "82px"};height:${marquee ? "250px" : "82px"};border-radius:${marquee ? "54px" : "20px"};box-shadow:0 ${marquee ? "34px 72px" : "18px 36px"} rgba(16,24,32,.18)}
    .orb{position:absolute;right:${marquee ? "-80px" : "-32px"};bottom:${marquee ? "-210px" : "-70px"};width:${marquee ? "540px" : "190px"};height:${marquee ? "540px" : "190px"};border:1px solid rgba(49,94,251,.24);border-radius:50%;box-shadow:inset 0 0 0 ${marquee ? "52px" : "18px"} rgba(49,94,251,.055),inset 0 0 0 ${marquee ? "104px" : "36px"} rgba(100,214,191,.055)}
  </style></head><body><main class="frame"><div class="grid"></div><div class="signal"><i></i><i></i><i></i></div>
    <div class="copy"><div class="label">AI FEED FILTER · OPEN SOURCE</div><h1>JINGLIU<span>QUIET THE FEED.</span></h1><p>Local rules first. Your Jev when needed. Every filtered post stays reversible.</p><div class="chips"><b>X / Twitter</b><b>TypeSafe</b><b>OpenRouter</b></div></div>
    <img class="icon" src="${iconData}" alt=""><div class="orb"></div>
  </main></body></html>`;
}

async function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    const requested = new URL(request.url, "http://127.0.0.1").pathname;
    const filePath = path.resolve(extensionRoot, `.${requested}`);
    if (!filePath.startsWith(`${extensionRoot}${path.sep}`)) return response.writeHead(403).end("Forbidden");
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

async function resolveBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
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
  throw new Error("No local Chrome or Chromium executable was found.");
}
