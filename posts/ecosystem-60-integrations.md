---
title: "60+ Integrations: The Plasmate Ecosystem"
slug: ecosystem-60-integrations
date: 2026-04-11
author: David Hurley
author_url: https://timespent.xyz
summary: "From a single CLI tool to 60+ repos across LangChain, Zapier, Supabase, VS Code, and more. Here's how the Plasmate ecosystem grew and what it means for AI agent developers."
tags: [ecosystem, integrations, announcement, langchain, automation]
category: announcement
---

What started as a Rust CLI for fetching web pages has grown into something much bigger. Today, Plasmate has **60+ integration repos** spanning every major AI framework, automation platform, and developer tool.

This isn't just about numbers. It's about being able to drop Plasmate into whatever stack you're already using and immediately get 10-100x token compression on web content.

## The Ecosystem at a Glance

| Category | Integrations |
|----------|--------------|
| **AI Frameworks** | LangChain, LlamaIndex, CrewAI, AutoGen, Haystack, DSPy, Semantic Kernel, Vercel AI SDK |
| **Visual Builders** | Langflow, Flowise, Dify |
| **Automation** | n8n, Zapier, Make.com, Activepieces, Temporal |
| **Web Scraping** | Scrapy, Crawl4AI, Firecrawl, ScrapeGraphAI |
| **Databases** | Supabase, Prisma, PlanetScale, Airtable |
| **Developer Tools** | VS Code, Cursor, Raycast, GitHub Copilot, Cloudflare Workers |
| **Self-Hosted LLMs** | Open WebUI, OpenAI GPT Actions |

Every integration is open source, Apache 2.0 licensed, and maintained in the [plasmate-labs](https://github.com/plasmate-labs) organization.

## Why This Matters

### 1. Drop-in Replacements

Many of our integrations are drop-in replacements for existing tools:

- **crawl4ai-plasmate** — Same API as Crawl4AI, but with SOM output
- **firecrawl-plasmate** — Firecrawl-compatible interface, runs locally
- **scrapy-plasmate** — Middleware that replaces Splash/Playwright

You don't need to rewrite your code. Just swap the import.

### 2. Token Compression Everywhere

Whether you're using LangChain, n8n, or a custom Temporal workflow, you get the same benefit: **10-100x fewer tokens** for web content.

At $3 per million input tokens, that's the difference between a hobby project and production costs.

### 3. Framework Compatibility

Building with Langflow? There's a component. Using Flowise? There's a node. Want it in your VS Code sidebar? Extension is ready.

The goal is to meet developers where they are, not force them into a new workflow.

## Highlighted Integrations

### LangChain & LlamaIndex

The most popular AI frameworks now have native Plasmate loaders:

```python
from langchain_plasmate import PlasmateSOMLoader

loader = PlasmateSOMLoader(url="https://docs.stripe.com/api")
docs = loader.load()
# 54x fewer tokens than raw HTML
```

### Zapier & Make.com

7,000+ apps are now one step away from structured web content:

1. Add the Plasmate action to your Zap
2. Input a URL
3. Get clean, structured JSON

No API keys required — Plasmate runs locally.

### Supabase & Prisma

Store web content with vector search:

```python
from supabase_plasmate import PlasmateSupabase

client = PlasmateSupabase(supabase_url, supabase_key)
await client.fetch_and_store("https://example.com", "web_content")
results = await client.semantic_search("pricing details", "web_content")
```

### GitHub Copilot SDK

The just-released Copilot SDK now has Plasmate tools:

```typescript
import { registerPlasmateSkill } from 'copilot-plasmate'

// Copilot can now fetch and understand any web page
registerPlasmateSkill(copilot)
```

## What's Next

We're continuing to expand coverage:

- **Graphiti** — Real-time knowledge graphs from web content
- **Temporal** — Enterprise workflow orchestration
- **Open WebUI** — Self-hosted LLM interfaces

If there's a framework or tool you'd like to see integrated, [open an issue](https://github.com/plasmate-labs/plasmate/issues) or submit a PR.

## Get Started

The full list of integrations is maintained at [awesome-plasmate](https://github.com/plasmate-labs/awesome-plasmate).

To install Plasmate:

```bash
curl -fsSL https://plasmate.app/install.sh | sh
```

Or via package managers:

```bash
cargo install plasmate
pip install plasmate
npm install plasmate
```

---

The web wasn't built for AI agents. SOM was. And now it's available everywhere you build.
