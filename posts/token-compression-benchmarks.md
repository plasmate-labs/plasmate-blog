---
title: "30x Token Compression: How Plasmate Cuts LLM Costs for Web-Scraping AI Agents"
slug: token-compression-benchmarks
date: 2026-04-10
author: David Hurley
author_url: https://timespent.xyz
summary: "We benchmarked 100 real websites and found Plasmate's Semantic Object Model achieves 30x mean token compression over raw HTML. Top performers like accounts.google.com hit 864x. Here's the data."
tags: [benchmarks, token-compression, llm-optimization, web-scraping, research]
category: research
---

Every token your AI agent spends parsing CSS class names and tracking scripts is money burned. We ran Plasmate against 100 production websites to quantify exactly how much waste raw HTML introduces and how much you can save by switching to structured semantic output.

The headline number: **30x mean compression from HTML to SOM**. The best case: **864x on accounts.google.com**. The worst case: documentation sites that are already lean still achieve 3-9x.

This post presents the full benchmark methodology, results by category, cost calculations at scale, and an honest assessment of where Plasmate helps most and where it helps least.

## TL;DR: The Numbers

- **100 URLs tested**, 98% success rate
- **Mean compression**: 30x (HTML to SOM)
- **Median compression**: 10.2x
- **P95 compression**: 98.4x
- **Mean fetch time**: 232ms
- **Mean parse+SOM compilation**: 19ms
- **Total pipeline latency**: ~250ms

If you are running an agent that processes 10,000 web pages per day and paying $3 per million input tokens, switching from raw HTML to SOM saves approximately **$26,000 per year** in API costs alone.

## Methodology

We selected 100 URLs across eight categories: e-commerce, news, SaaS applications, search engines, social media, developer documentation, government sites, and financial services. Selection criteria prioritized diversity over cherry-picking favorable results.

For each URL, we performed the following:

1. **Raw HTML baseline**: Fetched the page using a standard HTTP client and measured the byte size of the HTML response body.

2. **Plasmate SOM**: Ran `plasmate fetch <url>` with default settings and measured the byte size of the JSON output.

3. **Token estimation**: Applied the cl100k_base tokenizer (GPT-4/Claude tokenizer) to both representations.

4. **Compression ratio**: Calculated `html_tokens / som_tokens` for each URL.

5. **Performance timing**: Recorded network fetch time and parse+compile time separately.

All benchmarks ran on an M3 MacBook Pro over residential fiber. We excluded URLs that required authentication or returned error responses, giving us 98 successful measurements from 100 attempts.

## Results by Category

### Search Engines

Search engine homepages and results pages are among the highest-compression targets due to heavy JavaScript bundling, analytics, and A/B testing infrastructure.

| Site | Compression Ratio |
|------|-------------------|
| www.google.com | 114.4x |
| www.bing.com | 98.2x |
| duckduckgo.com | 9.3x |

DuckDuckGo's lower ratio reflects its minimal-JavaScript philosophy. Google and Bing pack substantial client-side code that Plasmate strips entirely.

### SaaS Applications

Modern SaaS applications use component frameworks that generate verbose class names and nested wrapper divs. These compress extremely well.

| Site | Compression Ratio |
|------|-------------------|
| linear.app | 105.1x |
| www.figma.com | 63.6x |
| vercel.com | 28.4x |
| stripe.com | 14.2x |

Linear's React application produces particularly heavy HTML output relative to its actual UI content. Stripe's lower ratio reflects its documentation-heavy landing page with more text content.

### E-commerce

Retail sites carry product grids, recommendation carousels, and tracking pixels. Compression is consistent but not extreme.

| Site | Compression Ratio |
|------|-------------------|
| www.walmart.com | 32.1x |
| www.target.com | 27.8x |
| www.bestbuy.com | 21.4x |
| www.amazon.com | 19.6x |

Amazon's relatively lower ratio comes from dense product information that legitimately needs representation. Walmart and Target include more promotional carousel markup.

### News Sites

News sites vary dramatically based on advertising load and article density.

| Site | Compression Ratio |
|------|-------------------|
| www.nytimes.com | 98.4x |
| www.washingtonpost.com | 45.2x |
| www.theguardian.com | 31.7x |
| www.bbc.com | 15.8x |

The New York Times homepage carries substantial advertising and tracking infrastructure. BBC's leaner approach shows in the compression ratio.

### Social Media and Authentication

These platforms generate the most dramatic compression ratios in our benchmark.

| Site | Compression Ratio |
|------|-------------------|
| accounts.google.com | 864.9x |
| x.com | 163.6x |
| store.steampowered.com | 77.7x |

accounts.google.com is an outlier because login pages contain minimal semantic content but massive JavaScript bundles for security, anti-fraud, and device fingerprinting. X.com (Twitter) loads a React shell with most content delivered via API calls that Plasmate captures after rendering.

