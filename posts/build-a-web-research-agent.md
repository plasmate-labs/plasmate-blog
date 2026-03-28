---
title: "Build a Web Research Agent with Plasmate in 50 Lines of Python"
slug: build-a-web-research-agent
date: 2026-03-22
author: David Hurley
author_url: https://timespent.xyz
summary: "A complete tutorial for building a web research agent that uses SOM to browse the web at 4x lower token cost. Python, OpenAI, and Plasmate. Full code included."
tags: [tutorial, python, ai-agents, research-agent]
category: tutorial
---

Most web research agents burn through tokens reading raw HTML. A single page can consume 30,000 tokens of context, and the majority of those tokens encode CSS classes, tracking scripts, and layout containers that mean nothing to the language model doing the actual reasoning.

In this tutorial, we will build a Python research agent that uses the Semantic Object Model (SOM) instead of raw HTML. The agent will fetch multiple web pages, extract structured content, and synthesize answers using GPT-4o. The same approach works with Claude, Gemini, or any model that accepts text input.

By the end, you will have a working agent that uses 4x fewer tokens per page than a raw HTML approach.

## Prerequisites

You need Python 3.9 or later, an OpenAI API key, and Plasmate installed:

```bash
pip install openai requests
npm install -g plasmate
```

Set your API key as an environment variable:

```bash
export OPENAI_API_KEY=sk-your-key-here
```

Verify Plasmate is working:

```bash
plasmate fetch https://example.com
```

This should print a JSON document containing the SOM representation of example.com.

## Understanding the SOM output

Before writing the agent, let us look at what Plasmate produces. Fetch a real page:

```bash
plasmate fetch https://news.ycombinator.com | python3 -m json.tool | head -40
```

The output is a JSON document with this top-level structure:

```json
{
  "som_version": "0.1",
  "url": "https://news.ycombinator.com",
  "title": "Hacker News",
  "lang": "en",
  "regions": [
    {
      "id": "r_navigation",
      "role": "navigation",
      "elements": [...]
    },
    {
      "id": "r_main",
      "role": "main",
      "elements": [...]
    },
    {
      "id": "r_footer",
      "role": "footer",
      "elements": [...]
    }
  ],
  "meta": {
    "html_bytes": 42871,
    "som_bytes": 32104,
    "element_count": 312,
    "interactive_count": 187
  }
}
```

The page is divided into semantic regions. Each region contains typed elements. Each element has a role, text content, and (for interactive elements) a list of available actions.

A link element looks like this:

```json
{
  "id": "e_8f2a1b3c4d5e",
  "role": "link",
  "text": "Show HN: A new approach to database migrations",
  "attrs": { "href": "https://example.com/article" },
  "actions": ["click"]
}
```

A heading element looks like this:

```json
{
  "id": "e_7c6d5e4f3a2b",
  "role": "heading",
  "text": "Hacker News",
  "attrs": { "level": 1 }
}
```

This structure is what our agent will consume. Compared to raw HTML (which would include every Tailwind class, every table cell attribute, every spacer gif), the SOM representation carries only the information a reasoning model needs.

## The complete agent

Here is the full research agent in Python:

