const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
const slug = 'safety-evals-should-project-test-time-compute';

test('publication exposes consistent Scholar metadata and crawlable PDF links', () => {
  const path = resolve(root, `publications/${slug}/index.html`);
  assert.ok(existsSync(path), 'static publication page exists');
  const html = readFileSync(path, 'utf8');
  const head = html.split('</head>')[0];
  for (const [name, content] of Object.entries({
    citation_title: 'Safety Evals Should Project Test-Time Compute',
    citation_author: 'Tommaso Cerruti',
    citation_publication_date: '2026/05/11',
    citation_pdf_url: `https://tommasocerruti.github.io/papers/${slug}.pdf`,
  })) assert.ok(head.includes(`<meta name="${name}" content="${content}"`), name);
  assert.ok(head.includes(`rel="canonical" href="https://tommasocerruti.github.io/publications/${slug}/"`));
  assert.ok(!/noindex/i.test(head));
  assert.ok(html.includes(`href="/papers/${slug}.pdf"`));
  const home = readFileSync(resolve(root, 'index.html'), 'utf8');
  assert.ok(home.includes(`href="/publications/${slug}/"`));
  assert.ok(home.includes(`href="/papers/${slug}.pdf"`));
  assert.ok(!home.includes('Safety Evals and TTC'));
  const pdf = readFileSync(resolve(root, `papers/${slug}.pdf`));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length < 5 * 1024 * 1024);
});
