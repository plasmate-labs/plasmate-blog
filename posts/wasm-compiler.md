---
title: "Plasmate SOM Compiler Now Available as WebAssembly"
slug: wasm-compiler
date: 2026-03-29
author: David Hurley
author_url: https://timespent.xyz
summary: "The Plasmate SOM compiler is now available as a 380KB WebAssembly package. Compile HTML to structured JSON in Node.js, Deno, Bun, browsers, serverless functions, or edge workers. No native binary required."
tags: [announcement, wasm, plasmate, javascript]
category: announcement
---

One of the most common objections to adopting Plasmate has been binary distribution. The full Plasmate CLI is a compiled Rust binary that includes a browser engine for JavaScript execution and page rendering. It works well, but it requires platform-specific binaries and cannot run in environments that restrict native code execution (serverless functions, edge workers, browser contexts).

The SOM compiler itself has no such limitation. It is pure computation: parse HTML with html5ever, walk the DOM tree, identify semantic regions, classify elements, generate stable IDs, serialize JSON. No system calls, no network, no file system. Just a function that takes a string and returns a string.

Today we are publishing that function as WebAssembly.

## Install and use

```bash
npm install plasmate-wasm
```

```javascript
const { compile } = require('plasmate-wasm');

const html = '<html><body><nav><a href="/about">About</a></nav><main><h1>Hello</h1><p>World</p></main></body></html>';
const som = JSON.parse(compile(html, 'https://example.com'));

console.log(som.title);              // "Hello"
console.log(som.regions.length);      // 2 (navigation + main)
console.log(som.meta.element_count);  // 5
```

The `compile` function takes two arguments: an HTML string and a URL for stable ID generation. No network request is made. It returns a SOM JSON string.

## Where this runs

The WASM module works in any JavaScript runtime that supports WebAssembly:

**Node.js, Deno, Bun:** Import as a regular npm package. The WASM binary is loaded automatically.

**Browsers:** Use the ESM build (available in the pkg-web directory). Useful for client-side SOM generation in developer tools or browser extensions.

**Serverless (AWS Lambda, Vercel Functions, Cloudflare Workers):** The 380KB gzipped package size fits within typical size limits. No native binary installation needed during deployment.

**Edge (Cloudflare Workers, Deno Deploy, Vercel Edge Runtime):** WASM is a first-class citizen in edge runtimes. The compiler initializes in milliseconds.

## Size and performance

The WASM binary is 864KB uncompressed, 380KB after gzip. For comparison, the full Plasmate binary is approximately 30MB.

Compilation speed is comparable to the native binary for the compile step itself. The native binary is faster overall because it avoids WASM interpreter overhead, but the difference is small (microseconds per page for the compile step). The bottleneck in the full pipeline has always been fetching and JavaScript execution, not SOM compilation.

## When to use WASM vs the full CLI

| Scenario | Use |
|----------|-----|
| Fetching live pages with JS execution | Full CLI (`plasmate fetch`) or daemon mode |
| Compiling HTML you already have | WASM (`plasmate-wasm`) or CLI (`plasmate compile`) |
| Serverless or edge deployment | WASM |
| Browser extension or developer tool | WASM |
| CI/CD pipeline (HTML already rendered) | Either (WASM avoids binary installation) |
| Publisher build pipeline | Either (WASM is simpler to integrate) |

The key distinction: if you need to fetch a live page and execute its JavaScript, you need the full CLI. If you already have the HTML (from your CMS, build pipeline, or another HTTP client), the WASM compiler does everything you need with zero native dependencies.

## Publisher integration example

A static site generator that produces SOM during the build:

```javascript
const { compile } = require('plasmate-wasm');
const fs = require('fs');
const path = require('path');

// After Hugo/Astro/Next.js has rendered HTML to disk
const htmlDir = './public';
const somDir = './public/.well-known/som';

fs.mkdirSync(somDir, { recursive: true });

for (const file of fs.readdirSync(htmlDir, { recursive: true })) {
  if (!file.endsWith('.html')) continue;
  
  const html = fs.readFileSync(path.join(htmlDir, file), 'utf-8');
  const slug = file.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  const url = `https://mysite.com/${slug}`;
  
  const somJson = compile(html, url);
  const outPath = path.join(somDir, `${slug || 'index'}.json`);
  
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, somJson);
}
```

This runs entirely at build time with no network requests and no native binary. The SOM files are deployed alongside the HTML as static assets.

## Cloudflare Worker example

An edge function that compiles HTML to SOM on the fly:

```javascript
import { compile } from 'plasmate-wasm';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }
    
    // Fetch the page
    const resp = await fetch(targetUrl);
    const html = await resp.text();
    
    // Compile to SOM
    const somJson = compile(html, targetUrl);
    
    return new Response(somJson, {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

This is a lightweight SOM proxy running at the edge. No Plasmate binary deployment needed. The WASM module handles everything.

## What is next

We plan to publish the WASM compiler to additional package registries (Deno modules, JSR) and create framework-specific wrappers for popular static site generators. The long-term goal is to make SOM compilation available everywhere JavaScript runs.

For sites that require JavaScript execution to render content (SPAs, dynamically loaded data), the full CLI and daemon mode remain necessary. We are actively improving JS coverage for those cases.

[GitHub](https://github.com/plasmate-labs/plasmate-wasm) | [npm](https://www.npmjs.com/package/plasmate-wasm) | [Full CLI](https://github.com/plasmate-labs/plasmate) | [Documentation](https://docs.plasmate.app)
