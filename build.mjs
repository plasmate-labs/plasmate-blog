#!/usr/bin/env node
/**
 * Plasmate Blog -- static site generator.
 *
 * Reads posts from posts/*.md (with YAML frontmatter), validates them,
 * and generates a static site in dist/.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';

// ---------------------------------------------------------------------------
// Minimal YAML frontmatter parser (no deps)
// ---------------------------------------------------------------------------
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (!m) continue;
    let val = m[2].trim();
    // Arrays
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }
    // Booleans
    else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    // Quoted strings
    else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[m[1]] = val;
  }
  return { meta, body: match[2] };
}

// ---------------------------------------------------------------------------
// Minimal Markdown -> HTML (covers 90% of blog use cases)
// ---------------------------------------------------------------------------
function md(text) {
  let html = text;
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const cls = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${cls}>${esc(code.trimEnd())}</code></pre>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');
  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_, hdr, sep, body) => {
    const ths = hdr.split('|').filter(Boolean).map(c => `<th>${c.trim()}</th>`).join('');
    const rows = body.trim().split('\n').map(row => {
      const tds = row.split('|').filter(Boolean).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('\n');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });
  // Unordered lists
  html = html.replace(/^((?:- .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('\n');
    return `<ul>${items}</ul>`;
  });
  // Ordered lists
  html = html.replace(/^((?:\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('\n');
    return `<ol>${items}</ol>`;
  });
  // Paragraphs (double newline)
  html = html.replace(/\n\n+/g, '\n\n');
  html = html.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<')) return block;
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
}
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const REQUIRED = ['title', 'slug', 'date', 'author', 'summary', 'tags', 'category'];
const CATEGORIES = ['research', 'tutorial', 'announcement', 'deep-dive', 'opinion'];
function validate(meta, file) {
  const missing = REQUIRED.filter(k => !meta[k]);
  if (missing.length) throw new Error(`${file}: missing frontmatter: ${missing.join(', ')}`);
  if (!CATEGORIES.includes(meta.category)) throw new Error(`${file}: invalid category "${meta.category}"`);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
function layout(title, description, content, extra = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} -- Plasmate Blog</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Plasmate Blog">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="alternate" type="application/rss+xml" title="Plasmate Blog" href="/feed.xml">
  ${extra}
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --void: #111110; --deep: #1A1918; --smoke: #2A2825;
      --white: #F0EDE8; --muted: #8A8580; --ember: #E8853A;
      --arc: #3D8FD4; --green: #6dba6d;
      --font-display: 'Space Grotesk', sans-serif;
      --font-body: 'IBM Plex Sans', sans-serif;
      --font-mono: 'IBM Plex Mono', monospace;
    }
    html { scroll-behavior: smooth; }
    body { background: var(--void); color: var(--white); font-family: var(--font-body); line-height: 1.7; -webkit-font-smoothing: antialiased; }
    a { color: var(--ember); text-decoration: none; }
    a:hover { text-decoration: underline; }

    nav { position: sticky; top: 0; z-index: 100; background: rgba(17,17,16,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--smoke); padding: 0 2rem; height: 52px; display: flex; align-items: center; justify-content: space-between; }
    nav .logo { display: flex; align-items: center; gap: 0.6rem; text-decoration: none; color: var(--white); }
    nav .logo img { height: 22px; width: auto; }
    nav .logo .wordmark { font-family: var(--font-display); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; font-size: 14px; }
    nav .logo .blog-label { font-family: var(--font-mono); font-size: 11px; color: var(--muted); letter-spacing: 0.02em; margin-left: 0.2rem; }
    nav .links { display: flex; gap: 1.2rem; }
    nav .links a { color: var(--muted); font-size: 0.82rem; }
    nav .links a:hover { color: var(--white); text-decoration: none; }

    .container { max-width: 720px; margin: 0 auto; padding: 0 1.5rem; }
    footer { border-top: 1px solid var(--smoke); padding: 2rem 0; text-align: center; color: var(--muted); font-size: 0.8rem; margin-top: 4rem; }

    /* Post list */
    .post-list { list-style: none; padding: 3rem 0; }
    .post-item { padding: 1.5rem 0; border-bottom: 1px solid var(--smoke); }
    .post-item:last-child { border-bottom: none; }
    .post-meta { font-size: 0.78rem; color: var(--muted); margin-bottom: 0.4rem; }
    .post-title { font-family: var(--font-display); font-size: 1.3rem; font-weight: 600; line-height: 1.3; }
    .post-title a { color: var(--white); }
    .post-title a:hover { color: var(--ember); text-decoration: none; }
    .post-summary { font-size: 0.9rem; color: var(--muted); margin-top: 0.4rem; }
    .tag { display: inline-block; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 3px; background: var(--smoke); color: var(--muted); margin-right: 0.3rem; }

    /* Article */
    article { padding: 3rem 0; }
    article h1 { font-family: var(--font-display); font-size: clamp(1.8rem, 4vw, 2.4rem); font-weight: 700; line-height: 1.15; margin-bottom: 0.5rem; }
    article .article-meta { font-size: 0.82rem; color: var(--muted); margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--smoke); }
    article h2 { font-family: var(--font-display); font-size: 1.35rem; font-weight: 600; margin-top: 2.5rem; margin-bottom: 0.75rem; }
    article h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.5rem; }
    article p { margin-bottom: 1.2rem; }
    article ul, article ol { margin-bottom: 1.2rem; padding-left: 1.5rem; }
    article li { margin-bottom: 0.3rem; }
    article code { font-family: var(--font-mono); background: var(--deep); padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.88em; }
    article pre { background: var(--deep); border: 1px solid var(--smoke); border-radius: 8px; padding: 1rem 1.2rem; overflow-x: auto; margin-bottom: 1.5rem; }
    article pre code { background: none; padding: 0; font-size: 0.82rem; line-height: 1.6; }
    article table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.88rem; }
    article th { text-align: left; padding: 0.5rem 0.8rem; border-bottom: 2px solid var(--smoke); color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
    article td { padding: 0.5rem 0.8rem; border-bottom: 1px solid var(--smoke); }
    article img { max-width: 100%; border-radius: 8px; margin: 1rem 0; }
    article strong { color: var(--white); }
    article hr { border: none; border-top: 1px solid var(--smoke); margin: 2rem 0; }
    article blockquote { border-left: 3px solid var(--ember); padding-left: 1rem; color: var(--muted); margin-bottom: 1.2rem; }

    @media (max-width: 600px) { .container { padding: 0 1rem; } nav { padding: 0 1rem; } }
  </style>
</head>
<body>
  <nav>
    <a href="/" class="logo"><img src="/images/plasmate-mark.png" alt="Plasmate"><span class="wordmark">Plasmate</span><span class="blog-label">Blog</span></a>
    <div class="links">
      <a href="/">Posts</a>
      <a href="/tags">Tags</a>
      <a href="https://docs.plasmate.app">Docs</a>
      <a href="https://plasmate.app">Plasmate</a>
      <a href="https://github.com/plasmate-labs/plasmate">GitHub</a>
    </div>
  </nav>
  ${content}
  <footer>
    <div class="container">
      <p>Part of the <a href="https://plasmatelabs.com">Plasmate Labs</a> ecosystem &middot; <a href="/feed.xml">RSS</a></p>
    </div>
  </footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const postsDir = join(import.meta.dirname, 'posts');
const distDir = join(import.meta.dirname, 'dist');
const publicDir = join(import.meta.dirname, 'public');

mkdirSync(distDir, { recursive: true });

// Copy public assets
if (existsSync(publicDir)) {
  for (const f of readdirSync(publicDir, { recursive: true })) {
    const src = join(publicDir, f);
    const dest = join(distDir, f);
    mkdirSync(join(dest, '..'), { recursive: true });
    try { copyFileSync(src, dest); } catch {}
  }
}

// Load and parse posts
const posts = [];
for (const file of readdirSync(postsDir)) {
  if (extname(file) !== '.md') continue;
  const raw = readFileSync(join(postsDir, file), 'utf-8');
  const { meta, body } = parseFrontmatter(raw);
  validate(meta, file);
  if (meta.draft === true) { console.log(`  skip (draft): ${file}`); continue; }
  meta._file = file;
  meta._slug = meta.slug || basename(file, '.md');
  posts.push({ meta, body });
}

// Sort newest first
posts.sort((a, b) => b.meta.date.localeCompare(a.meta.date));
console.log(`Building ${posts.length} posts...`);

// Build individual post pages
for (const { meta, body } of posts) {
  const html = md(body);
  const authorLink = meta.author_url ? `<a href="${meta.author_url}">${meta.author}</a>` : meta.author;
  const tags = Array.isArray(meta.tags) ? meta.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';
  const canonical = meta.canonical_url ? `<link rel="canonical" href="${meta.canonical_url}">` : '';

  const content = `<div class="container"><article>
    <h1>${meta.title}</h1>
    <div class="article-meta">${meta.date} &middot; ${authorLink} &middot; ${meta.category} ${tags}</div>
    ${html}
  </article></div>`;

  const page = layout(meta.title, meta.summary, content, canonical);
  const dir = join(distDir, meta._slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page);
  console.log(`  -> /${meta._slug}/`);
}

// Build index
const listItems = posts.map(({ meta }) => {
  const tags = Array.isArray(meta.tags) ? meta.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';
  return `<li class="post-item">
    <div class="post-meta">${meta.date} &middot; ${meta.category} ${tags}</div>
    <div class="post-title"><a href="/${meta._slug}/">${meta.title}</a></div>
    <div class="post-summary">${meta.summary}</div>
  </li>`;
}).join('\n');
const indexContent = `<div class="container"><ul class="post-list">${listItems}</ul></div>`;
writeFileSync(join(distDir, 'index.html'), layout('Plasmate Blog', 'Technical blog about SOM, AI agents, and the agentic web.', indexContent));

// Build tags page
const tagMap = {};
for (const { meta } of posts) {
  if (!Array.isArray(meta.tags)) continue;
  for (const t of meta.tags) {
    if (!tagMap[t]) tagMap[t] = [];
    tagMap[t].push(meta);
  }
}
const tagsSorted = Object.entries(tagMap).sort((a, b) => b[1].length - a[1].length);
const tagsHtml = tagsSorted.map(([tag, psts]) => {
  const links = psts.map(m => `<li><a href="/${m._slug}/">${m.title}</a> <span class="post-meta">${m.date}</span></li>`).join('');
  return `<h2>${tag} (${psts.length})</h2><ul>${links}</ul>`;
}).join('');
const tagsDir = join(distDir, 'tags');
mkdirSync(tagsDir, { recursive: true });
writeFileSync(join(tagsDir, 'index.html'), layout('Tags', 'Browse posts by tag.', `<div class="container" style="padding:3rem 1.5rem">${tagsHtml}</div>`));

// Build RSS feed
const rssItems = posts.slice(0, 20).map(({ meta, body }) => `<item>
  <title>${esc(meta.title)}</title>
  <link>https://blog.plasmate.app/${meta._slug}/</link>
  <description>${esc(meta.summary)}</description>
  <pubDate>${new Date(meta.date).toUTCString()}</pubDate>
  <guid>https://blog.plasmate.app/${meta._slug}/</guid>
</item>`).join('\n');
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Plasmate Blog</title>
  <link>https://blog.plasmate.app</link>
  <description>Technical blog about SOM, AI agents, and the agentic web.</description>
  ${rssItems}
</channel></rss>`;
writeFileSync(join(distDir, 'feed.xml'), rss);

console.log('Done. Output in dist/');
