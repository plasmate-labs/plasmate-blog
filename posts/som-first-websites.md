---
title: "SOM-first Websites: How Publishers Can Serve AI Agents Directly"
slug: som-first-websites
date: 2026-03-26
author: David Hurley
author_url: https://timespent.xyz
summary: "Instead of blocking AI agents or letting them scrape raw HTML, publishers can serve structured SOM representations directly. A step by step implementation guide."
tags: [som, publishers, web-standards, tutorial]
category: tutorial
---

Every day, AI agents crawl your website. Each one independently renders your pages in a headless browser, extracts content through heuristic parsing, and discards the rest. If 50 agents visit the same page, that page is rendered 50 times, consuming server bandwidth, compute, and electricity on both sides.

This is wasteful in the same way that having every search engine re-render every page was wasteful before sitemaps and structured data existed. The solution is the same: give the consumer a purpose-built representation so it does not have to extract one from your HTML.

SOM-first publishing means serving a Semantic Object Model representation of your pages alongside your HTML. Agents that understand SOM fetch the structured representation directly. Traditional browsers see no change. Search engines continue indexing HTML normally.

This guide covers the implementation from scratch for static sites, dynamic sites, and CMS platforms.

## Why publishers should care

### Reduced infrastructure load

When an agent crawls your site today, it triggers a full page render. If your site uses server-side rendering, that means your server generates the full HTML response. If your site relies on client-side JavaScript, the agent must execute that JavaScript in a headless browser, which may hit your APIs, CDN, and database.

With SOM-first serving, agents fetch a single JSON file. For static sites, this is served directly from your CDN or file storage. For dynamic sites, you can cache the SOM representation with a TTL appropriate to your content freshness requirements. Either way, the load per agent request drops dramatically.

### Content control

Without SOM, every agent interprets your HTML however it wants. Different agents use different extraction algorithms, producing different (and sometimes incorrect) representations of your content. You have no control over what they see.

With SOM, you declare the canonical semantic representation. You decide which content is included, how it is structured, and what metadata accompanies it. This is analogous to how Schema.org markup lets you tell search engines "this is the product name, this is the price, this is the rating" rather than hoping the search engine's parser gets it right.

### Future-proofing

Agent traffic is growing rapidly. As more users delegate information gathering to AI assistants, sites that are invisible to agents will lose relevance. But sites that actively serve structured content to agents are positioned to be the preferred sources for AI-mediated discovery.

SOM-first serving is the cooperative alternative to the adversarial cycle of blocking and scraping. It signals to agents: "You are welcome here, and this is how I want you to consume my content."

## The discovery mechanism

SOM-aware agents check three places to find a site's SOM representation:

1. **Well-known path:** `/.well-known/som.json` (checked first by convention)
2. **HTML link tag:** `<link rel="alternate" type="application/som+json" href="...">` in the page `<head>`
3. **robots.txt directive:** `SOM-Endpoint: /.well-known/som.json`

Any of these is sufficient. For maximum compatibility, implement all three.

## Implementation for static sites

Static sites (Hugo, Jekyll, Astro, Eleventy, or plain HTML) are the simplest case.

### Step 1: Generate the SOM

Install Plasmate and fetch your homepage:

```bash
npm install -g plasmate

plasmate fetch https://your-site.com --format json > som.json
```

Examine the output to verify it captures your content correctly:

```bash
cat som.json | python3 -m json.tool | head -30
```

You should see your page title, semantic regions (navigation, main, footer), and content elements with their roles and text.

### Step 2: Place at the well-known path

```bash
mkdir -p public/.well-known
cp som.json public/.well-known/som.json
```

The `public/` directory is the standard static assets root for most static site generators. Adjust the path for your framework:

| Framework | Path |
|-----------|------|
| Hugo | static/.well-known/som.json |
| Jekyll | _site/.well-known/som.json (or root .well-known/) |
| Astro | public/.well-known/som.json |
| Next.js (static export) | public/.well-known/som.json |
| Plain HTML | .well-known/som.json (relative to document root) |

### Step 3: Add the HTML link tag

In your base template or layout file, add this to the `<head>`:

```html
<link rel="alternate" type="application/som+json"
      href="/.well-known/som.json">
```

For Hugo, add it to `layouts/partials/head.html`. For Jekyll, add it to `_includes/head.html`. For Astro, add it to your base layout component.

### Step 4: Add the robots.txt directive

Append to your robots.txt:

```
SOM-Endpoint: /.well-known/som.json
SOM-Version: 1.0
```

### Step 5: Automate regeneration

Add the SOM generation to your build pipeline so the representation stays current:

```bash
# In your CI/CD script or Makefile
plasmate fetch https://your-site.com --format json > public/.well-known/som.json
```

For sites deployed on Vercel, Netlify, or Cloudflare Pages, add this as a post-build step.

## Implementation for dynamic sites

Dynamic sites (Express, Rails, Django, Laravel) serve different content per request. The SOM representation needs to be generated per page or per template.

### Option A: build-time generation for key pages

If your site has a known set of important pages (homepage, about, pricing, docs), generate SOM for each during your build or deploy:

