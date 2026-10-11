// Renders manual-th.html (paged.js) to ../user-manual-th.pdf with a locally installed Chrome.
// Usage: npm install && npm run build   (CHROME_PATH overrides the Chrome location)
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "manual-th.html");
const out = process.argv[2] ?? path.join(dir, "..", "user-manual-th.pdf");
const executablePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await chromium.launch({ executablePath, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.pagedDone, null, { timeout: 180000 });
console.log("pages", await page.evaluate(() => document.querySelectorAll(".pagedjs_page").length));
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
await browser.close();
console.log("wrote", out);
