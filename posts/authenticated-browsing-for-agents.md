---
title: "Authenticated Browsing for AI Agents: How to Let Your Agent Log In as You"
slug: authenticated-browsing-for-agents
date: 2026-03-24
author: David Hurley
author_url: https://timespent.xyz
summary: "Your AI agent needs to browse sites you are logged into. Twitter, LinkedIn, internal tools. Here is how Plasmate handles authenticated sessions without sharing passwords."
tags: [tutorial, authentication, cookies, ai-agents]
category: tutorial
---

Your AI agent needs to read your Twitter feed, check your Jira board, browse an internal wiki, or monitor a competitor's pricing page that requires login. These are common agent tasks, but they all require authenticated access to web content.

The naive approach is to give the agent your username and password. This is a terrible idea for obvious reasons: credential exposure, session conflicts, two-factor authentication challenges, and the fundamental insecurity of storing plaintext credentials in an agent's configuration.

The better approach is to let the agent borrow your existing browser session. You are already logged in. Your browser already has valid cookies. The agent just needs access to those cookies, securely and with your explicit control.

Plasmate implements this through a cookie-based authenticated browsing system: a browser extension that exports cookies, a local bridge server that receives them, and encrypted cookie profiles that the headless browser uses when fetching pages.

## Architecture overview

The authenticated browsing system has four components:

### 1. The browser extension

