# Plasmate Blog

Static blog for [blog.plasmate.app](https://blog.plasmate.app). Posts are authored as structured Markdown files with YAML frontmatter. The build system compiles them into a static site.

## Post format

Every post lives in `posts/` as a Markdown file. The filename becomes the URL slug.

```
posts/html-vs-markdown-vs-som.md  ->  /html-vs-markdown-vs-som
```

### Required frontmatter

```yaml
---
title: "HTML vs Markdown vs SOM: Which Format Should Your AI Agent Use?"
slug: html-vs-markdown-vs-som
date: 2026-03-28
author: David Hurley
author_url: https://timespent.xyz
summary: "We benchmarked three web representations across 100 tasks and two models. Here is what we found."
tags: [benchmark, som, token-efficiency, ai-agents]
category: research
image: /images/html-vs-som-tokens.png
---
```

### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Post title (used in `<title>`, `<h1>`, and OG tags) |
| `slug` | Yes | URL path slug (must match filename without `.md`) |
| `date` | Yes | Publication date (ISO 8601: `YYYY-MM-DD`) |
| `author` | Yes | Author display name |
| `author_url` | No | Link for the author name |
| `summary` | Yes | 1-2 sentence summary (used in list view, meta description, OG) |
| `tags` | Yes | Array of lowercase tags |
| `category` | Yes | One of: `research`, `tutorial`, `announcement`, `deep-dive`, `opinion` |
| `image` | No | OG/social image path (relative to `/public/images/`) |
| `draft` | No | Set to `true` to exclude from build |
| `canonical_url` | No | Canonical URL if cross-posted |
| `series` | No | Series name for multi-part posts |
| `series_order` | No | Position in series (integer) |

### Body format

Standard Markdown. Use `##` for sections (the title is auto-rendered as `<h1>`). Code blocks with language tags. No em dashes or en dashes (use `--`).

## Build

```bash
node build.mjs
```

Output goes to `dist/`. Deploy to Vercel.

## Adding a post

1. Create `posts/your-slug.md` with frontmatter
2. Write the body in Markdown
3. `node build.mjs`
4. Commit and push (Vercel auto-deploys)

## Automation (Looper format)

Bots can create posts by writing a `.md` file to `posts/` following the frontmatter schema above. The build validates frontmatter on every run and rejects posts with missing required fields.

The `BLOG_SCHEMA.json` file defines the exact schema for automated tooling.
