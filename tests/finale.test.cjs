// Run npm install, npx playwright install chromium, then npm test.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE can select an existing Chrome installation.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');

let server, browser, origin;
before(async () => {
  const root = resolve(__dirname, '..');
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + '/')) throw new Error('Outside root');
      const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
      res.setHeader('Content-Type', type[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
});
after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }));
}

async function drawing(page) {
  return page.locator('#finale').evaluate(svg => {
    const paths = [...svg.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect')];
    const shown = paths.map(path => {
      const style = getComputedStyle(path);
      return style.visibility === 'hidden' ? 0 : 1 - parseFloat(style.strokeDashoffset) / path.getTotalLength();
    });
    return {
      count: paths.length,
      complete: shown.filter(p => p > 0.999).length,
      visible: shown.filter(p => p > 0).length,
      amount: shown.reduce((a, b) => a + b, 0),
      normalized: paths.some(path => path.hasAttribute('pathLength')),
      boat: svg.querySelector('[data-finale-boat]').getAttribute('transform'),
    };
  });
}

test('scroll reveals the artwork progressively, stays anchored during the boat drift, and reverses', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  assert.equal(await page.locator('#finale-sec').count(), 1, 'Finale must be integrated');
  const start = await drawing(page);
  assert.ok(start.count > 0);
  assert.equal(start.visible, 0);
  assert.equal(start.normalized, false);
  const top = await page.locator('#finale-sec').evaluate(el => el.offsetTop);
  const bottom = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const middleY = (top - 900 + bottom) / 2;
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), middleY);
  await settle(page);
  const middle = await drawing(page);
  assert.ok(middle.amount > 0 && middle.complete < middle.count);
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), middleY + 30);
  await settle(page);
  assert.ok((await drawing(page)).amount > middle.amount);
  assert.equal((await drawing(page)).boat, middle.boat, 'Boat waits until the drawing is complete');
  // The scene must stay anchored to the document while only the boat moves.
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), bottom - 40);
  await settle(page);
  const anchoredTop = await page.locator('#finale').evaluate(el => el.getBoundingClientRect().top + scrollY);
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), bottom - 10);
  await settle(page);
  assert.ok(Math.abs(await page.locator('#finale').evaluate(el => el.getBoundingClientRect().top + scrollY) - anchoredTop) < 1,
    'Only the boat moves; the illustration does not shift relative to the text');
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await settle(page);
  const end = await drawing(page);
  assert.equal(end.complete, end.count);
  assert.notEqual(end.boat, middle.boat);
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), middleY);
  await settle(page);
  assert.ok(Math.abs((await drawing(page)).amount - middle.amount) < 0.1);
  assert.deepEqual(errors, []);
  await page.close();
});

test('mobile and landscape reach the completed artwork without horizontal overflow', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto(origin);
    await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await settle(page);
    const end = await drawing(page);
    assert.equal(end.complete, end.count);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const art = await page.locator('#finale').boundingBox();
    assert.ok(art.width <= viewport.width && art.height < viewport.height);
  }
  await page.close();
});

test('reduced motion shows a static drawing and responds to preference changes', async () => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(origin);
  const initial = await drawing(page);
  assert.equal(initial.complete, initial.count);
  assert.equal(await page.locator('.finale-pin').evaluate(el => getComputedStyle(el).position), 'static');
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await settle(page);
  assert.equal((await drawing(page)).boat, initial.boat);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.querySelector('#finale-sec').classList.contains('is-animated'));
  await settle(page);
  assert.equal((await drawing(page)).visible, 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('#finale-sec').classList.contains('is-animated'));
  await settle(page);
  assert.equal((await drawing(page)).complete, initial.count);
  await page.close();
});

test('the original artwork remains visible when JavaScript is unavailable', async () => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.goto(origin);
  const art = await drawing(page);
  assert.equal(art.complete, art.count);
  assert.equal(await page.locator('.finale-pin').evaluate(el => getComputedStyle(el).position), 'static');
  await page.close();
});

test('a half-drawn stroke is visibly half drawn when the SVG is scaled down', async () => {
  const page = await browser.newPage();
  await page.setContent(`
    <link rel="stylesheet" href="${origin}/styles.css">
    <svg class="finale-art" viewBox="0 0 1000 100" style="width:500px;height:50px">
      <path d="M 0 50 L 1000 50"
        style="stroke:#000;stroke-width:12px;stroke-dasharray:1000 1000;stroke-dashoffset:500" />
    </svg>`);
  const screenshot = await page.locator('svg').screenshot();
  const samples = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + base64;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return [125, 375].map(x => ctx.getImageData(x, 25, 1, 1).data[0]);
  }, screenshot.toString('base64'));
  assert.ok(samples[0] < 30, 'First quarter of the stroke is painted');
  assert.ok(samples[1] > 240, 'Last quarter stays blank at halfway progress');
  await page.close();
});
