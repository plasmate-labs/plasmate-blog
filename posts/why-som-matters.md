---
title: "Why SOM Matters: The Case for a Semantic Web Format for AI Agents"
slug: why-som-matters
date: 2026-03-20
author: David Hurley
author_url: https://timespent.xyz
summary: "HTML was designed for browsers. Markdown was designed for humans. Neither was designed for AI agents. SOM is the missing format for the fourth consumer of the web."
tags: [som, deep-dive, web-format, ai-agents]
category: deep-dive
---

The web has evolved through three eras of consumption, each driven by a new class of consumer that needed the web to speak its language.

In the first era, **browsers** consumed HTML and rendered it into pixels on a screen. HTML was purpose-built for this: it encodes layout, typography, color, interactivity, and visual hierarchy. The entire specification assumes a human will look at the result.

In the second era, **search engines** needed to index and rank web content. HTML alone was not sufficient because search engines do not render pages visually. Publishers responded by adding structured metadata: sitemaps told crawlers which pages existed, robots.txt defined access rules, and Schema.org markup embedded machine-readable facts directly into HTML. These additions were designed specifically for non-human consumers.

In the third era, **applications** needed to consume web data programmatically. REST APIs, GraphQL endpoints, and webhooks emerged as purpose-built interfaces for machine-to-machine communication. No one expected an application to parse HTML to get structured data.

Now we are entering the fourth era. **AI agents** browse the web, read pages, reason about content, and take actions. They are fundamentally different from every prior consumer. They are not rendering pixels. They are not building an index. They are not calling a structured API. They are reading page content and using it as context for language model reasoning.

And they have no format designed for them.

## What breaks when you feed HTML to an LLM

The problems with raw HTML as LLM input are both quantitative and qualitative.

### The token cost problem

A typical web page contains 200KB to 400KB of HTML. After tokenization with cl100k_base (the tokenizer used by GPT-4 and similar models), this translates to 30,000 to 60,000 tokens. In our WebTaskBench evaluation across 50 real websites, the average was 33,181 input tokens per page.

The vast majority of these tokens encode information that is irrelevant to agent reasoning:

**CSS class names** make up a significant fraction of modern HTML. A single Tailwind CSS element might carry `class="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50"`. That is 25 tokens encoding visual presentation that an LLM cannot see and does not need.

**JavaScript** is embedded inline or referenced via script tags. React, Vue, and Angular applications often include hundreds of kilobytes of application code in the HTML response. None of this is useful as LLM context.

**Tracking and analytics markup** includes data attributes, pixel images, event handlers, and embedded JSON blobs for tools like Google Analytics, Segment, Hotjar, and dozens of others.

**Navigation boilerplate** is repeated on every page of a site. The header, footer, sidebar, and cookie consent banner appear identically across thousands of pages but consume tokens on every fetch.

**Advertising markup** on media sites can account for 30% to 50% of the total HTML, including ad containers, auction scripts, and fallback content.

The practical consequence is that agents burn through context windows and API budgets on noise. At $3 per million input tokens, processing 1,000 pages of raw HTML costs approximately $100. The same pages in SOM cost approximately $25.

### The ambiguity problem

Beyond cost, raw HTML creates ambiguity that degrades agent performance. Consider a simple task: "Click the login button on this page."

In HTML, the login button might be:

```html
<button class="btn btn-primary sc-gsnTZi hover:bg-blue-600">Log In</button>
```

Or it might be:

```html
<a href="/login" class="nav-link">Log In</a>
```

Or it might be:

```html
<div role="button" tabindex="0" onclick="showLoginModal()">Log In</div>
```

Or it might be a `<span>` with a click handler. Or an `<input type="submit">`. The model has to reason about which HTML patterns constitute "a button" across every possible site. This reasoning consumes tokens and time, and it is error-prone.

### The interaction gap

The most fundamental problem is that HTML does not explicitly declare what an agent can do. A `<button>` element is clickable, but the HTML does not say so. The model has to know from training data that buttons are clickable. A `<select>` element has options, but the available actions (selecting one, selecting multiple) are implicit in the element type and attributes.

