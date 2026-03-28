---
title: "Build a Web Research Agent with Plasmate in 50 Lines of Python"
slug: build-a-web-research-agent
date: 2026-03-22
author: David Hurley
author_url: https://timespent.xyz
summary: "A step-by-step tutorial for building a web research agent that uses SOM to browse the web efficiently. Python, OpenAI, and Plasmate -- nothing else needed."
tags: [tutorial, python, ai-agents, research-agent]
category: tutorial
---

Most web research agents burn through tokens reading raw HTML. Let's build one that doesn't.

In this tutorial, we'll create a Python agent that can research any topic by browsing the web using SOM. It'll use 4x fewer tokens than raw HTML while getting better structured results.

## Prerequisites

```bash
pip install openai requests
npm install -g plasmate
```

You'll need an OpenAI API key in your environment: `export OPENAI_API_KEY=sk-...`

## The agent

Here's the complete agent in 50 lines:

```python
import json
import subprocess
import openai

client = openai.OpenAI()

def fetch_som(url: str) -> dict:
    """Fetch a page as SOM using Plasmate."""
    result = subprocess.run(
        ["plasmate", "fetch", url, "--format", "json"],
        capture_output=True, text=True, timeout=30
    )
    return json.loads(result.stdout)

def extract_text(som: dict) -> str:
    """Extract readable text from SOM regions."""
    parts = []
    for region in som.get("regions", []):
        if region["role"] in ("main", "content"):
            for el in region.get("elements", []):
                if el.get("text"):
                    prefix = ""
                    if el["role"] == "heading":
                        level = el.get("attrs", {}).get("level", 2)
                        prefix = "#" * level + " "
                    elif el["role"] == "link":
                        href = el.get("attrs", {}).get("href", "")
                        parts.append(f"[{el['text']}]({href})")
                        continue
                    parts.append(f"{prefix}{el['text']}")
    return "\n\n".join(parts)

def research(query: str, urls: list[str]) -> str:
    """Research a query across multiple URLs."""
    context_parts = []
    for url in urls:
        try:
            som = fetch_som(url)
            text = extract_text(som)
            title = som.get("title", url)
            context_parts.append(f"## Source: {title}\nURL: {url}\n\n{text}")
        except Exception as e:
            context_parts.append(f"## Failed: {url}\nError: {e}")

    context = "\n\n---\n\n".join(context_parts)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a research assistant. "
             "Synthesize information from the provided sources to answer "
             "the user's question. Cite sources by URL."},
            {"role": "user", "content": f"Question: {query}\n\nSources:\n\n{context}"}
        ],
        temperature=0.2,
        max_tokens=2048,
    )
    return response.choices[0].message.content

# Example usage
answer = research(
    "What are the main differences between Rust and Go?",
    [
        "https://en.wikipedia.org/wiki/Rust_(programming_language)",
        "https://en.wikipedia.org/wiki/Go_(programming_language)",
        "https://doc.rust-lang.org/book/",
        "https://go.dev/doc/",
    ]
)
print(answer)
```

## How it works

1. **`fetch_som(url)`** calls Plasmate to convert any URL to SOM JSON
2. **`extract_text(som)`** walks the SOM regions and extracts text from `main` and `content` regions, preserving headings and links
3. **`research(query, urls)`** fetches multiple pages, builds a context document, and sends it to GPT-4o for synthesis

The key insight: by using SOM instead of raw HTML, each page costs ~8,000 tokens instead of ~33,000. That means you can fit 4x more pages into the same context window.

## Scaling it up

### Add the SOM Cache for speed

Replace the local `plasmate fetch` with the SOM Cache API to avoid crawling:

```python
def fetch_som_cached(url: str) -> dict:
    """Fetch SOM from the cache (faster, no local browser needed)."""
    resp = requests.get(
        "https://cache.plasmate.app/v1/som",
        params={"url": url},
        headers={"Authorization": f"Bearer {API_KEY}"}
    )
    return resp.json()
```

### Add search to find URLs automatically

Pair with a search API to make the agent fully autonomous:

```python
def auto_research(query: str) -> str:
    # Step 1: Search for relevant URLs
    search_results = search_web(query)  # Your preferred search API
    urls = [r["url"] for r in search_results[:5]]

    # Step 2: Research those URLs via SOM
    return research(query, urls)
```

### Use with LangChain

If you're in the LangChain ecosystem, use the [Plasmate SOM Loader](https://github.com/plasmate-labs/langchain-plasmate):

```python
from langchain_plasmate import PlasmateSOMLLoader

loader = PlasmateSOMLLoader(
    urls=["https://example.com", "https://other.com"],
    api_key="your-key"
)
docs = loader.load()
```

## Why not just use Markdown?

Markdown works fine for text extraction. But SOM gives you:

- **Interactive elements**: Know which text is a button vs a heading
- **Page structure**: Skip to the `main` region instead of scanning everything
- **Stable references**: Click elements by their SOM ID in multi-step workflows
- **Lower latency**: SOM is [faster than Markdown on Claude](https://blog.plasmate.app/html-vs-markdown-vs-som/)

If your agent only reads, Markdown is fine. If it reads *and acts*, SOM is the better choice.

---

**Full code and more examples:** [Plasmate Docs](https://docs.plasmate.app/tutorial-research-agent)

[GitHub](https://github.com/plasmate-labs/plasmate) -- [npm](https://www.npmjs.com/package/plasmate) -- [LangChain integration](https://github.com/plasmate-labs/langchain-plasmate)
