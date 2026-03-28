---
title: "Plasmate v0.5.0: DOM Bridge, ARIA States, and Details/Summary Support"
slug: v050-release
date: 2026-03-28
author: David Hurley
author_url: https://timespent.xyz
summary: "v0.5.0 adds html_id for DOM resolution, ARIA state preservation, details/summary extraction, improved Wikipedia tables, GDPR banner stripping, and ICU/Intl support for JS-heavy SPAs."
tags: [announcement, release, plasmate, som]
category: announcement
---

Plasmate v0.5.0 is a big release. Here's what's new.

## html_id -- bridge SOM back to the DOM

SOM elements now include an optional `html_id` field that preserves the original HTML `id` attribute from the source element.

```json
{
  "id": "e_a3f8b2c1d4e5",
  "role": "button",
  "html_id": "submit-btn",
  "text": "Submit",
  "actions": ["click"]
}
```

The stable SOM `id` is still there for cross-snapshot consistency. The new `html_id` gives agents a direct path back to the DOM when they need to interact -- via `document.getElementById()`, CSS selectors, or Playwright locators.

This was contributed by Alan Hartless -- thank you.

## ARIA state preservation

SOM now captures common ARIA state attributes on any element:

```json
{
  "role": "button",
  "text": "Menu",
  "attrs": {
    "aria": {
      "expanded": false,
      "pressed": false
    }
  }
}
```

Supported states: `expanded`, `selected`, `checked`, `disabled`, `current`, `pressed`, `hidden`. Boolean values are normalized. String values like `aria-current="page"` are preserved as-is.

This means agents can understand dynamic widget state -- whether an accordion is open, whether a tab is selected, whether a toggle is active -- without executing JavaScript.

## details/summary extraction

HTML `<details>`/`<summary>` disclosure widgets are now represented as a first-class interactive element:

```json
{
  "role": "details",
  "text": "Full content inside the disclosure...",
  "actions": ["toggle"],
  "attrs": {
    "open": false,
    "summary": "Click to expand"
  }
}
```

The `open` attribute reflects the current expanded/collapsed state. MDN docs, GitHub READMEs, and many documentation sites use these extensively.

## Improved table extraction

Tables now support:

- **12 columns** (up from 8) and **30 rows** (up from 20)
- **colspan handling** -- cells that span multiple columns are expanded correctly
- **Table captions** -- extracted from `<caption>` elements

This substantially improves SOM output for Wikipedia and data-heavy pages.

## GDPR/cookie banner stripping

Cookie consent banners, GDPR notices, and privacy popups are now automatically stripped from SOM output. These overlays add noise without adding meaning.

## ICU/Intl support for JS-heavy sites

V8's ICU data is now loaded before initialization, fixing `Intl.NumberFormat`, `Intl.DateTimeFormat`, and related APIs for JavaScript-heavy SPAs. Combined with raised script fetch limits (3MB per script, 10MB total), Plasmate now handles large single-page applications like Khan Academy.

## WebTaskBench

This release includes [WebTaskBench](https://github.com/plasmate-labs/plasmate/tree/master/benchmarks/webtaskbench), an open benchmark for measuring how web representations affect agent task performance. Results across GPT-4o and Claude Sonnet 4 are published in our [benchmark blog post](https://blog.plasmate.app/html-vs-markdown-vs-som/).

## Upgrade

```bash
npm install -g plasmate@latest
```

## Full changelog

See [GitHub releases](https://github.com/plasmate-labs/plasmate/releases) for the complete diff.

---

[GitHub](https://github.com/plasmate-labs/plasmate) -- [Docs](https://docs.plasmate.app) -- [npm](https://www.npmjs.com/package/plasmate)
