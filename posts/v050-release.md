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

Plasmate v0.5.0 is the release where SOM starts to feel like a complete interface layer, not just an extraction format.

Earlier versions proved the core idea: you can compile a web page into a semantic representation that is dramatically cheaper to feed to language models than raw HTML, while preserving the structures that matter for agent behavior. v0.5.0 tightens the last few weak links that show up when you build real agents:

- You need a dependable bridge back to the DOM when you execute actions in a browser.
- You need explicit state signals for modern component libraries.
- You need first class support for patterns used heavily in docs, especially disclosure widgets and tables.
- You need extraction that stays focused on the page, not on consent overlays.
- You need the headless runtime to behave like a real user browser, including Intl formatting.

This post is detailed release notes, with examples you can copy into your own stack.

## 1. html_id: bridging SOM semantics back to DOM automation

SOM elements already have stable, deterministic `id` values like `e_a3f8b2c1d4e5`. Those IDs are ideal for reasoning, caching, and multi-step workflows because they remain stable across snapshots.

But many execution environments still act on the DOM. Playwright locators, Puppeteer node handles, and in-browser JavaScript all need a concrete reference to a real DOM node.

### What changed

In v0.5.0, Plasmate adds an optional `html_id` field to every SOM element. If the underlying HTML element has an `id` attribute, Plasmate copies it into `html_id`.

HTML input:

```html
<form action="/subscribe" method="post">
  <input id="email" name="email" type="email" />
  <button id="submit-btn" type="submit">Subscribe</button>
</form>
```

SOM output (v0.5.0):

```json
{
  "role": "form",
  "attrs": {"action": "/subscribe", "method": "post"},
  "elements": [
    {
      "id": "e_6f2a1d",
      "role": "text_input",
      "html_id": "email",
      "text": "",
      "actions": ["type", "clear"],
      "attrs": {"name": "email", "type": "email"}
    },
    {
      "id": "e_a3f8b2",
      "role": "button",
      "html_id": "submit-btn",
      "text": "Subscribe",
      "actions": ["click"]
    }
  ]
}
```

If an element has no HTML id, `html_id` is omitted entirely.

### Why it matters

In practice, agent stacks have a two-layer architecture:

1. A reasoning layer that decides what to do, often based on SOM.
2. An execution layer that performs the actions.

Before v0.5.0, your execution layer had to recover a DOM handle using text selectors or complex attribute logic. That works sometimes, but it fails in cases that matter:

- Copy changes break text locators.
- Multiple elements share the same visible text.
- Visible text is empty, for example icon buttons.
- The element is in a sticky header repeated in multiple places.

`html_id` gives you a direct, deterministic mapping when it exists.

### Example: resolving in browser JavaScript

If your agent uses an in-browser action runner, you can now do:

```js
function clickByHtmlId(htmlId) {
  const el = document.getElementById(htmlId)
  if (!el) throw new Error(`Element not found: ${htmlId}`)
  el.click()
}

clickByHtmlId("submit-btn")
```

### Example: resolving in Playwright

```ts
// Suppose you already reasoned over SOM and picked a target element
const htmlId = somElement.html_id
if (!htmlId) throw new Error("No html_id available for this element")

await page.locator(`#${htmlId}`).click()
```

The stable SOM `id` is still the primary key for semantic workflows. `html_id` is the bridge for systems that need to cross into DOM-native execution.

This feature was contributed by Alan Hartless.

## 2. ARIA state preservation, seeing real UI state without guessing

Modern web apps often render custom widgets that are visually obvious to humans but semantically ambiguous in raw HTML. Component libraries frequently use ARIA attributes to expose state to assistive technologies, and those attributes are the most reliable way to know what is currently true.

Before v0.5.0, agents frequently had to infer UI state indirectly.

- Is the menu open? Look for the menu panel in the DOM.
- Is the accordion expanded? Search for the content text.
- Is this checkbox checked? Look for a class name like `is-checked`.

All of those heuristics are brittle.

### What changed

In v0.5.0, Plasmate captures common ARIA states and normalizes them under `attrs.aria`.

Example HTML:

```html
<button
  id="menu-toggle"
  aria-expanded="false"
  aria-controls="main-menu"
