---
title: "Authenticated Browsing for AI Agents: How to Let Your Agent Log In as You"
slug: authenticated-browsing-for-agents
date: 2026-03-24
author: David Hurley
author_url: https://timespent.xyz
summary: "Your AI agent needs to browse sites you're logged into -- Twitter, LinkedIn, internal tools. Here is how Plasmate handles authenticated sessions securely."
tags: [tutorial, authentication, cookies, ai-agents]
category: tutorial
---

Your agent needs to read your Twitter feed. Or check your Jira board. Or browse an internal wiki. But these pages require login, and you (correctly) don't want to give your agent your password.

Plasmate solves this with cookie-based authenticated browsing. Your real browser session stays secure -- the agent just borrows the cookies it needs.

## How it works

1. You install the Plasmate browser extension in Chrome
2. The extension encrypts your cookies and sends them to a local bridge server (127.0.0.1 only -- never leaves your machine)
3. Plasmate uses those cookies when fetching pages, so it sees the same logged-in content you do
4. Cookies are stored in encrypted profiles, not plain text

No passwords are shared. No OAuth flows to configure. If you're logged into a site in Chrome, your agent can see it too.

## Setup

### 1. Install the extension

Get the [Plasmate browser extension](https://github.com/plasmate-labs/plasmate-extension) from the Chrome Web Store or build from source.

### 2. Start the auth bridge

```bash
plasmate auth serve
```

This starts a local server on `127.0.0.1:9876` that receives encrypted cookies from the extension. It binds to localhost only -- nothing is exposed to the network.

### 3. Push cookies from your browser

Click the Plasmate extension icon and select "Push cookies for this site." The extension sends an encrypted cookie snapshot to the bridge.

### 4. Fetch authenticated pages

```bash
plasmate fetch https://twitter.com/home --profile default
```

The `--profile` flag tells Plasmate which cookie profile to use. You can create separate profiles for different accounts or contexts.

## Security model

- Cookies are **AES-256 encrypted** at rest
- The bridge server binds to **127.0.0.1 only** -- no network exposure
- Cookie profiles are **per-machine** -- they don't sync or upload anywhere
- You control **which sites** to push cookies for -- the extension doesn't auto-export everything

## Example: Agent browses X/Twitter

```bash
# Start the bridge
plasmate auth serve &

# Push your Twitter cookies (from the extension)
# Then fetch your feed:
plasmate fetch https://x.com/home --profile default

# The agent sees your personalized timeline as SOM
```

The SOM output includes your feed's posts, links, and interactive elements (like, retweet, reply buttons) -- structured for agent consumption.

## Example: Internal tools

```bash
# Push cookies for your company's Jira
# Then:
plasmate fetch https://yourcompany.atlassian.net/browse/PROJ-123 \
  --profile work
```

The agent gets the ticket details, assignee, status, comments -- without needing Jira API credentials or OAuth setup.

## When to use this vs API access

| Approach | Best for |
|----------|----------|
| Authenticated browsing | Quick access to any logged-in site. No API key needed. |
| Official APIs | Production workflows. Rate limits. Structured data. |
| SOM Cache | Public pages. No auth needed. Fastest. |

Authenticated browsing is ideal for personal agents and prototyping. For production systems serving many users, prefer official APIs where available.

---

**Full guide:** [Authenticated Browsing](https://docs.plasmate.app/guide-authenticated-browsing)

**Non-technical guide:** [Your Agent on X/Twitter](https://docs.plasmate.app/guide-agent-browses-twitter)

[GitHub](https://github.com/plasmate-labs/plasmate) -- [Extension](https://github.com/plasmate-labs/plasmate-extension)
