---
title: "Building a News Aggregator Agent That Reads 50 Sources in Under a Minute"
slug: building-a-news-aggregator-agent
date: 2026-03-29
author: David Hurley
author_url: https://timespent.xyz
summary: "A practical guide to building an AI agent that aggregates news from 50 sources, extracts headlines and summaries via SOM, and produces a daily briefing. With daemon mode, the entire pipeline runs in under 60 seconds."
tags: [tutorial, python, news, ai-agents, daemon]
category: tutorial
---

Reading the news used to mean opening ten tabs. Then it meant subscribing to RSS feeds. Now it means asking an AI agent to read everything for you and tell you what matters.

The problem: feeding 50 news sites as raw HTML into a language model is prohibitively expensive. At 33,000 tokens per page, 50 pages is 1.65 million input tokens. At $3 per million tokens, that is $5 per briefing. Do this daily and you are spending $150 per month on a news summary.

With SOM, the same 50 pages cost approximately 415,000 input tokens (8,300 per page average). That is $1.25 per briefing, $37 per month. The 4x savings makes daily operation practical.

With daemon mode, the 50 fetches complete in under 60 seconds instead of 3 to 4 minutes.

## The architecture

The agent follows a simple pipeline:

1. Start the Plasmate daemon (warm browser for fast fetches)
2. Fetch each news source and extract headlines from the SOM `main` region
3. Deduplicate stories that appear on multiple sources
4. Send the consolidated headline list to GPT-4o for summarization
5. Output a structured daily briefing

## The complete code

```python
#!/usr/bin/env python3
"""Daily news aggregator using Plasmate SOM."""

import json
import subprocess
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import openai

client = openai.OpenAI()

# News sources organized by category
SOURCES = {
    "tech": [
        "https://news.ycombinator.com",
        "https://arstechnica.com",
        "https://techcrunch.com",
        "https://www.theverge.com",
        "https://www.wired.com",
    ],
    "world": [
        "https://www.bbc.com/news",
        "https://www.reuters.com",
        "https://apnews.com",
        "https://www.theguardian.com/international",
        "https://www.cnn.com",
    ],
    "business": [
        "https://www.forbes.com",
        "https://www.bloomberg.com",
        "https://www.ft.com",
    ],
    "science": [
        "https://www.nature.com",
        "https://www.sciencedaily.com",
        "https://phys.org",
    ],
}


def ensure_daemon():
    """Start the Plasmate daemon if not already running."""
    result = subprocess.run(
        ["plasmate", "daemon", "status"],
        capture_output=True, text=True
    )
    if "running" not in result.stderr.lower():
        print("Starting Plasmate daemon...", file=sys.stderr)
        subprocess.Popen(
            ["plasmate", "daemon", "start"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(3)  # Wait for daemon to initialize


def fetch_som(url: str) -> dict:
    """Fetch a page via Plasmate (auto-delegates to daemon if running)."""
    try:
        result = subprocess.run(
            ["plasmate", "fetch", url],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    return None


def extract_headlines(som: dict, source_url: str) -> list:
    """Extract headlines and links from the main region of a SOM document."""
    headlines = []
    for region in som.get("regions", []):
        if region.get("role") not in ("main", "content"):
            continue
        for el in region.get("elements", []):
            role = el.get("role", "")
            text = el.get("text", "").strip()

            if role == "heading" and text and len(text) > 15:
                headlines.append({
                    "title": text,
                    "source": source_url,
                    "source_name": som.get("title", source_url),
                })
            elif role == "link" and text and len(text) > 20:
                href = el.get("attrs", {}).get("href", "")
                if href and not href.startswith("#"):
                    headlines.append({
                        "title": text,
                        "url": href,
                        "source": source_url,
                        "source_name": som.get("title", source_url),
                    })
    return headlines


def fetch_all_sources() -> dict:
    """Fetch all sources in parallel, organized by category."""
    all_headlines = defaultdict(list)
    urls = []
    for category, source_list in SOURCES.items():
        for url in source_list:
            urls.append((category, url))

    print(f"Fetching {len(urls)} sources...", file=sys.stderr)
    start = time.time()

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {}
        for category, url in urls:
            future = executor.submit(fetch_som, url)
            futures[future] = (category, url)

        for future in as_completed(futures):
            category, url = futures[future]
            som = future.result()
            if som:
                headlines = extract_headlines(som, url)
                all_headlines[category].extend(headlines)
                print(
                    f"  {url}: {len(headlines)} headlines",
                    file=sys.stderr
                )
            else:
                print(f"  {url}: FAILED", file=sys.stderr)

    elapsed = time.time() - start
    total = sum(len(h) for h in all_headlines.values())
    print(
        f"Fetched {total} headlines from {len(urls)} sources "
        f"in {elapsed:.1f}s",
        file=sys.stderr
    )
    return dict(all_headlines)


def generate_briefing(headlines_by_category: dict) -> str:
    """Generate a daily briefing using GPT-4o."""
    context_parts = []
    for category, headlines in headlines_by_category.items():
        items = "\n".join(
            f"- {h['title']} (via {h['source_name']})"
            for h in headlines[:30]  # Cap per category
        )
        context_parts.append(f"## {category.upper()}\n{items}")

    context = "\n\n".join(context_parts)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a news briefing assistant. Given headlines "
                    "from multiple sources organized by category, produce "
                    "a concise daily briefing. For each category, identify "
                    "the 3 to 5 most important stories, write a one-sentence "
                    "summary of each, and note which sources covered it. "
                    "Deduplicate stories that appear on multiple sources. "
                    "Use a professional, concise tone."
                ),
            },
            {
                "role": "user",
                "content": f"Today's headlines:\n\n{context}",
            },
        ],
        temperature=0.3,
        max_tokens=2048,
    )
    return response.choices[0].message.content


def main():
    ensure_daemon()
    headlines = fetch_all_sources()
    briefing = generate_briefing(headlines)
    print(briefing)


if __name__ == "__main__":
    main()
```

