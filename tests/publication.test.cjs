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
    citation_pdf_url: `https://tommasocerruti.github.io/publications/${slug}/${slug}.pdf`,
  })) assert.ok(head.includes(`<meta name="${name}" content="${content}"`), name);
  assert.ok(head.includes(`rel="canonical" href="https://tommasocerruti.github.io/publications/${slug}/"`));
  assert.ok(!/noindex/i.test(head));
  assert.ok(html.includes(`href="https://tommasocerruti.github.io/publications/${slug}/${slug}.pdf"`));
  const home = readFileSync(resolve(root, 'index.html'), 'utf8');
  assert.ok(home.includes(`href="/publications/${slug}/"`));
  assert.ok(home.includes(`href="/publications/${slug}/${slug}.pdf"`));
  assert.ok(!home.includes('Safety Evals and TTC'));
  const pdf = readFileSync(resolve(root, `papers/${slug}.pdf`));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length < 5 * 1024 * 1024);
});

// Any manual edit to either served copy must fail the check.
test('same-directory PDF matches the compatibility copy', () => {
  const primary = resolve(root, `publications/${slug}/${slug}.pdf`);
  assert.ok(existsSync(primary), 'same-directory PDF exists');
  assert.deepEqual(readFileSync(primary), readFileSync(resolve(root, `papers/${slug}.pdf`)));
});

test('publication provides a short abstract', () => {
  const html = readFileSync(resolve(root, `publications/${slug}/index.html`), 'utf8');
  const abstract = html.match(/<h2 id="abstract-heading">Abstract<\/h2>\s*<p>([^<]+)<\/p>/);
  assert.ok(abstract, 'Abstract section exists in static HTML');
  const count = abstract[1].trim().split(/\s+/).length;
  assert.ok(count >= 100 && count <= 150, `abstract word count: ${count}`);
});
