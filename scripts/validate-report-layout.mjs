import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm run qa:report-layout -- <authenticated report or print URL>");
  process.exit(2);
}

const browser = await playwright.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector(".report-a4-page", { timeout: 60000 });
  const result = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll(".report-a4-page"));
    const failures = [];
    pages.forEach((page, index) => {
      const body = page.querySelector(".report-a4-page-body");
      if (!body) return;
      if (body.scrollHeight > body.clientHeight + 2) failures.push(`Page ${index + 1}: vertical content overflow`);
      if (body.scrollWidth > body.clientWidth + 2) failures.push(`Page ${index + 1}: horizontal content overflow`);
      const pageRect = page.getBoundingClientRect();
      for (const element of Array.from(body.querySelectorAll("h1,h2,h3,p,li,article,table,img"))) {
        const rect = element.getBoundingClientRect();
        if (rect.right > pageRect.right + 2 || rect.left < pageRect.left - 2) {
          failures.push(`Page ${index + 1}: element escapes page bounds`);
          break;
        }
      }
    });
    return { pageCount: pages.length, failures };
  });
  if (!result.pageCount || result.failures.length) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Report layout QA passed for ${result.pageCount} pages.`);
  }
} finally {
  await browser.close();
}
