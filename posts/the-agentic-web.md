---
title: "The Agentic Web: Why the Web Needs a Fourth Layer"
slug: the-agentic-web
date: 2026-03-21
author: David Hurley
author_url: https://timespent.xyz
summary: "The web has served humans, then search engines, then APIs. AI agents are the fourth consumer -- and they have no format designed for them. Until now."
tags: [agentic-web, web-standards, som, deep-dive, robots-txt]
category: deep-dive
---

The web is entering its fourth state.

The first web was for **humans** reading pages in browsers. HTML was the format.

The second web was for **search engines** indexing pages for discovery. We got sitemaps, robots.txt, and structured data.

The third web was for **applications** consuming data programmatically. We got REST APIs, GraphQL, and webhooks.

The fourth web is for **AI agents** -- autonomous systems that browse, reason, and act on web content. And right now, they have no format designed for them.

## The publisher-agent conflict

Publishers face a dilemma. AI agents are crawling their sites at an increasing rate. Some publishers block agents entirely (via robots.txt). Others tolerate the traffic but don't serve it well.

Neither approach works long-term:

- **Blocking agents** cuts you off from the fastest-growing channel for content discovery
- **Tolerating raw crawls** means every agent re-renders your page, re-extracts content, and wastes compute on both sides

The missing option is **cooperative serving**: give agents a structured representation they can consume directly, without the overhead of rendering and extraction.

## Three infrastructure primitives

We propose three building blocks for the agentic web:

### 1. SOM (Semantic Object Model)

A structured JSON representation of web pages designed for machine consumption. [SOM preserves meaning and interactivity](https://blog.plasmate.app/why-som-matters/) while stripping rendering noise.

Publishers can serve SOM alongside HTML:

```html
<link rel="alternate" type="application/som+json"
      href="/.well-known/som.json">
```

### 2. Agent Web Protocol (AWP)

A purpose-built protocol for agent-web interaction. Where CDP (Chrome DevTools Protocol) was designed for debugging browsers, AWP is designed for agents performing tasks. It operates at the semantic level -- "click the login button" rather than "dispatch mousedown at coordinates (432, 218)."

### 3. Cooperative robots.txt

An extension to robots.txt that lets publishers declare SOM endpoints:

```
# Traditional bot directives
User-agent: *
Disallow: /admin/

# Agentic web directives
SOM-Endpoint: /.well-known/som.json
SOM-Version: 1.0
Agent-Contact: webmaster@example.com
```

This gives publishers explicit control over how agents consume their content, rather than the binary "allow all" or "block all" of today.

## What SOM-first publishing looks like

A publisher who adopts SOM-first serving:

1. Runs Plasmate on their pages (or generates SOM from their CMS)
2. Publishes `/.well-known/som.json` with the SOM representation
3. Adds the `<link rel="alternate">` tag to their HTML
4. Optionally adds `SOM-Endpoint` to robots.txt

Agents that understand SOM can fetch the structured representation directly. Traditional browsers see no change. Search engines continue indexing HTML normally.

Six properties already serve SOM alternates today:

- [plasmate.app](https://plasmate.app)
- [docs.plasmate.app](https://docs.plasmate.app)
- [plasmatelabs.com](https://plasmatelabs.com)
- [somordom.com](https://somordom.com)
- [betterbrowser.ai](https://betterbrowser.ai)
- [cache.plasmate.app](https://cache.plasmate.app)

## The economics

For publishers, SOM-first serving reduces agent crawl load. Instead of every agent rendering your page and extracting content independently, they fetch a cached SOM file.

For agent developers, SOM reduces token cost (4x vs HTML), improves latency (faster than both HTML and Markdown), and provides reliable structure for interaction tasks.

For the web, cooperative serving is better than the adversarial status quo where publishers block agents and agents circumvent blocks.

## Research

We've published five papers exploring these ideas:

- **Paper 1:** [The Semantic Object Model](https://timespent.xyz/papers) -- token efficiency evaluation
- **Paper 2:** [The Agentic Web](https://timespent.xyz/papers) -- infrastructure primitives proposal
- **Paper 3:** [Agent Web Protocol](https://timespent.xyz/papers) -- protocol specification
- **Paper 4:** [Cooperative Content Negotiation](https://timespent.xyz/papers) -- robots.txt extension proposal
- **Paper 5:** [Does Format Matter?](https://timespent.xyz/papers) -- WebTaskBench task-completion benchmark

All papers are available at [timespent.xyz/papers](https://timespent.xyz/papers).

## Get involved

- [GitHub](https://github.com/plasmate-labs/plasmate) -- Star the repo, file issues, contribute
- [SOM Spec](https://docs.plasmate.app/som-spec) -- Read the specification
- [SOM-first guide](https://docs.plasmate.app/som-first-sites) -- Publish SOM on your site
- [W3C Community Group](https://www.w3.org/community/web-content-browser-ai/) -- Join the standards conversation

The web wasn't built for machines. We're adding that layer now.
