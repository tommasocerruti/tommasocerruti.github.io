# Safety Evals Should Project Test-Time Compute

`article.html` is the printable author version of Tommaso Cerruti's Hugging Face Community Article, published May 11, 2026:
https://huggingface.co/blog/Cerru02/safety-evals-should-project-ttc

The article body, summary, tables, figure captions, citation block, and all 12 references were retrieved from the original article on October 2, 2026. The two original figures are saved alongside the source. Only presentation and site navigation were changed: Hugging Face navigation was removed, rendered equations were converted to their original native MathML, and an author-version title/date/note was added. The article text and references were not rewritten.

From the repository root:

```sh
npm ci
npx playwright install chromium
node scripts/build-publication-pdf.cjs
```

To use an existing Chrome installation instead of downloading Chromium:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/build-publication-pdf.cjs
```

The rebuild uses local source and figures without network access. It writes `publications/safety-evals-should-project-test-time-compute/safety-evals-should-project-test-time-compute.pdf` and copies the identical bytes to `papers/safety-evals-should-project-test-time-compute.pdf` for backwards compatibility. Both files must be included with the static website files. The publication test fails if their bytes differ; do not edit either PDF independently. Browser versions and installed fonts can affect pagination; this is a reproducible generation process, not a promise of byte-identical PDF files. No build is required to serve the website.
