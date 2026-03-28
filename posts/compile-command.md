---
title: "New: plasmate compile Lets Publishers Generate SOM Without Network Requests"
slug: compile-command
date: 2026-03-28
author: David Hurley
author_url: https://timespent.xyz
summary: "Publishers can now feed HTML directly to the Plasmate compiler from files or stdin. No browser, no network requests, no extra infrastructure. Just HTML in, SOM out."
tags: [announcement, plasmate, publishers, som]
category: announcement
---

A common question from publishers evaluating SOM: "Why do I need to point Plasmate at my own URL to generate SOM for my own content? I already have the HTML."

Fair point. Until now, the primary CLI interface was `plasmate fetch <url>`, which bundles fetching and compiling into a single step. That is convenient for agents consuming external sites, but it is unnecessary overhead for publishers who already have their HTML in a build pipeline, a CMS render, or a file on disk.

Today we are shipping `plasmate compile`, a new command that accepts HTML directly from a file or stdin and produces SOM output with zero network requests.

## Usage

### From a file

```bash
plasmate compile --file index.html --url https://mysite.com
```

The `--url` flag provides the page origin for stable ID generation. No network request is made to that URL. It is metadata only.

### From stdin

```bash
cat build/index.html | plasmate compile --url https://mysite.com
```

### From a build pipeline

```bash
hugo --render-to-disk
for f in public/**/*.html; do
  slug=$(echo "$f" | sed 's|public/||;s|/index.html||;s|\.html||')
  plasmate compile --file "$f" --url "https://mysite.com/$slug" \
    --output "public/.well-known/som/$slug.json"
done
```

### From a CMS hook

```python
import subprocess
import json

def on_publish(page_html: str, page_url: str) -> dict:
    """Generate SOM when a page is published."""
    result = subprocess.run(
        ["plasmate", "compile", "--url", page_url],
        input=page_html,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)
```

## Why this matters for publishers

The `compile` command makes Plasmate a pure compiler. HTML goes in, SOM comes out. No browser engine, no HTTP client, no external dependencies at runtime. This means:

**No extra infrastructure.** Publishers do not need to run a headless browser or a separate service. The compiler is a single binary that reads from stdin or a file.

**No network traffic.** The HTML never leaves the publisher's machine. There is no round trip to a URL. This addresses the concern that SOM generation should not require serving your own content over HTTP just to read it back.

**Build pipeline integration.** The compiler fits naturally into existing static site generators, CMS publish hooks, and CI/CD pipelines. It is a Unix-style tool: it reads input, produces output, and composes with other tools.

**Deterministic output.** Given the same HTML and the same URL parameter, the compiler always produces the same SOM. This makes it suitable for diffing, caching, and version control.

## When to use compile vs fetch

| Command | Use case |
|---------|----------|
| `plasmate fetch <url>` | Agents consuming external sites. Handles JavaScript execution, cookie auth, and dynamic rendering. |
| `plasmate compile --file <path>` | Publishers generating SOM from their own pre-rendered HTML. No browser needed. |

If your HTML is static (already rendered, no client-side JavaScript required to produce content), use `compile`. If the page requires JavaScript execution to render meaningful content (SPAs, dynamically loaded data), use `fetch`.

## Library usage

The compiler has always been available as a library function. In Rust:

```rust
use plasmate::som::compiler::compile;

let html = std::fs::read_to_string("page.html")?;
let som = compile(&html, "https://mysite.com/page")?;
println!("{}", serde_json::to_string_pretty(&som)?);
```

The `compile` function takes two arguments: the HTML string and a URL for stable ID generation. It returns a structured `Som` object that serializes to JSON.

Python and Node SDK wrappers for direct compilation are planned.

## Get started

```bash
npm install -g plasmate@latest
echo '<h1>Hello</h1><p>World</p>' | plasmate compile --url https://example.com
```

[GitHub](https://github.com/plasmate-labs/plasmate) | [SOM Spec](https://docs.plasmate.app/som-spec) | [SOM-first Websites Guide](https://blog.plasmate.app/som-first-websites/)
