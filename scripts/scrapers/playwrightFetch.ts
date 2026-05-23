import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "playwright";
import { parse } from "node-html-parser";

chromium.use(StealthPlugin());

let browser: Browser | null = null;

async function getBrowser() {
  if (!browser) {
    const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
    browser = await chromium.launch({ headless }) as unknown as Browser;
  }
  return browser;
}

export async function playwrightFetchHtml(url: string) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    return parse(await page.content());
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  await browser?.close();
  browser = null;
}