## How it works step by step

### Daemon startup

The script checks if the Plasmate daemon is running and starts it if not. The daemon keeps the browser warm, so the first fetch takes 2 to 3 seconds but all subsequent fetches complete in 200 to 400 milliseconds.

### Parallel fetching

The `ThreadPoolExecutor` with 8 workers fetches all sources concurrently. Since each fetch delegates to the daemon over localhost, the parallelism is effective. 50 sources complete in approximately 30 to 60 seconds with daemon mode, compared to 3 to 4 minutes with sequential cold-start fetches.

### Headline extraction

The `extract_headlines` function reads the SOM output and looks for headings and links in the `main` and `content` regions. It skips short text (likely navigation labels) and fragment-only links (internal page anchors). The structured SOM output makes this extraction reliable because element roles are explicit.

### Deduplication and summarization

The headline list is sent to GPT-4o with instructions to identify the most important stories, deduplicate across sources, and produce a concise briefing. The total input is typically 5,000 to 15,000 tokens (the headlines, not the full articles), keeping the cost low.

## Cost analysis

| Approach | Input tokens (50 pages) | API cost | Fetch time |
|----------|------------------------|----------|-----------|
| Raw HTML | 1,650,000 | $4.95 | 3 to 4 minutes |
| SOM (no daemon) | 415,000 | $1.25 | 3 to 4 minutes |
| SOM (daemon) | 415,000 | $1.25 | 30 to 60 seconds |
| Headlines only (this approach) | 10,000 | $0.03 | 30 to 60 seconds |

The headline extraction step reduces tokens further because we only send the extracted headlines to GPT-4o, not the full page content. For a daily briefing, the total cost is approximately 3 cents per run.

## Extending the agent

### Add email delivery

```python
import smtplib
from email.mime.text import MIMEText

def send_briefing(briefing: str, to: str):
    msg = MIMEText(briefing)
    msg["Subject"] = f"Daily Briefing - {time.strftime('%Y-%m-%d')}"
    msg["From"] = "agent@yourserver.com"
    msg["To"] = to
    
    with smtplib.SMTP("localhost") as s:
        s.send_message(msg)
```

### Run on a schedule

```bash
# Add to crontab: daily at 7 AM
0 7 * * * cd /path/to/agent && python3 news_aggregator.py | mail -s "Daily Briefing" you@email.com
```

### Add full-article summarization

For the top stories, fetch the full article and summarize:

```python
def summarize_article(url: str) -> str:
    som = fetch_som(url)
    if not som:
        return "Could not fetch article."
    
    text_parts = []
    for region in som.get("regions", []):
        if region.get("role") == "main":
            for el in region.get("elements", []):
                if el.get("text"):
                    text_parts.append(el["text"])
    
    article_text = "\n".join(text_parts)
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "Summarize this article in 3 bullet points."},
            {"role": "user", "content": article_text},
        ],
        temperature=0.2,
        max_tokens=300,
    )
    return response.choices[0].message.content
```

## Why SOM is the right choice for news aggregation

News sites are among the noisiest pages on the web. They contain heavy advertising markup, tracking pixels, newsletter signup modals, cookie consent banners, and extensive navigation. In our benchmark, news and adversarial pages showed 5.4x to 6.0x compression ratios (HTML to SOM), the highest of any category.

SOM strips this noise at compile time. The `main` region contains the actual content. Headlines are typed as headings and links with their destinations. The agent never sees the ad containers, the tracking scripts, or the 15 "Subscribe Now" buttons.

For a news aggregator that reads 50 pages per run, this noise reduction is the difference between a $5 daily bill and a 3-cent daily bill.

[GitHub](https://github.com/plasmate-labs/plasmate) | [Daemon Mode](https://blog.plasmate.app/daemon-mode/) | [Documentation](https://docs.plasmate.app)
