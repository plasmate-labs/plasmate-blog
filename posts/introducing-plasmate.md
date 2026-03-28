---
title: "Introducing Plasmate: The Better Browser for AI Agents"
slug: introducing-plasmate
date: 2026-03-18
author: David Hurley
author_url: https://timespent.xyz
summary: "Raw HTML wastes 80% of your LLM context window on CSS classes, tracking scripts, and layout noise. Plasmate is an open-source headless browser that compiles web pages into structured semantic JSON for AI agents."
tags: [announcement, som, plasmate, open-source]
category: announcement
---

Every AI agent that browses the web today receives raw HTML. This is a problem that costs real money and real time, and it gets worse with every page your agent visits.

A typical web page weighs between 200KB and 400KB of HTML. After tokenization, that translates to 30,000 to 60,000 tokens. The vast majority of those tokens are CSS class names, inline styles, tracking pixels, analytics scripts, advertising markup, and layout containers that carry zero semantic value for a language model. Your agent is paying to read noise.

Consider what a simple navigation bar looks like in raw HTML on a modern website:

```html
<nav class="sc-bdfBwQ iKxVxG bg-white border-b border-gray-200 
  sticky top-0 z-50 shadow-sm" role="navigation" 
  aria-label="Main navigation" data-testid="main-nav"
  data-analytics-section="header-nav">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between h-16">
      <div class="flex items-center space-x-8">
        <a href="/about" class="text-gray-700 hover:text-blue-600 
          font-medium text-sm transition-colors duration-200
          tracking-tight inline-flex items-center gap-1.5
          data-analytics-click="nav-about">
          About
        </a>
        <a href="/pricing" class="text-gray-700 hover:text-blue-600
          font-medium text-sm transition-colors duration-200
          tracking-tight inline-flex items-center gap-1.5"
          data-analytics-click="nav-pricing">
          Pricing
        </a>
      </div>
    </div>
  </div>
</nav>
```

That is roughly 800 bytes and 200 tokens to encode two navigation links. The semantic content is: there are two links, "About" pointing to /about and "Pricing" pointing to /pricing, inside a navigation region. Everything else is presentation.

Plasmate is a headless browser that eliminates this waste. It compiles web pages into the Semantic Object Model (SOM), a structured JSON representation that preserves meaning while stripping presentation noise.

## What SOM looks like in practice

For the same navigation bar above, Plasmate produces:

```json
{
  "id": "r_navigation",
  "role": "navigation",
  "label": "Main navigation",
  "elements": [
    {
      "id": "e_a3f8b2c1d4e5",
      "role": "link",
      "text": "About",
      "attrs": { "href": "/about" },
      "actions": ["click"]
    },
    {
      "id": "e_d4e5f67890ab",
      "role": "link",
      "text": "Pricing",
      "attrs": { "href": "/pricing" },
      "actions": ["click"]
    }
  ]
}
```

This is roughly 300 bytes and 80 tokens. The compression is dramatic, but what matters more is what is preserved. Every element declares its semantic role (link, button, heading, text input). Interactive elements include their available actions (click, type, toggle, select). The page is divided into named regions (navigation, main, header, footer, form). And every element gets a stable identifier that survives page refreshes.

An agent reading this output knows exactly what it is looking at, what it can do with each element, and where things are on the page. It does not need to infer any of this from CSS class names or DOM nesting.

## The numbers across 100 real websites

We built WebTaskBench, a benchmark of 100 agent tasks across 50 real websites spanning news, ecommerce, documentation, government, social media, and SaaS pages. The token consumption results are consistent:

| Format | Average Input Tokens | Relative to HTML |
|--------|---------------------|------------------|
| Raw HTML | 33,181 | 1.0x |
| SOM | 8,301 | 4.0x fewer |
| Markdown | 4,542 | 7.3x fewer |

Markdown produces fewer tokens than SOM because it strips everything, including structure. But this aggressive stripping has consequences. Markdown cannot represent which elements are interactive, what actions are available, or which text is a button versus a heading versus decorative. For tasks that require the agent to navigate, fill forms, or click through multi-step workflows, Markdown falls apart.

The latency results are even more revealing. On Claude Sonnet 4, SOM is the fastest representation at 8.5 seconds average, compared to 16.2 seconds for HTML and 25.2 seconds for Markdown. The structured format appears to reduce the amount of reasoning the model needs to do to understand page layout and identify relevant elements.

## How Plasmate works under the hood

Plasmate is written in Rust and uses a real browser engine for page rendering. When you fetch a URL, the following pipeline executes:

1. The page is loaded in a headless browser with full JavaScript execution, including waiting for dynamic content to render.

2. The DOM is analyzed to identify semantic regions using a precedence chain: ARIA roles first, then HTML5 landmark elements, then class and ID heuristics, then link density analysis, then content heuristics for footers.

