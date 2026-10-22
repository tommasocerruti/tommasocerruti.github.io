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
    const paths = [...svg.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect')]
      .filter(path => !path.closest('[data-no-draw]'));
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

// A disabled trigger must not capsize an unfinished drawing; activation must
// stay in this document, remain broken after Escape, and reset only on reload.
test('the boat only capsizes a completed drawing, supports the keyboard, and resets on refresh', async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  const boat = page.locator('.finale-boat-link');
  assert.equal(await boat.getAttribute('role'), 'button');
  assert.equal(await boat.getAttribute('aria-disabled'), 'true');
  assert.equal(await boat.getAttribute('tabindex'), '-1');
  await boat.dispatchEvent('click');
  assert.equal(await page.locator('.gravity-scene').count(), 0);
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await settle(page);
  assert.equal(await boat.getAttribute('aria-disabled'), 'false');
  await boat.focus();
  await page.keyboard.press('Space');
  await page.locator('.gravity-scene').waitFor();
  assert.equal(page.context().pages().length, 1, 'No external navigation');
  assert.equal(await page.locator('main').evaluate(el => el.inert), true);
  assert.equal(await page.locator('.gravity-scene button, .gravity-scene a').count(), 0, 'No reset control');
  await page.keyboard.press('Escape');
  await boat.dispatchEvent('click');
  assert.equal(await page.locator('.gravity-scene').count(), 1, 'Escape and repeat activation cannot restore or duplicate the scene');
  await page.reload();
  assert.equal(await page.locator('.gravity-scene').count(), 0);
  assert.equal(await page.locator('main').evaluate(el => el.inert), false);
  assert.deepEqual(errors, []);
  await page.close();
});

async function capsize(page) {
  await page.goto(origin);
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await settle(page);
  await page.locator('.finale-boat-link').click();
  await page.locator('.gravity-scene').waitFor();
}

// Removing the physics update or the artwork capture must stop this passing.
test('capsizing turns the real text and illustration into moving debris', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await capsize(page);
  assert.ok(await page.locator('.gravity-word').count() > 50, 'Real page words become individual bodies');
  assert.ok(await page.locator('.gravity-shard').count() > 10, 'The illustration shatters too');
  assert.ok((await page.locator('.gravity-word').allTextContents()).join(' ').includes('research'));
  assert.equal(await page.locator('.gravity-boat').count(), 0);
  assert.equal(await page.locator('.gravity-note').count(), 0);
  const shard = page.locator('.gravity-shard').first();
  const before = await shard.getAttribute('style');
  await page.waitForTimeout(1100);
  assert.notEqual(await shard.getAttribute('style'), before, 'Debris actually moves');
  await page.waitForTimeout(3500);
  const pile = await page.locator('.gravity-piece').evaluateAll(els => els.filter(el => {
    const r = el.getBoundingClientRect();
    return r.top >= innerHeight / 2 && r.bottom <= innerHeight + 15;
  }).length);
  assert.ok(pile > 20, 'Debris lands inside the viewport');
  await page.close();
});

async function grabbablePoint(page) {
  return page.locator('.gravity-piece').evaluateAll(els => {
    for (const el of els.toReversed()) {
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (x > 15 && x < innerWidth - 15 && y > 100 && y < innerHeight - 15 && document.elementFromPoint(x, y) === el) {
        el.dataset.grabTest = 'true';
        return { x, y };
      }
    }
  });
}

// Catch a disconnected pointer constraint, or navigation when grabbing text.
test('wreckage can be picked up and thrown with the mouse', async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await capsize(page);
  await page.waitForTimeout(4500);
  const point = await grabbablePoint(page);
  assert.ok(point, 'A landed piece is reachable');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(600, 240, { steps: 25 });
  await page.waitForTimeout(350);
  const held = await page.locator('[data-grab-test]').boundingBox();
  assert.ok(Math.abs(held.x + held.width / 2 - 600) < 100, 'Grabbed piece follows the mouse horizontally');
  assert.ok(Math.abs(held.y + held.height / 2 - 240) < 100, 'Grabbed piece lifts out of the pile');
  await page.mouse.up();
  await page.waitForTimeout(800);
  const released = await page.locator('[data-grab-test]').boundingBox();
  assert.ok(released.y > held.y + 40, 'Released debris falls again');
  assert.equal(page.url(), origin + '/');
  await page.close();
});