```bash
PAGES="https://your-site.com https://your-site.com/about https://your-site.com/pricing"
for url in $PAGES; do
  slug=$(echo "$url" | sed 's|https://your-site.com||' | sed 's|/|_|g')
  plasmate fetch "$url" --format json > "public/.well-known/som${slug}.json"
done
```

Serve the appropriate SOM file based on the request path.

### Option B: on-demand generation with caching

For sites with many pages or frequently changing content, generate SOM on demand and cache it:

```javascript
import { execSync } from 'child_process';

const somCache = new Map();
const CACHE_TTL = 300_000; // 5 minutes

app.get('/.well-known/som.json', (req, res) => {
  const pageUrl = `${req.protocol}://${req.get('host')}${req.query.page || '/'}`;
  const cached = somCache.get(pageUrl);

  if (cached && Date.now() - cached.time < CACHE_TTL) {
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'public, max-age=300');
    return res.send(cached.data);
  }

  try {
    const som = execSync(
      `plasmate fetch "${pageUrl}" --format json`,
      { timeout: 15000, encoding: 'utf-8' }
    );
    somCache.set(pageUrl, { data: som, time: Date.now() });
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(som);
  } catch (err) {
    res.status(503).json({ error: 'SOM generation failed' });
  }
});
```

### Option C: use the SOM Cache as your SOM provider

Instead of running Plasmate locally, register your site with the SOM Cache at cache.plasmate.app. The cache handles generation, caching, and serving on your behalf:

```html
<link rel="alternate" type="application/som+json"
      href="https://cache.plasmate.app/v1/som?url=https://your-site.com">
```

This offloads all compute to the cache infrastructure. Agents that check your SOM endpoint get redirected to the cache.

## Freshness and caching strategies

Different types of content have different freshness requirements:

| Content Type | Recommended TTL | Strategy |
|-------------|-----------------|----------|
| Static pages (about, docs) | 24 hours or more | Regenerate on deploy |
| News articles | 15 to 60 minutes | On-demand with short cache |
| Ecommerce product pages | 5 to 15 minutes | On-demand with cache invalidation on price change |
| Real-time data (stock prices) | 1 to 5 minutes | On-demand, low TTL |
| User-generated content | 30 to 60 minutes | On-demand with moderate cache |

Set appropriate `Cache-Control` headers on your SOM responses. The `max-age` value tells agents how long they can use a cached version before refetching.

For content that changes unpredictably (breaking news, flash sales), use `stale-while-revalidate` to serve stale content while regenerating in the background:

```
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

## Verifying your setup

After implementing SOM-first serving, verify that agents can discover and fetch your SOM:

### Check the well-known path

```bash
curl -s https://your-site.com/.well-known/som.json | python3 -m json.tool | head -10
```

You should see valid JSON with `som_version`, `url`, `title`, and `regions` fields.

### Check the HTML link tag

```bash
curl -s https://your-site.com | grep -i "som+json"
```

You should see the `<link rel="alternate">` tag.

### Check robots.txt

```bash
curl -s https://your-site.com/robots.txt | grep -i "SOM"
```

You should see the `SOM-Endpoint` directive.

### Validate the SOM output

Use the JSON Schema to validate your SOM document:

```bash
npm install -g ajv-cli
ajv validate -s node_modules/plasmate/specs/som-schema.json \
  -d your-som-output.json
```

## Who is already doing this

Six properties currently serve SOM alternates:

| Site | Type | SOM Path |
|------|------|----------|
| [plasmate.app](https://plasmate.app) | Product site | /.well-known/som.json |
| [docs.plasmate.app](https://docs.plasmate.app) | Documentation | /.well-known/som.json |
| [plasmatelabs.com](https://plasmatelabs.com) | Company site | /.well-known/som.json |
| [somordom.com](https://somordom.com) | Comparison tool | /.well-known/som.json |
| [betterbrowser.ai](https://betterbrowser.ai) | Landing page | /.well-known/som.json |
| [cache.plasmate.app](https://cache.plasmate.app) | API dashboard | /.well-known/som.json |

We are actively looking for early adopters. If you implement SOM-first serving on your site, open a discussion on [GitHub](https://github.com/plasmate-labs/plasmate/discussions) and we will add you to the registry and link to your site from the documentation.

## The bigger picture

SOM-first publishing is one of three infrastructure primitives we propose for the agentic web:

1. **SOM** provides the structured representation that agents consume.
2. **Agent Web Protocol (AWP)** provides the interaction protocol for agents to navigate and act on pages.
3. **Cooperative robots.txt directives** provide the discovery and permission mechanism.

Together, these replace the adversarial model (agents scraping, publishers blocking) with a cooperative model (publishers declaring endpoints, agents consuming structured content).

The detailed proposal is in our [robots.txt for the agentic web](https://docs.plasmate.app/robots-txt-proposal) documentation, and the full vision is described in [The Agentic Web](https://blog.plasmate.app/the-agentic-web/) blog post.

[GitHub](https://github.com/plasmate-labs/plasmate) | [SOM Spec](https://docs.plasmate.app/som-spec) | [Documentation](https://docs.plasmate.app) | [Robots.txt Proposal](https://docs.plasmate.app/robots-txt-proposal)