### Developer Documentation

Documentation sites are already optimized for readability and produce the lowest compression ratios.

| Site | Compression Ratio |
|------|-------------------|
| developer.chrome.com | 9.1x |
| developer.mozilla.org | 5.8x |
| docs.python.org | 3.2x |

These sites use minimal JavaScript, semantic HTML, and prioritize content over presentation. This is the floor for compression benefits.

## Why Compression Matters: The Cost Calculation

Let's make this concrete with a cost model for a production agent system.

**Assumptions:**
- Agent processes 10,000 web pages per day
- Average raw HTML size: 250KB (approximately 35,000 tokens)
- Average SOM size: 8KB (approximately 1,200 tokens)
- LLM input pricing: $3 per million tokens (Claude Sonnet 4 tier)

**Daily token consumption:**

| Format | Tokens/Page | Daily Tokens | Daily Cost |
|--------|-------------|--------------|------------|
| Raw HTML | 35,000 | 350,000,000 | $1,050 |
| SOM | 1,200 | 12,000,000 | $36 |

**Annual impact:**

| Format | Annual Cost |
|--------|-------------|
| Raw HTML | $383,250 |
| SOM | $13,140 |
| **Savings** | **$370,110** |

At enterprise scale (100,000 pages/day), savings exceed **$3.7 million annually**.

Even conservative estimates matter. If your actual compression is only 10x instead of 30x, you still save **$345,000 per year** at 10,000 pages/day.

## Performance: The 250ms Pipeline

Token compression is meaningless if it adds latency. Our benchmarks show Plasmate's pipeline runs faster than most agents' decision-making loops.

| Stage | Mean Time | P95 Time |
|-------|-----------|----------|
| Network fetch | 232ms | 890ms |
| Parse + SOM compile | 19ms | 42ms |
| **Total** | **251ms** | **932ms** |

The 19ms compilation time demonstrates that the semantic extraction overhead is negligible. Variation in total pipeline time is dominated by network conditions, not Plasmate processing.

For comparison, agents using browser automation tools like Playwright or Puppeteer typically see 2-5 second page load times due to full browser rendering. Plasmate's HTTP-first approach with JavaScript execution on demand provides a middle ground between raw HTML fetch speed and full browser fidelity.

## Honest Limitations: Where SOM Helps Less

Transparency matters more than marketing. Here are scenarios where Plasmate provides minimal benefit:

### Documentation and text-heavy sites

Sites like MDN, Python docs, and technical wikis already optimize for content. You see 3-9x compression instead of 30x+. The savings are real but not dramatic.

### Sites requiring full browser state

Some applications depend on client-side rendering that cannot be replicated without a full browser session. Plasmate handles most JavaScript, but edge cases exist in heavily dynamic SPAs.

### Already-structured APIs

If a site offers a public API with structured JSON responses, use that directly. Plasmate solves the "website as interface" problem, not the "API exists but I'm ignoring it" problem.

### Real-time content

Websocket-driven dashboards, live sports scores, and streaming content update faster than any crawl cycle. SOM captures snapshots, not streams.

### Authentication-gated content

Plasmate supports custom headers including Authorization tokens, but managing session state across complex multi-step authentication flows requires additional orchestration.

## What the Data Tells Us

Three findings stand out from this benchmark:

**1. Framework overhead dominates modern web pages.** Sites using React, Vue, Angular, or Tailwind CSS generate HTML that is 90%+ presentation markup. This is not a criticism of those tools; they optimize for developer experience and visual fidelity. But agents pay the token cost of that optimization even though they need none of it.

**2. The variance is massive.** 864x to 3x is a 288x range. Any single-number claim about "how much Plasmate helps" is necessarily incomplete. Your mileage depends entirely on which sites your agent needs to read.

**3. Documentation sites set the floor.** If your agent primarily reads docs.python.org and MDN, expect 5-10x compression. If it reads SaaS dashboards and e-commerce sites, expect 20-100x.

## Try It Yourself

Reproduce these benchmarks on your target URLs:

```bash
# Install Plasmate
npm install -g plasmate

# Benchmark a single URL
plasmate bench https://your-target-site.com

# Benchmark multiple URLs from a file
plasmate bench --urls urls.txt --output results.json
```

The benchmark command outputs compression ratio, timing breakdown, and byte counts for both HTML and SOM.

For production integration, see our guides for [MCP server setup](https://docs.plasmate.app/mcp), [LangChain integration](https://docs.plasmate.app/langchain), and [direct API usage](https://docs.plasmate.app/api).

## Links

- [GitHub Repository](https://github.com/plasmate-labs/plasmate)
- [Full Benchmark Dataset](https://github.com/plasmate-labs/plasmate/tree/main/benchmarks)
- [SOM Specification](https://docs.plasmate.app/som-spec)
- [Documentation](https://docs.plasmate.app)