3. Within each region, elements are classified by semantic role. Interactive elements (links, buttons, form controls) are always preserved. Non-interactive elements are included based on a content budget that prioritizes the main region.

4. Cookie consent banners, GDPR overlays, and privacy popups are automatically detected and stripped.

5. Structured data is extracted from JSON-LD, OpenGraph, Twitter Cards, and HTML meta tags.

6. Every element receives a deterministic stable ID derived from its semantic properties, enabling cross-snapshot references.

7. When the source element has an HTML `id` attribute, it is preserved as `html_id` for direct DOM resolution.

8. ARIA state attributes (expanded, selected, checked, disabled, current, pressed, hidden) are captured on every element.

The output is valid JSON conforming to the SOM Spec v1.0 schema.

## Three ways to use Plasmate

### Command line

```bash
npm install -g plasmate

plasmate fetch https://news.ycombinator.com
```

This prints the SOM JSON to stdout. You can pipe it to files, parse it with jq, or feed it into your agent pipeline.

### MCP Server for Claude Desktop and Cursor

Add Plasmate to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "plasmate": {
      "command": "npx",
      "args": ["-y", "plasmate", "mcp"]
    }
  }
}
```

Claude can now browse the web using SOM directly. When it needs to read a web page, it calls the Plasmate MCP tool and receives structured content instead of raw HTML.

### SOM Cache API

For production systems, use the SOM Cache at cache.plasmate.app. This is a shared semantic CDN that caches SOM representations across agents, eliminating redundant crawls:

```python
import requests

response = requests.get(
    "https://cache.plasmate.app/v1/som",
    params={"url": "https://www.nytimes.com"},
    headers={"Authorization": "Bearer YOUR_API_KEY"}
)
som = response.json()
print(f"Title: {som['title']}")
print(f"Regions: {len(som['regions'])}")
print(f"Compression: {som['meta']['html_bytes'] / som['meta']['som_bytes']:.1f}x")
```

The cache currently holds 283 URLs across news, ecommerce, SaaS, government, finance, education, and developer documentation sites.

### LangChain integration

If you work in the LangChain ecosystem, the langchain-plasmate package provides a native document loader:

```python
from langchain_plasmate import PlasmateSOMLLoader

loader = PlasmateSOMLLoader(
    urls=[
        "https://en.wikipedia.org/wiki/Artificial_intelligence",
        "https://openai.com",
        "https://anthropic.com",
    ],
    api_key="your-cache-api-key"
)
documents = loader.load()
```

Each Document object contains extracted text content and metadata including the source URL, page title, compression ratio, and byte counts.

## The SOM specification

SOM is not a proprietary format. The [SOM Spec v1.0](https://docs.plasmate.app/som-spec) is published openly and includes a JSON Schema for validation. Any tool can produce or consume SOM documents.

The specification defines:

**Document structure.** Every SOM document contains a version identifier, page URL, title, language, an array of semantic regions, compilation metadata, and optional structured data.

**Region roles.** Pages are divided into regions with roles: navigation, main, aside, header, footer, form, dialog, and content (the fallback).

**Element roles.** Fourteen element types: link, button, text_input, textarea, select, checkbox, radio, heading, image, list, table, paragraph, section, separator, and details.

**Stable identifiers.** A deterministic ID generation algorithm based on SHA-256 hashing of the element's origin, role, accessible name, and DOM path. The same element on the same page always produces the same ID.

**Affordances.** Interactive elements declare their available actions, enabling agents to reason about what they can do without guessing.

**ARIA states.** Dynamic widget state is captured so agents understand accordion, tab, toggle, and disclosure widget state without JavaScript execution.

## Open source and community

Plasmate is Apache 2.0 licensed. The compiler, MCP server, browser extension, SDKs, and all tooling are open source under the [plasmate-labs](https://github.com/plasmate-labs) organization on GitHub.

We have published five research papers covering the SOM format, the agentic web infrastructure vision, the Agent Web Protocol, cooperative content negotiation via robots.txt, and a task-completion benchmark comparing HTML, Markdown, and SOM. All papers are available at [timespent.xyz/papers](https://timespent.xyz/papers).

We believe the web needs a native format for machines, the same way it has HTML for browsers and structured data for search engines. SOM is that format. Plasmate is the reference compiler.

**Links:**
- [GitHub](https://github.com/plasmate-labs/plasmate)
- [npm](https://www.npmjs.com/package/plasmate)
- [Documentation](https://docs.plasmate.app)
- [SOM Spec v1.0](https://docs.plasmate.app/som-spec)
- [Research Papers](https://timespent.xyz/papers)
- [LangChain Integration](https://github.com/plasmate-labs/langchain-plasmate)