For sophisticated multi-step workflows (filling a form, navigating a checkout flow, searching and filtering results), the model must maintain a mental model of what is interactive and what actions each element supports. This is cognitive overhead that consumes tokens and introduces errors.

## What breaks when you use Markdown

Markdown is the most common alternative to raw HTML for LLM web consumption. Tools like Jina Reader, Firecrawl, and various scraping libraries convert HTML to Markdown before passing it to models.

Markdown solves the cost problem. In our benchmark, Markdown averages 4,542 tokens per page, which is 7.3x fewer than HTML. That is a significant improvement.

But Markdown introduces three new problems.

### Loss of interactivity

Markdown has no concept of buttons, form fields, dropdowns, checkboxes, or any interactive element. A button labeled "Add to Cart" becomes plain text:

```markdown
Add to Cart
```

Is that a heading? A paragraph? A button? The model cannot tell. For any task that requires the agent to interact with a page (clicking, typing, selecting, toggling), Markdown provides no information about what is interactive or what actions are available.

### Loss of page structure

Markdown preserves some text hierarchy through headings, but it flattens the semantic structure of the page. There is no concept of "navigation region" or "main content area" or "sidebar." An agent that needs to focus on the main article content has to scan the entire Markdown output and infer which parts are the article versus the navigation versus the footer.

### Surprising latency consequences

In our WebTaskBench evaluation, Markdown was the slowest format on Claude Sonnet 4, averaging 25.2 seconds per task. This is slower than raw HTML at 16.2 seconds, despite Markdown being 7.3x smaller.

The likely explanation is that Claude spends additional reasoning time trying to reconstruct page structure and interactivity from ambiguous text. When the task involves navigation or interaction, the model has to work harder to figure out what it can do, and this reasoning time exceeds the time saved from processing fewer tokens.

SOM, by contrast, averaged 8.5 seconds on Claude. Structured input with explicit roles and actions reduces the model's reasoning burden.

## What SOM provides

SOM is designed to give AI agents exactly the information they need and nothing they do not. It is structured around six core concepts.

### Semantic regions

Every page is divided into regions with explicit roles:

Roles and meanings:

- `navigation`: site or page navigation links
- `main`: primary content area
- `header`: page or site header
- `footer`: page or site footer
- `aside`: sidebar or supplementary content
- `form`: a form with interactive controls
- `dialog`: a modal or overlay
- `content`: fallback for unclassified elements

An agent that needs to read the main article goes straight to the `main` region. An agent that needs to navigate goes to `navigation`. There is no scanning or inference required.

### Typed elements

Every element within a region declares its semantic role:

```json
{
  "id": "e_a3f8b2c1d4e5",
  "role": "button",
  "text": "Add to Cart",
  "actions": ["click"],
  "hints": ["primary"]
}
```

The model does not need to infer that this is a button. The role is stated explicitly. The available actions are listed. Even the visual importance ("primary") is captured as a semantic hint.

### Affordances

Interactive elements declare what actions an agent can take:

| Element | Actions |
|---------|---------|
| link | click |
| button | click |
| text_input | type, clear |
| textarea | type, clear |
| select | select |
| checkbox | toggle |
| radio | select |
| details | toggle |

This eliminates the need for the model to reason about what is clickable, what is typeable, and what is selectable. The information is explicit.

### Stable identifiers

Every element receives a deterministic ID generated from its semantic properties:

```
element_id = "e_" + hex(sha256(origin + "|" + role + "|" + name + "|" + dom_path))[0..12]
```

The same button with the same text on the same page always produces the same ID, regardless of when the page is fetched. This enables agents to reference elements across sessions and snapshots.

### HTML ID bridge

When the source HTML element has an `id` attribute, SOM preserves it as `html_id`:

```json
{
  "id": "e_a3f8b2c1d4e5",
  "role": "button",
  "html_id": "checkout-btn",
  "text": "Checkout",
  "actions": ["click"]
}
```

This gives agents a direct bridge back to the live DOM. An agent can use `html_id` to target elements via `document.getElementById()`, CSS selectors, or Playwright locators when it needs to perform actions through a browser automation layer.