The [Plasmate browser extension](https://github.com/plasmate-labs/plasmate-extension) runs in your Chrome (or Chromium-based) browser. When you click "Push cookies for this site," it reads the cookies for the current domain and sends them to the bridge server.

The extension does not read all your cookies. It only sends cookies for the specific site you authorize. You decide which domains the agent can access.

### 2. The bridge server

The bridge server (`plasmate auth serve`) runs locally on your machine. It listens on `127.0.0.1:9876` and receives encrypted cookie payloads from the extension.

The critical security property: the bridge server binds to localhost only. It never listens on a network interface. No one on your LAN, your VPN, or the internet can connect to it. The cookies never leave your machine unless you explicitly use a remote deployment (in which case you control the transport).

### 3. Encrypted cookie profiles

Cookies received by the bridge are encrypted with AES-256 and stored in named profiles. A profile is a collection of cookies for one or more domains, associated with a label you choose.

You might have a "personal" profile with your Twitter and Gmail cookies, a "work" profile with your Jira and Confluence cookies, and a "research" profile with your paid news site subscriptions.

Profiles are stored on disk in encrypted form. The encryption key is derived from your system keychain on macOS, from the credential store on Windows, or from an environment variable on Linux.

### 4. The headless browser

When Plasmate fetches a URL with a profile specified, it loads the relevant cookies into the headless browser's cookie jar before navigating. The page loads as if you were browsing it yourself: your login session is active, your preferences are applied, and personalized content is rendered.

The SOM output then includes the authenticated page content.

## Cookie semantics that matter in practice

If you have only used cookies as a black box, authenticated browsing can feel mysterious. For agent systems, a few cookie attributes explain most failures.

**Domain and path scoping**

Cookies are scoped. A cookie set for `twitter.com` may not be sent to a different subdomain unless the domain attribute allows it. Cookies can also be scoped to a path such as `/account/`. If your agent fetches a deep URL and gets a login page, one common cause is that the cookie jar does not include a cookie scoped to that subdomain or path.

Plasmate stores cookies exactly as exported by the browser for the current site. That is important because the browser has already computed effective domain and path rules.

**Secure and HttpOnly**

A `Secure` cookie is only sent over HTTPS. An `HttpOnly` cookie is not readable by JavaScript, but it is still sent with requests. Most session cookies are HttpOnly. This is one reason cookie capture has to happen through the browser cookie APIs rather than by injecting scripts into the page.

**SameSite behavior**

SameSite controls when cookies are sent on cross-site requests. Many login flows rely on redirects across domains. If you try to automate login inside a headless browser, SameSite restrictions can break it. Cookie-based authenticated browsing avoids this entire class of issues because you are not replaying the login flow. You are reusing the post-login cookies that already represent a valid session.

**Session versus persistent cookies**

Some sites issue session cookies that expire when the browser closes. Others issue persistent cookies that last days or weeks. If authenticated fetches stop working after a restart, this is usually why, and the fix is to push fresh cookies again.

Understanding these mechanics helps you debug quickly without falling back to fragile password automation.

## Step by step setup

### Installing the extension

The Plasmate browser extension is available from the [Chrome Web Store](https://github.com/plasmate-labs/plasmate-extension) or can be built from source:

```bash
git clone https://github.com/plasmate-labs/plasmate-extension
cd plasmate-extension
npm install && npm run build
```

Then load the `dist/` directory as an unpacked extension in Chrome via `chrome://extensions` with Developer Mode enabled.

### Starting the bridge server

```bash
plasmate auth serve
```

This starts the bridge on `127.0.0.1:9876`. The terminal shows a log of incoming cookie pushes:

```
[auth] Bridge listening on 127.0.0.1:9876
[auth] Received cookies for twitter.com (profile: default, 14 cookies)
[auth] Received cookies for jira.atlassian.net (profile: work, 8 cookies)
```

Leave this running in a terminal tab or run it in the background:

```bash
plasmate auth serve &
```

### Pushing cookies from your browser

1. Navigate to a site you are logged into (for example, twitter.com)
2. Click the Plasmate extension icon in Chrome's toolbar
3. Select the profile to store these cookies in (default is "default")
4. Click "Push cookies for this site"

The extension sends the cookies for the current domain to the bridge. You will see a confirmation in the extension popup and in the bridge server's terminal output.

Repeat for each site you want the agent to access.

### Fetching authenticated pages

```bash
PLASMATE_PROFILE=default
 plasmate fetch https://twitter.com/home```

The `PLASMATE_PROFILE` environment variable tells Plasmate which cookie profile to inject. The output is a SOM document containing your authenticated Twitter timeline: posts, links, interactive elements (like, retweet, reply buttons), all structured for agent consumption.

Without the environment variable set, Plasmate fetches the page as an anonymous visitor, which for Twitter means a login wall.

## Real-world examples

### Browsing X/Twitter as yourself

Twitter is one of the most common authenticated browsing targets. Agents that monitor feeds, track mentions, or research conversations need access to the logged-in experience.

```bash
# Push your Twitter cookies (do this once from the extension)
# Then fetch your timeline:
PLASMATE_PROFILE=default
 plasmate fetch https://x.com/home
# Fetch a specific user's profile:
PLASMATE_PROFILE=default
 plasmate fetch https://x.com/elonmusk
# Fetch a specific tweet thread:
PLASMATE_PROFILE=default
 plasmate fetch https://x.com/username/status/1234567890```

The SOM output includes tweet text, author names, engagement metrics (when visible), embedded links, and interactive elements. An agent can process this structured output to summarize your timeline, extract trending topics, or find specific conversations.

A detailed walkthrough is available in the [Your Agent on X/Twitter](https://docs.plasmate.app/guide-agent-browses-twitter) guide.

### Monitoring internal tools

Enterprise tools like Jira, Confluence, Notion, and internal wikis typically require authentication. Rather than configuring OAuth applications or API tokens for each service, push your browser cookies:

```bash
# After pushing cookies for your Jira instance:
plasmate fetch https://yourcompany.atlassian.net/browse/PROJ-123 \
  PLASMATE_PROFILE=work
```

The agent receives the ticket details, status, assignee, description, and comments as structured SOM. This is especially useful for agents that triage issues, summarize sprint progress, or draft status updates.

```bash
# Confluence documentation:
plasmate fetch https://yourcompany.atlassian.net/wiki/spaces/ENG/overview \
  PLASMATE_PROFILE=work
```

### Accessing paid content

News sites, research databases, and premium tools often gate content behind subscriptions. If you have a valid subscription and are logged in:

```bash
# Wall Street Journal article (behind paywall):
PLASMATE_PROFILE=news
 plasmate fetch https://www.wsj.com/articles/some-article
# Academic database:
PLASMATE_PROFILE=research
 plasmate fetch https://ieeexplore.ieee.org/document/12345```

The agent sees the full article content, not the paywall teaser. This enables research agents to access the same sources you have paid for.

## Security model in detail

### What is encrypted

Cookie values are encrypted with AES-256-GCM before being written to disk. The encryption key is derived from your system keychain (macOS Keychain, Windows Credential Manager) or a user-provided key via the `PLASMATE_AUTH_KEY` environment variable.

The cookie file on disk is not readable without the encryption key. If someone copies your profile file, they cannot extract cookies from it.

### What is not shared

The extension does not export all cookies from your browser. It only exports cookies for the specific domain you authorize, at the moment you click "Push." It does not run in the background. It does not auto-sync. It does not phone home.

The bridge server does not listen on any network interface. It binds to `127.0.0.1` only. There is no remote access, no cloud sync, and no telemetry.

### Cookie expiration

Cookies have natural expiration dates set by the issuing site. When a session cookie expires, the agent's access expires with it. You need to push fresh cookies from your browser to maintain access.

For sites with short session lifetimes (30 minutes to a few hours), you may need to re-push cookies periodically. For sites with persistent sessions (days to weeks), the initial push is often sufficient for extended use.

### Profile isolation

Each profile is an independent cookie store. Cookies in your "work" profile are not visible when fetching with your "personal" profile, and vice versa. This prevents cross-contamination between contexts.

## When to use each authentication approach

Different agent tasks call for different authentication strategies:

| Approach | Best for | Trade-offs |
|----------|----------|------------|
| Cookie-based auth (Plasmate profiles) | Personal agents, rapid prototyping, sites without APIs | Requires periodic cookie refresh; tied to your session |
| API tokens (OAuth, PATs) | Production systems, multi-user agents | Requires API availability; rate limits apply |
| Service accounts | Enterprise deployments, CI/CD agents | Requires admin provisioning; separate identity |
| No auth (public pages) | Public content, search results | Limited to publicly accessible content |

Cookie-based authentication is ideal for personal agent workflows where you want the agent to see what you see. It requires no API configuration, works with any site that uses cookie-based sessions, and can be set up in minutes.

For production systems that serve multiple users, API-based authentication is more appropriate. Each user authenticates through proper OAuth flows, and the agent acts on their behalf with scoped permissions.

## Troubleshooting

### "Page shows login wall despite profile"

The cookies may have expired. Open the site in your browser, verify you are still logged in, and push fresh cookies.

### "Bridge server refuses connection"

Verify the bridge is running: `plasmate auth serve`. Check that nothing else is using port 9876: `lsof -i :9876`.

### "Extension does not show the Push button"

Make sure you are on an HTTPS page (the extension does not operate on HTTP pages for security). Verify the extension is enabled in `chrome://extensions`.

### "Cookies work for the homepage but not inner pages"

Some sites set different cookies for different subdomains. Push cookies while on the specific page you want the agent to access, not just the homepage.

## Privacy considerations

Authenticated browsing gives your agent access to personal content. Consider these guidelines:

Keep profiles scoped. Do not push cookies for sensitive accounts (banking, healthcare) into profiles that are used for casual browsing tasks.

Review what you share. Before pushing cookies for a domain, consider whether the agent needs access to all the content on that domain.

Rotate profiles. Periodically delete old profiles and re-push only the cookies you currently need.

Understand the scope. Cookie-based access gives the agent the same permissions as your browser session. If your browser can delete emails, your agent can too (if it is instructed to). Use caution with profiles for accounts that have write access to important systems.

## Further reading

The complete technical documentation for authenticated browsing is at [Authenticated Browsing Guide](https://docs.plasmate.app/guide-authenticated-browsing).

A non-technical walkthrough focused on Twitter/X is at [Your Agent on X/Twitter](https://docs.plasmate.app/guide-agent-browses-twitter).

[GitHub](https://github.com/plasmate-labs/plasmate) | [Browser Extension](https://github.com/plasmate-labs/plasmate-extension) | [Documentation](https://docs.plasmate.app)