// No motion preference may accidentally start a rapid collapse or an idle loop.
test('reduced motion gets static wreckage that can still be moved without a restore control', async () => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await capsize(page);
  const debris = page.locator('.gravity-piece').first();
  const initial = await debris.getAttribute('style');
  await page.waitForTimeout(400);
  assert.equal(await debris.getAttribute('style'), initial);
  assert.equal(await page.locator('.gravity-scene').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
  const point = await grabbablePoint(page);
  assert.ok(point);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(300, 200, { steps: 10 });
  await page.mouse.up();
  const moved = await page.locator('[data-grab-test]').boundingBox();
  assert.ok(moved.y < 260, 'Static debris still follows a deliberate drag');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(300);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle(page);
  const frozen = await debris.getAttribute('style');
  await page.waitForTimeout(300);
  assert.equal(await debris.getAttribute('style'), frozen, 'Changing the preference freezes the current wreckage');
  assert.equal(await page.locator('.gravity-scene').count(), 1);
  await page.close();
});

test('grabbing the rendered edge picks up the piece under the pointer', async () => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await capsize(page);
  const point = await page.locator('.gravity-word').evaluateAll(els => {
    for (const el of els.toReversed()) {
      const rect = el.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(el).transform);
      const inset = -el.offsetHeight * 0.46;
      const x = rect.x + rect.width / 2 - matrix.b * inset;
      const y = rect.y + rect.height / 2 + matrix.a * inset;
      if (x > 10 && x < innerWidth - 10 && y > 100 && y < innerHeight - 10 && document.elementFromPoint(x, y) === el) {
        el.dataset.edgeTest = 'true';
        return { x, y };
      }
    }
  });
  assert.ok(point, 'A rendered word edge is reachable');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  assert.equal(await page.locator('[data-edge-test]').evaluate(el => el.classList.contains('is-held')), true);
  await page.mouse.up();
  await page.close();
});

test('shrinking a settled desktop pile keeps debris above the new floor', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => {
    let seed = 1;
    Math.random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
  });
  await page.clock.install();
  await capsize(page);
  await page.clock.runFor(18000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.runFor(18000);
  const lost = await page.locator('.gravity-piece').evaluateAll(els => els.filter(el => el.getBoundingClientRect().top > innerHeight).length);
  assert.equal(lost, 0, 'No piece tunnels through the resized floor');
  await page.close();
});

// Real touch input must drag debris instead of scrolling; rotating the device
// must keep the floor and scene within the new viewport.
test('the boat and wreckage work with touch and survive a viewport rotation', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await settle(page);
  await page.locator('.finale-boat-link').tap();
  await page.locator('.gravity-scene').waitFor();
  await page.waitForTimeout(4500);
  const cdp = await page.context().newCDPSession(page);
  const point = await grabbablePoint(page);
  assert.ok(point);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + (195 - point.x) * i / 16, y: point.y + (200 - point.y) * i / 16 }] });
  }
  await page.waitForTimeout(350);
  const held = await page.locator('[data-grab-test]').boundingBox();
  assert.ok(held.y < 300, 'A touch drag lifts the wreckage');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.setViewportSize({ width: 844, height: 390 });
  await settle(page);
  const scene = await page.locator('.gravity-scene').boundingBox();
  assert.equal(scene.width, 844);
  assert.equal(scene.height, 390);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  await page.close();
});

test('without JavaScript the artwork remains readable and the boat does not navigate away', async () => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.goto(origin);
  const boat = page.locator('.finale-boat-link');
  assert.equal(await boat.getAttribute('href'), null);
  assert.equal(await boat.getAttribute('aria-disabled'), 'true');
  assert.equal((await drawing(page)).complete, (await drawing(page)).count);
  await page.close();
});