>
  Menu
</button>

<nav id="main-menu" hidden>
  <a href="/pricing">Pricing</a>
</nav>
```

SOM output:

```json
{
  "id": "e_toggle_9c1d",
  "role": "button",
  "html_id": "menu-toggle",
  "text": "Menu",
  "actions": ["click"],
  "attrs": {
    "aria": {
      "expanded": false,
      "controls": "main-menu"
    }
  }
}
```

When the menu is open, `expanded` becomes true.

### Supported states

Plasmate normalizes these ARIA state attributes:

- expanded
- selected
- checked
- disabled
- current
- pressed
- hidden

Booleans are converted to true or false when possible. String values are preserved when that is the meaningful representation.

### Why it matters

State is the difference between a good agent and a flaky agent.

An agent that cannot see state will often take redundant actions (clicking a menu that is already open), or it will fail by taking the wrong branch (trying to click a hidden tab panel).

With ARIA state captured, you can make your action planner explicit:

```python
def ensure_menu_open(toggle_el):
    aria = toggle_el.get("attrs", {}).get("aria", {})
    if aria.get("expanded") is True:
        return  # already open
    # otherwise click
    return {"action": "click", "target": toggle_el["id"]}
```

This is not just convenience. It reduces retries, avoids wasted navigation, and improves safety by preventing accidental actions.

## 3. Details and Summary support: disclosure widgets become actionable

If you scrape documentation pages, you already know the pattern.

- FAQs hide answers in disclosure widgets.
- Large docs pages hide code samples behind expandable sections.
- Release notes hide long blocks behind “show more” sections.

HTML has a native structure for this: `<details>` and `<summary>`.

### What changed

In v0.5.0, Plasmate emits a first class `details` element with an explicit `toggle` affordance and a structured set of attributes.

HTML input:

```html
<details>
  <summary>Click to expand</summary>
  <p>This content is hidden until expanded.</p>
</details>
```

SOM output:

```json
{
  "id": "e_details_42a1",
  "role": "details",
  "actions": ["toggle"],
  "text": "This content is hidden until expanded.",
  "attrs": {
    "open": false,
    "summary": "Click to expand"
  }
}
```

### Why it matters

Agents can now do the right thing without guessing:

- If the question requires the hidden content, toggle it.
- If the question is answered by visible content, skip toggling.

Even more important, the agent can see the hidden content as text without toggling. This reduces the need for multi-step browsing for simple reading tasks.

## 4. Better table extraction, with Wikipedia as the stress test

Tables are high-value content. They often carry the densest factual information on a page.

They are also hard to extract reliably, because real-world tables use captions, nested headers, and spans.

### What changed

v0.5.0 improves table extraction in practical ways:

- Larger maximum dimensions: 12 columns and 30 rows
- Better handling of colspan
- Caption extraction
- More consistent header detection

### Example: a common comparison table

HTML input (simplified):

```html
<table class="wikitable">
  <caption>Example Table</caption>
  <tr>
    <th>Language</th>
    <th>First appeared</th>
    <th>Typing</th>
  </tr>
  <tr>
    <td>Go</td>
    <td>2009</td>
    <td>Static</td>
  </tr>
  <tr>
    <td>Rust</td>
    <td>2010</td>
    <td>Static</td>
  </tr>