```python
import json
import subprocess
import sys

import openai
import requests

client = openai.OpenAI()

# --- SOM fetching ---

def fetch_som_local(url: str) -> dict:
    """Fetch a page as SOM using the local Plasmate CLI."""
    result = subprocess.run(
        ["plasmate", "fetch", url, "--format", "json"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Plasmate failed for {url}: {result.stderr[:200]}")
    return json.loads(result.stdout)


def fetch_som_cached(url: str, api_key: str) -> dict:
    """Fetch a page from the SOM Cache API (faster, no local browser)."""
    resp = requests.get(
        "https://cache.plasmate.app/v1/som",
        params={"url": url},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_som(url: str, api_key: str = None) -> dict:
    """Fetch SOM, preferring the cache when an API key is available."""
    if api_key:
        try:
            return fetch_som_cached(url, api_key)
        except Exception:
            pass  # Fall back to local
    return fetch_som_local(url)


# --- Content extraction ---

def extract_text_from_som(som: dict) -> str:
    """
    Walk the SOM regions and extract readable text content.
    Focuses on 'main' and 'content' regions for article text,
    but includes navigation for link discovery.
    """
    sections = []

    for region in som.get("regions", []):
        role = region.get("role", "content")

        # Skip footer regions (usually boilerplate)
        if role == "footer":
            continue

        region_parts = []
        for element in region.get("elements", []):
            text = element.get("text", "").strip()
            if not text:
                continue

            el_role = element.get("role", "paragraph")

            if el_role == "heading":
                level = element.get("attrs", {}).get("level", 2)
                prefix = "#" * level + " "
                region_parts.append(f"{prefix}{text}")

            elif el_role == "link":
                href = element.get("attrs", {}).get("href", "")
                region_parts.append(f"[{text}]({href})")

            elif el_role == "list":
                items = element.get("attrs", {}).get("items", [])
                for item in items:
                    item_text = item.get("text", "")
                    if item_text:
                        region_parts.append(f"  * {item_text}")

            elif el_role == "table":
                headers = element.get("attrs", {}).get("headers", [])
                rows = element.get("attrs", {}).get("rows", [])
                if headers:
                    region_parts.append(" | ".join(headers))
                    region_parts.append(" | ".join(["---"] * len(headers)))
                for row in rows[:15]:
                    region_parts.append(" | ".join(row))

            else:
                region_parts.append(text)

        if region_parts:
            header = f"[{role.upper()}]" if role != "main" else ""
            if header:
                sections.append(header)
            sections.append("\n".join(region_parts))

    return "\n\n".join(sections)


# --- Research function ---

def research(query: str, urls: list, api_key: str = None) -> str:
    """
    Research a query by fetching multiple URLs as SOM,
    extracting content, and synthesizing with GPT-4o.
    """
    context_parts = []
    total_tokens_estimate = 0

    for url in urls:
        try:
            som = fetch_som(url, api_key=api_key)
            text = extract_text_from_som(som)
            title = som.get("title", url)
            meta = som.get("meta", {})

            html_tokens = meta.get("html_bytes", 0) // 4  # rough estimate
            som_tokens = meta.get("som_bytes", 0) // 4
            total_tokens_estimate += som_tokens

            context_parts.append(
                f"## Source: {title}\n"
                f"URL: {url}\n"
                f"(HTML would have been ~{html_tokens:,} tokens; "
                f"SOM is ~{som_tokens:,} tokens)\n\n"
                f"{text}"
            )
            print(f"  Fetched: {title} ({som_tokens:,} tokens)", file=sys.stderr)

        except Exception as e:
            context_parts.append(f"## Failed: {url}\nError: {e}")
            print(f"  Failed: {url}: {e}", file=sys.stderr)

    context = "\n\n---\n\n".join(context_parts)
    print(
        f"\nTotal context: ~{total_tokens_estimate:,} estimated tokens "
        f"across {len(urls)} pages",
        file=sys.stderr,
    )

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a research assistant. Synthesize information "
                    "from the provided web page sources to answer the "
                    "user's question thoroughly. Cite sources by URL when "
                    "making specific claims. If sources conflict, note "
                    "the disagreement."
                ),
            },
            {
                "role": "user",
                "content": f"Research question: {query}\n\nSources:\n\n{context}",
            },
        ],
        temperature=0.2,
        max_tokens=2048,
    )

    return response.choices[0].message.content


# --- Main ---

if __name__ == "__main__":
    answer = research(
        query="What are the key differences between Rust and Go for systems programming?",
        urls=[
            "https://en.wikipedia.org/wiki/Rust_(programming_language)",
            "https://en.wikipedia.org/wiki/Go_(programming_language)",
            "https://doc.rust-lang.org/book/",
            "https://go.dev/doc/",
        ],
    )
    print("\n" + answer)
```

## How each function works

### `fetch_som()` and its variants

The agent supports two backends for fetching SOM: the local Plasmate CLI and the SOM Cache API.

The local CLI (`fetch_som_local`) shells out to `plasmate fetch` and parses the JSON output. This requires a browser engine running locally but works without an API key and supports any URL.

The cache API (`fetch_som_cached`) makes an HTTP request to cache.plasmate.app. This is faster (no local browser startup) and benefits from shared caching (if another agent has already fetched this URL, you get it instantly). It requires an API key.

The wrapper function (`fetch_som`) tries the cache first when a key is available and falls back to local.

### `extract_text_from_som()`

This function walks the SOM region tree and converts elements into a readable text format. It handles different element roles appropriately:

Headings become Markdown-style headers (`## Title`) with the correct level.

Links become inline references (`[text](url)`) so the model can see both the anchor text and the destination.

Lists are expanded into bullet points from the structured `items` array in the element attributes.

Tables are formatted as pipe-delimited rows with headers, preserving the structured data that SOM extracted from HTML `<table>` elements.

Footer regions are skipped entirely because they typically contain copyright notices, privacy links, and other boilerplate that adds noise without adding information.

### `research()`

The main function fetches each URL, extracts text, builds a context document, and sends it to GPT-4o for synthesis. It also logs token estimates to stderr so you can see the savings in real time.

The system prompt instructs the model to synthesize across sources, cite URLs, and flag disagreements. The temperature is set to 0.2 for factual consistency.

## Token savings in practice

When you run this agent on the four URLs in the example, the output on stderr will show something like:

```
  Fetched: Rust (programming language) - Wikipedia (14,200 tokens)
  Fetched: Go (programming language) - Wikipedia (11,800 tokens)
  Fetched: The Rust Programming Language (2,400 tokens)
  Fetched: Documentation - The Go Programming Language (1,900 tokens)

Total context: ~30,300 estimated tokens across 4 pages
```

With raw HTML, the same four pages would consume approximately 120,000 tokens of context. The SOM approach fits all four pages comfortably in a single GPT-4o context window, while the HTML approach would require either truncation or a more expensive model with a larger window.