### ARIA state preservation

SOM captures dynamic widget state through ARIA attributes:

```json
{
  "role": "button",
  "text": "Navigation Menu",
  "attrs": {
    "aria": {
      "expanded": false,
      "pressed": false
    }
  }
}
```

An agent can see whether an accordion is open, whether a tab is selected, whether a toggle is active, and whether a disclosure widget is expanded. This information is critical for understanding the current state of interactive pages without executing JavaScript.

## The benchmark evidence

WebTaskBench evaluated 100 tasks across 50 real websites, with three runs per task per format on both GPT-4o and Claude Sonnet 4. The results are consistent across both models.

### Token consumption

Average input tokens per page:

- HTML: 33,181 tokens (baseline)
- SOM: 8,301 tokens (about 4.0x fewer than HTML)
- Markdown: 4,542 tokens (about 7.3x fewer than HTML)

### Latency (Claude Sonnet 4)

Average end to end latency per task:

- HTML: 16.2 seconds
- Markdown: 25.2 seconds
- SOM: 8.5 seconds

### Latency (GPT-4o)

Average end to end latency per task:

- HTML: 2.7 seconds
- Markdown: 1.9 seconds
- SOM: 1.4 seconds

### Compression by task category

HTML token count divided by SOM token count:

- Extraction: 2.2x
- Comparison: 3.9x
- Summarization: 3.9x
- Navigation: 5.4x
- Adversarial: 6.0x

The largest gains appear in navigation and adversarial categories. These are precisely the task types where pages are dominated by boilerplate, repeated chrome, advertising, and cookie banners. SOM strips this noise at compile time rather than forcing the model to filter it at inference time.

## Implementation detail: SOM as a compiler pipeline

It is useful to think of SOM as a compilation target.

HTML is the source language. The rendered DOM, plus computed accessibility tree signals, is the intermediate representation. SOM is the compiled output that trades away visual fidelity in exchange for semantic stability and token efficiency.

That framing clarifies why SOM is more than “HTML but smaller.” A compiler can do transforms that a plain text stripper cannot:

- It can normalize the many different ways sites express the same concept. A clickable element might be an anchor tag, a button, a div with a click handler, or a custom web component. SOM can collapse those variants into a single role like `link` or `button`.
- It can lift implicit structure into explicit structure. Navigation bars become `navigation` regions. The main article becomes `main`. Form controls become a `form` region with typed inputs and submit actions.
- It can eliminate known-bad noise. Consent overlays, duplicated accessibility text, tracking markup, and layout scaffolding are removed once, at compile time, instead of forcing every model call to rediscover the same irrelevance.

Stable IDs are the other compiler-like feature. In HTML, the only stable handles are whatever the publisher chose to add (an `id` attribute, a test id, an aria label). SOM generates stable IDs for every element by combining element role, local structure, and content signals. That gives agents a consistent handle even when the publisher did not provide one, which is essential for multi-step plans like “find the pricing link, then click it, then extract the plan table.”

This is the core reason format matters. A language model can only be as efficient as the representation you provide. SOM makes the semantic structure explicit, which reduces both input tokens and the hidden cost of reasoning tokens.

## The path forward

SOM is published as an open specification. The [SOM Spec v1.0](https://docs.plasmate.app/som-spec) includes a JSON Schema for validation, and any tool can produce or consume SOM documents.

We are building toward a web where publishers serve SOM alongside HTML, agents consume SOM by default, and the adversarial cycle of blocking and scraping gives way to cooperative content serving.

The building blocks are in place: the format specification, the reference compiler (Plasmate), the caching infrastructure (SOM Cache), the protocol specification (Agent Web Protocol), and the standards proposals (robots.txt directives, W3C Community Group participation).

The web was not built for machines. SOM adds the layer that machines need.

**Get started:** `npm install -g plasmate && plasmate fetch https://example.com`

[GitHub](https://github.com/plasmate-labs/plasmate) | [SOM Spec](https://docs.plasmate.app/som-spec) | [Documentation](https://docs.plasmate.app) | [Research Papers](https://timespent.xyz/papers)
