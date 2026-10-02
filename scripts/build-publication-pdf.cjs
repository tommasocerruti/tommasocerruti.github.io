// Uses the existing Playwright dev dependency; no website build step is needed.
const { chromium } = require('playwright');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const slug = 'safety-evals-should-project-test-time-compute';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage();
    // The saved article and figures are self-contained; rebuilding needs no network.
    await page.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(resolve(__dirname, `../papers/source/${slug}/article.html`)).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    await page.pdf({
      path: resolve(__dirname, `../papers/${slug}.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#666"><span class="pageNumber"></span></div>',
    });
    console.log(`Generated papers/${slug}.pdf`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
