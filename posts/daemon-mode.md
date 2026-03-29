---
title: "Daemon Mode: How Plasmate Went from 2 Seconds to 200 Milliseconds Per Page"
slug: daemon-mode
date: 2026-03-29
author: David Hurley
author_url: https://timespent.xyz
summary: "The biggest complaint about Plasmate was cold-start latency. Daemon mode keeps the browser warm between fetches, cutting per-page time from 2 to 5 seconds down to 200 milliseconds."
tags: [announcement, performance, plasmate, daemon]
category: deep-dive
---

The most common objection to using Plasmate over simpler tools like web_fetch or readability was speed. A tool that takes 200 milliseconds to return text will always be preferred over one that takes 3 seconds, regardless of how much better the structured output is.

That objection is now resolved.

## The cold-start problem

Every time you ran `plasmate fetch`, the following happened:

1. The Plasmate binary started
2. A new HTTP client was initialized with TLS, cookie jar, and connection pool
3. The page was fetched over the network
4. JavaScript was executed (if enabled), including loading external scripts
5. The DOM was analyzed and compiled to SOM
6. The result was serialized to JSON and printed

Steps 1 and 2 took roughly 500 milliseconds to 1 second. Step 3 added network latency. Step 4 could take 500 milliseconds to several seconds for JS-heavy pages. Steps 5 and 6 were fast (microseconds for compilation, a few milliseconds for serialization).

The total was typically 2 to 5 seconds per page. For a single fetch, this is tolerable. For an agent that reads 10 pages in a research session, it means 20 to 50 seconds of wait time. For a monitoring system checking 100 pages on a schedule, it means minutes of overhead that is almost entirely startup cost.

## The daemon solution

Daemon mode keeps a persistent process running with a warm HTTP client. The client maintains open connections, TLS sessions are cached, and the process is already initialized when a request arrives.

```bash
# Start the daemon (runs in foreground, or background with &)
plasmate daemon start

# Now fetches are fast
plasmate fetch https://example.com      # ~200ms (warm)
plasmate fetch https://news.ycombinator.com  # ~300ms
plasmate fetch https://docs.python.org  # ~250ms
```

When `plasmate fetch` detects a running daemon (via a PID file at `~/.plasmate/daemon.pid`), it delegates the request over a local TCP connection instead of doing the work itself. The daemon handles the fetch, JS execution, and SOM compilation, then returns the result.

If no daemon is running, `plasmate fetch` falls back to the normal direct path. No configuration change needed. The behavior is the same, just slower.

## Architecture

The daemon is a lightweight HTTP server bound to `127.0.0.1:9224` (configurable). It exposes three endpoints:

**POST /fetch** accepts a JSON body with the URL and options, returns SOM JSON. This is the primary endpoint that `plasmate fetch` calls.

**GET /health** returns uptime and request count. Useful for monitoring.

**POST /shutdown** cleanly stops the daemon and removes the PID file.

The daemon reuses a single `reqwest::Client` across all requests. This client maintains a connection pool with keep-alive, so repeated fetches to the same domain reuse existing TCP and TLS connections. For sites like documentation portals where an agent reads many pages from the same origin, this provides substantial additional speedup.

## Graceful degradation

A common problem with Plasmate has been JavaScript execution failures on certain sites. The daemon addresses this with built-in fallback: when the JS pipeline fails for a page, the daemon compiles the pre-JavaScript HTML and returns partial SOM. The response includes a note indicating that JS execution was skipped.

This means the daemon never returns an error for a page that is reachable over HTTP. You always get structured output, even if JS-rendered content is missing. For many pages (documentation, news articles, government sites), the static HTML contains all the content and the JS pipeline adds nothing.

## Management

```bash
# Start in the background
plasmate daemon start &

# Check status
plasmate daemon status
# Output: Daemon running on port 9224 {"status":"ok","uptime_seconds":3600,"requests_served":47}

# Stop cleanly
plasmate daemon stop
```

The daemon writes its PID and port to `~/.plasmate/daemon.pid`. If the process dies unexpectedly, the next `plasmate fetch` call detects the stale PID file, cleans it up, and falls back to direct mode.

## Performance comparison

Testing against 10 sequential fetches of different URLs:

| Mode | Total time | Per page |
|------|-----------|----------|
| No daemon (cold start each time) | 32 seconds | 3.2 seconds |
| Daemon (warm) | 2.8 seconds | 280 milliseconds |
| web_fetch (readability) | 3.1 seconds | 310 milliseconds |

Daemon mode is now competitive with web_fetch on speed while providing structured SOM output that web_fetch cannot: semantic regions, typed elements, interaction affordances, ARIA states, and stable identifiers.

## When to use daemon mode

**Research agents** that read multiple pages per session. Start the daemon when the agent starts, stop it when the session ends.

**Monitoring systems** that check pages on a schedule. Keep the daemon running permanently.

**Development and testing** where you are iterating on SOM output for specific pages. The fast turnaround makes experimentation practical.

**CI/CD pipelines** that generate SOM for multiple pages during a build. Start the daemon at the beginning of the pipeline, run all fetches, stop at the end.

For single one-off fetches, the daemon adds no benefit (the cold start is the same). For two or more fetches in the same session, the daemon pays for itself immediately.

## Try it

```bash
npm install -g plasmate@latest

# Start daemon
plasmate daemon start &

# Fetch pages (auto-delegates to daemon)
plasmate fetch https://react.dev
plasmate fetch https://docs.python.org/3/
plasmate fetch https://kubernetes.io/docs/concepts/overview/

# Check how many requests the daemon served
plasmate daemon status

# Stop when done
plasmate daemon stop
```

[GitHub](https://github.com/plasmate-labs/plasmate) | [Documentation](https://docs.plasmate.app) | [Blog](https://blog.plasmate.app)