At $2.50 per million input tokens, the SOM approach costs approximately $0.08 for these four pages. The HTML approach would cost approximately $0.30.

## Scaling up

### Adding search for autonomous research

The agent above requires you to provide URLs. To make it fully autonomous, add a search step that finds relevant URLs:

```python
def search_web(query: str, num_results: int = 5) -> list:
    """Search the web and return a list of URLs."""
    # Use your preferred search API: Brave, SerpAPI, Google Custom Search, etc.
    resp = requests.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={"q": query, "count": num_results},
        headers={"X-Subscription-Token": "YOUR_BRAVE_KEY"},
    )
    return [r["url"] for r in resp.json().get("web", {}).get("results", [])]


def auto_research(query: str) -> str:
    """Fully autonomous research: search, fetch, synthesize."""
    urls = search_web(query, num_results=5)
    return research(query, urls)
```

### Using LangChain

If you work in the LangChain ecosystem, the [langchain-plasmate](https://github.com/plasmate-labs/langchain-plasmate) package provides a native document loader:

```python
from langchain_plasmate import PlasmateSOMLLoader
from langchain_openai import ChatOpenAI
from langchain.chains.summarize import load_summarize_chain

loader = PlasmateSOMLLoader(
    urls=[
        "https://en.wikipedia.org/wiki/Artificial_intelligence",
        "https://openai.com",
        "https://anthropic.com",
    ],
    api_key="your-cache-api-key",
)
documents = loader.load()

llm = ChatOpenAI(model="gpt-4o", temperature=0.2)
chain = load_summarize_chain(llm, chain_type="map_reduce")
result = chain.invoke(documents)
print(result["output_text"])
```

Each Document object contains extracted text in `page_content` and metadata including the source URL, page title, SOM version, compression ratio, and byte counts.

### Batch processing with the SOM Cache

For processing many URLs, the SOM Cache supports batch requests:

```python
def fetch_som_batch(urls: list, api_key: str) -> list:
    """Fetch multiple URLs in a single API call."""
    resp = requests.post(
        "https://cache.plasmate.app/v1/som/batch",
        json={"urls": urls},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["results"]
```

This is more efficient than individual requests because the cache can parallelize fetches and return cached results instantly for URLs it has already seen.

## Why SOM instead of Markdown for research agents

For pure text extraction (summarize this article), Markdown works fine and produces fewer tokens than SOM. But SOM provides advantages that matter as your agent grows in sophistication:

**Structured data extraction.** SOM preserves tables, lists, and hierarchical content as structured JSON. A Markdown table is just pipe-delimited text that the model has to parse. A SOM table is a JSON array of arrays with named headers.

**Interactive awareness.** If your agent needs to follow links, fill search forms, or navigate pagination, SOM tells it exactly which elements are interactive and what actions are available. Markdown cannot represent buttons or form fields.

**Page structure.** SOM separates navigation from main content from sidebars. Your extraction function can skip regions that are not relevant to the research task. With Markdown, everything is a flat stream of text.

**Consistent structure.** SOM output has a predictable JSON schema regardless of the source site. Your extraction code works the same way for Wikipedia, the New York Times, and a random startup's landing page. Markdown quality varies significantly depending on the conversion tool and the source HTML.

## Prompting and citations: getting reliable synthesis

A research agent succeeds or fails based on whether the synthesis step stays grounded in sources. Two simple techniques help a lot.

First, format the context so every claim has an obvious URL anchor. In this tutorial we prepend each source with a title and an explicit URL line. That is not decoration. Models are much more likely to cite correctly when the URL appears as a standalone token sequence near the relevant text.

Second, ask for citations as part of the response contract, not as an afterthought. A good system prompt makes citations a required output format and asks the model to explicitly flag uncertainty. If you want higher precision, you can also request that the model quote the specific sentence it relied on, then attach the URL.

When you scale beyond a handful of pages, chunking becomes important. SOM gives you natural chunk boundaries: regions, headings, and tables. A practical strategy is:

- Split by region first, take `main` and `content` by default.
- Within a region, split on headings and large tables.
- Keep each chunk under a fixed token budget, then embed and retrieve.

This produces more reliable retrieval than naive character splitting, because chunks align with the page’s semantic structure.

## Next steps

The full source code for this tutorial is available in the [Plasmate documentation](https://docs.plasmate.app/tutorial-research-agent).

To go further:

Install the [MCP server](https://docs.plasmate.app/integration-mcp) so Claude Desktop or Cursor can use Plasmate directly.

Try the [SOM Cache dashboard](https://cache.plasmate.app) to see real-time stats on cached URLs.

Read the [SOM Spec](https://docs.plasmate.app/som-spec) to understand the full element model.

[GitHub](https://github.com/plasmate-labs/plasmate) | [npm](https://www.npmjs.com/package/plasmate) | [LangChain Integration](https://github.com/plasmate-labs/langchain-plasmate) | [Documentation](https://docs.plasmate.app)