</table>
```

SOM output:

```json
{
  "id": "e_table_1a2b",
  "role": "table",
  "attrs": {
    "caption": "Example Table",
    "headers": ["Language", "First appeared", "Typing"],
    "rows": [
      ["Go", "2009", "Static"],
      ["Rust", "2010", "Static"]
    ]
  }
}
```

### Why it matters

Table fidelity affects downstream behavior:

- For question answering, header alignment determines correctness.
- For retrieval, row structure determines whether embeddings preserve relationships.
- For summarization, truncation can remove the most important facts.

Increasing the default table bounds reduces truncation on pages where the key information is in a larger comparison table.

## 5. GDPR and cookie banner stripping, reducing action confusion

Consent overlays are the worst kind of noise for agents.

- They contain lots of interactive elements, which look like task targets.
- They often sit above the main content.
- They change frequently and vary by region.

In raw HTML, a cookie banner often contributes thousands of tokens and dozens of clickable elements.

### What changed

In v0.5.0, Plasmate strips common GDPR and cookie banner patterns during SOM generation.

The goal is not censorship, it is focus. If a user asks an agent to summarize an article, the consent banner is irrelevant. If a user asks the agent to manage cookie preferences, you should fetch a representation that includes the banner, but that is a separate, explicit task.

### Why it matters

Removing consent UI improves:

- Token efficiency (less noise)
- Navigation reliability (fewer irrelevant click targets)
- Benchmark stability (consent UI changes often)

## 6. ICU and Intl support: making SPAs render correctly

A surprising number of pages rely on JavaScript Intl APIs for formatting.

If a headless environment lacks ICU data, calls like `new Intl.NumberFormat()` can fail or degrade. When that happens in a client-side app, you may see broken rendering, missing text, or thrown exceptions.

### What changed

v0.5.0 ensures ICU data is available before initialization so Intl formatting behaves as expected.

Plasmate also increases script fetch limits to better support large SPA bundles:

- 3MB per script
- 10MB total

### Why it matters

Plasmate is a compiler. If the input page does not render like a real browser, the compiled SOM cannot be accurate.

Intl support is one of those low-level compatibility fixes that unlocks a wide range of real-world sites.

## 7. WebTaskBench included for reproducibility

v0.5.0 includes WebTaskBench in the repository.

WebTaskBench is designed to answer a simple question with real numbers: does representation format change agent performance?

It measures token usage, latency, and task completion across 100 tasks and 50 URLs.

Key reference numbers:

- Average tokens: HTML 33,181; SOM 8,301; Markdown 4,542
- Claude Sonnet 4 latency: HTML 16.2 seconds; Markdown 25.2 seconds; SOM 8.5 seconds
- Compression ratio: navigation tasks 5.4x; adversarial tasks 6.0x

If you want to reproduce the results, you can run the benchmark suite and compare output.

## Backward compatibility and migration notes

v0.5.0 is designed to be additive. Existing SOM consumers should continue to work without changes.

- `html_id` is optional. If your parser ignores unknown fields, nothing changes.
- `attrs.aria` is also optional. It appears only when relevant ARIA attributes exist.
- The `details` role is new. If your code treats unknown roles as generic text nodes, you will still see the disclosure content, but you may not see the explicit `toggle` affordance. Updating your role handling to recognize `details` is recommended if you build navigation agents for documentation.

If you maintain a schema validator, update it to allow the new fields. A good pattern is to validate required fields strictly but allow additional properties so the format can evolve without breaking consumers.

If you maintain an execution layer that maps SOM elements to browser actions, the safest approach is:

- Prefer a stable SOM `id` for planning and caching.
- Use `html_id` as an execution hint when it exists and is unique.
- Fall back to other locator strategies when it does not.

This keeps your stack resilient on sites that do not use stable HTML IDs.

## Upgrade

To upgrade Plasmate:

```bash
npm install -g plasmate@latest
```

If you embed Plasmate as a library, update your dependency and regenerate your lockfile.

## Full changelog

The full list of commits is in GitHub Releases:

https://github.com/plasmate-labs/plasmate/releases

## Closing thoughts

SOM is useful when it is both semantically rich and operationally actionable.

v0.5.0 is about making the boundary clean.

- `html_id` connects semantic elements to the DOM for execution.
- ARIA state capture turns UI state into explicit data.
- Details and summary support makes docs patterns actionable.
- Table improvements make high-density pages extract cleanly.
- Consent stripping reduces noise and action confusion.
- ICU and script limits harden the renderer so you can trust the snapshot.

If you build agents that browse and act on real sites, these changes are the difference between demos and production behavior.

[GitHub](https://github.com/plasmate-labs/plasmate) | [Docs](https://docs.plasmate.app) | [npm](https://www.npmjs.com/package/plasmate)
