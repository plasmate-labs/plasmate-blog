---
title: "SOM-first Websites: How Publishers Can Serve AI Agents Directly"
slug: som-first-websites
date: 2026-03-26
author: David Hurley
author_url: https://timespent.xyz
summary: "Instead of blocking AI agents or letting them scrape raw HTML, publishers can serve structured SOM representations directly. Here is how."
tags: [som, publishers, web-standards, tutorial]
category: tutorial
---

Every day, AI agents crawl your website. Each one independently renders your pages, extracts content, and discards the rest. It's wasteful for everyone -- you pay for the server load, they pay for the tokens.

There's a better way. Serve a SOM (Semantic Object Model) representation alongside your HTML, and agents can fetch structured content directly. No rendering. No extraction. No waste.

## The 5-minute setup

### Step 1: Generate your SOM

```bash
npm install -g plasmate
plasmate fetch https://your-site.com --format json > som.json
```

### Step 2: Publish at the well-known path

Place the file at `/.well-known/som.json` on your server. For a static site:

```bash
mkdir -p public/.well-known
cp som.json public/.well-known/som.json
```

### Step 3: Add the link tag

In your HTML `<head>`:

```html
<link rel="alternate" type="application/som+json"
      href="/.well-known/som.json">
```

### Step 4 (optional): Declare in robots.txt

```
SOM-Endpoint: /.well-known/som.json
SOM-Version: 1.0
```

That's it. SOM-aware agents will discover your endpoint and fetch structured content directly.

## What agents see

When an agent encounters your site:

1. Check `/.well-known/som.json` (by convention)
2. Check `<link rel="alternate" type="application/som+json">` in HTML
3. Check `SOM-Endpoint` in robots.txt

If any of these exist, the agent fetches your SOM directly instead of crawling and converting your HTML. This is faster for the agent and lighter on your infrastructure.

## Dynamic sites

For sites with frequently changing content (news, e-commerce), you have two options:

### Option A: Regenerate on deploy

```bash
# In your CI/CD pipeline
plasmate fetch https://your-site.com --format json > public/.well-known/som.json
```

### Option B: Serve dynamically

Add an endpoint that generates SOM on the fly:

```javascript
app.get('/.well-known/som.json', async (req, res) => {
  const som = await plasmate.fetch(req.headers.host);
  res.json(som);
  // Cache for 5 minutes
  res.set('Cache-Control', 'public, max-age=300');
});
```

## CMS integration

If you run WordPress, Ghost, or another CMS, a SOM plugin can generate the representation automatically on publish. We're building these integrations -- [follow progress on GitHub](https://github.com/plasmate-labs/plasmate).

For static site generators (Next.js, Hugo, Astro), add the Plasmate fetch to your build step.

## Why bother?

### For publishers

- **Reduced crawl load**: Agents fetch one JSON file instead of rendering your entire page
- **Control**: You choose exactly what agents see, rather than letting them parse your HTML however they want
- **Future-proofing**: As agent traffic grows (and it will), SOM-first serving scales better than raw HTML crawling

### For the ecosystem

- **Lower token cost**: SOM is 4x smaller than HTML on average
- **Better agent behavior**: Structured input produces more accurate agent outputs
- **Cooperative model**: Publishers and agents working together instead of an arms race of blocking and circumvention

## Who's already doing it

Six properties serve SOM alternates today:

| Site | Type |
|------|------|
| [plasmate.app](https://plasmate.app) | Product site |
| [docs.plasmate.app](https://docs.plasmate.app) | Documentation |
| [plasmatelabs.com](https://plasmatelabs.com) | Company site |
| [somordom.com](https://somordom.com) | Tool |
| [betterbrowser.ai](https://betterbrowser.ai) | Landing page |
| [cache.plasmate.app](https://cache.plasmate.app) | API / Dashboard |

We're looking for early adopters. If you publish SOM on your site, [let us know](https://github.com/plasmate-labs/plasmate/discussions) -- we'll add you to the registry.

---

**Full guide:** [SOM-first Websites](https://docs.plasmate.app/som-first-sites)

[GitHub](https://github.com/plasmate-labs/plasmate) -- [SOM Spec](https://docs.plasmate.app/som-spec) -- [robots.txt Proposal](https://docs.plasmate.app/robots-txt-proposal)
