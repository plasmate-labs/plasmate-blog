---
title: "Introducing Plasmate: The Better Browser for AI Agents"
slug: introducing-plasmate
date: 2026-03-18
author: David Hurley
author_url: https://timespent.xyz
summary: "Raw HTML wastes 80% of your LLM's context window. Plasmate is an open-source headless browser that compiles web pages into structured semantic JSON -- purpose-built for AI agents."
tags: [announcement, som, plasmate, open-source]
category: announcement
---

Every AI agent that browses the web today gets raw HTML. That's a problem.

A typical web page is 200-400KB of HTML. After tokenization, that's 30,000-60,000 tokens -- most of it CSS classes, tracking scripts, and layout divs that mean nothing to a language model. You're paying for noise.

Plasmate is a headless browser that fixes this. It compiles web pages into the Semantic Object Model (SOM) -- a structured JSON representation that preserves meaning while stripping presentation noise.

## What SOM looks like

Where raw HTML gives you this:

```html
<div class="sc-bdfBwQ iKxVxG flex items-center gap-2">
  <button class="btn btn-primary sc-gsnTZi hover:bg-blue-600
    focus:ring-2 focus:ring-blue-300 text-white font-medium
    rounded-lg text-sm px-5 py-2.5" type="submit"
    data-testid="submit-btn" data-analytics="cta-click">
    Sign Up Free
  </button>
</div>
```

SOM gives you this:

```json
{
  "role": "button",
  "text": "Sign Up Free",
  "id": "e_a3f8b2c1d4e5",
  "html_id": "submit-btn",
  "actions": ["click"],
  "hints": ["primary"]
}
```

Same information. 95% fewer tokens. And the agent knows exactly what it can do with this element.

## The numbers

Across 100 real-world websites:

- **Average HTML size:** 278KB (33,181 tokens)
- **Average SOM size:** 25KB (8,301 tokens)
- **Compression ratio:** 4.0x fewer tokens on average
- **Best case (adversarial pages):** 6.0x fewer tokens

Navigation-heavy and ad-filled pages show the biggest gains because SOM strips boilerplate that HTML carries as dead weight.

## Three ways to use it

### CLI

```bash
npm install -g plasmate
plasmate fetch https://news.ycombinator.com
```

### MCP Server (Claude Desktop / Cursor)

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

### SOM Cache API

```bash
curl "https://cache.plasmate.app/v1/som?url=https://example.com" \
  -H "Authorization: Bearer YOUR_KEY"
```

## Open source

Plasmate is Apache-2.0 licensed. The compiler is written in Rust. The MCP server, browser extension, and all SDKs are open source.

- [GitHub](https://github.com/plasmate-labs/plasmate)
- [npm](https://www.npmjs.com/package/plasmate)
- [Documentation](https://docs.plasmate.app)
- [SOM Spec v1.0](https://docs.plasmate.app/som-spec)

We believe the web needs a native format for machines, just as it has HTML for browsers. SOM is that format. Plasmate is the compiler.
