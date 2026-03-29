---
title: "How to Monitor Competitor Pricing with an AI Agent and Plasmate"
slug: monitor-competitor-pricing
date: 2026-03-28
author: David Hurley
author_url: https://timespent.xyz
summary: "Build a Python agent that monitors competitor product pages, extracts pricing data via SOM, detects changes, and sends alerts. Complete working code included."
tags: [tutorial, ecommerce, pricing, ai-agents, python]
category: tutorial
---

Pricing intelligence is one of the most valuable applications of web monitoring. Knowing when a competitor drops their price, runs a promotion, or goes out of stock lets you respond quickly rather than discovering the change days later when a customer mentions it.

The traditional approach involves manual checking (tedious and error prone) or building HTML scrapers (fragile and high maintenance). Neither scales well. When Amazon changes their DOM structure, your XPath selectors break. When Target redesigns their product pages, your regex patterns stop matching. You spend more time fixing scrapers than analyzing pricing data.

In this tutorial, we will build a Python agent that uses the Semantic Object Model (SOM) to monitor competitor product pages. SOM provides stable, typed elements with consistent structure across sites, making price extraction reliable without the brittleness of HTML parsing. The agent stores historical prices in SQLite, detects changes, and sends alerts when prices move.

By the end, you will have a working system that can monitor hundreds of products across multiple retailers.

## Prerequisites

You need Python 3.9 or later, Plasmate installed, and optionally a Slack webhook for notifications:

```bash
pip install requests
npm install -g plasmate
```

Verify Plasmate is working:

```bash
plasmate fetch https://www.amazon.com/dp/B0BSHF7WHW | head -20
```

If you want Slack notifications, create an incoming webhook in your Slack workspace and save the URL.

## Why SOM works better for pricing extraction

HTML scraping for prices is notoriously fragile. Here is what a price element might look like in raw HTML:

```html
<span class="a-price-whole">29</span>
<span class="a-price-fraction">99</span>
```

Or it might be:

```html
<div data-test="product-price">$29.99</div>
```

Or it might be:

```html
<span itemprop="price" content="29.99">$29.99</span>
```

Every retailer structures prices differently, and each retailer changes their markup periodically. Schema.org microdata helps when present, but not every site implements it consistently.

SOM normalizes this variation. When Plasmate processes a product page, it identifies pricing elements and represents them with a consistent structure:

```json
{
  "id": "e_price_main",
  "role": "price",
  "text": "$29.99",
  "attrs": {
    "value": "29.99",
    "currency": "USD"
  }
}
```

The `role: price` tells you this is a price element. The `attrs.value` gives you the numeric value without parsing currency symbols. The `attrs.currency` tells you the currency code. This works the same way whether you are fetching from Amazon, Target, Best Buy, or a small boutique retailer.

Similarly, product titles, availability indicators, and other key elements are typed and structured consistently:

```json
{
  "id": "e_title_main",
  "role": "heading",
  "level": 1,
  "text": "Apple AirPods Pro (2nd Generation)",
  "attrs": {
    "product_title": true
  }
}
```

```json
{
  "id": "e_stock_status",
  "role": "status",
  "text": "In Stock",
  "attrs": {
    "availability": "in_stock"
  }
}
```

This consistency is what makes SOM reliable for pricing automation. You write extraction logic once, and it works across retailers without site-specific selectors.

## The complete monitoring agent

Here is the full Python agent. We will walk through each section, but you can copy this entire script and run it immediately:

```python
#!/usr/bin/env python3
"""
Competitor pricing monitor using Plasmate SOM Cache.
Monitors product pages, stores historical prices, and sends alerts on changes.
"""

import json
import os
import sqlite3
import subprocess
import time
from datetime import datetime
from typing import Optional
import requests


# Configuration
PLASMATE_CACHE_URL = os.getenv("PLASMATE_CACHE_URL", "https://cache.plasmate.ai")
PLASMATE_API_KEY = os.getenv("PLASMATE_API_KEY", "")
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
DB_PATH = os.getenv("PRICE_DB_PATH", "prices.db")
CHECK_INTERVAL_SECONDS = 3600  # 1 hour


def init_database(db_path: str) -> sqlite3.Connection:
    """Initialize SQLite database with required tables."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            name TEXT,
            retailer TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            price REAL,
            currency TEXT DEFAULT 'USD',
            availability TEXT,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_price_history_product 
        ON price_history(product_id, fetched_at DESC)
    """)
    
    conn.commit()
    return conn


def fetch_som_via_cli(url: str) -> Optional[dict]:
    """Fetch SOM representation using Plasmate CLI."""
    try:
        result = subprocess.run(
            ["plasmate", "fetch", url],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            print(f"Plasmate CLI error: {result.stderr}")
            return None
    except subprocess.TimeoutExpired:
        print(f"Timeout fetching {url}")
        return None
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        return None


def fetch_som_via_cache_api(url: str, api_key: str) -> Optional[dict]:
    """Fetch SOM representation using Plasmate Cache API."""
    headers = {"Authorization": f"Bearer {api_key}"}
    params = {"url": url}
    
    try:
        response = requests.get(
            f"{PLASMATE_CACHE_URL}/v1/som",
            headers=headers,
            params=params,
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Cache API error for {url}: {e}")
        return None


def fetch_som(url: str) -> Optional[dict]:
    """Fetch SOM using Cache API if available, otherwise CLI."""
    if PLASMATE_API_KEY:
        return fetch_som_via_cache_api(url, PLASMATE_API_KEY)
    return fetch_som_via_cli(url)


def find_element_by_role(som: dict, role: str) -> Optional[dict]:
    """Find the first element with a given role in the SOM."""
    for region in som.get("regions", []):
        for element in region.get("elements", []):
            if element.get("role") == role:
                return element
            # Check nested elements
            for child in element.get("children", []):
                if child.get("role") == role:
                    return child
    return None


def find_elements_by_role(som: dict, role: str) -> list:
    """Find all elements with a given role in the SOM."""
    results = []
    for region in som.get("regions", []):
        for element in region.get("elements", []):
            if element.get("role") == role:
                results.append(element)
            for child in element.get("children", []):
                if child.get("role") == role:
                    results.append(child)
    return results


def extract_price(som: dict) -> tuple[Optional[float], Optional[str]]:
    """Extract price and currency from SOM."""
    price_element = find_element_by_role(som, "price")
    
    if price_element:
        attrs = price_element.get("attrs", {})
        value = attrs.get("value")
        currency = attrs.get("currency", "USD")
        
        if value is not None:
            try:
                return float(value), currency
            except ValueError:
                pass
        
        # Fallback: parse from text
        text = price_element.get("text", "")
        price_value = parse_price_text(text)
        if price_value:
            return price_value, currency
    
    return None, None


def parse_price_text(text: str) -> Optional[float]:
    """Parse a price value from text like '$29.99' or '29,99 €'."""
    import re
    # Remove currency symbols and whitespace
    cleaned = re.sub(r"[^\d.,]", "", text)
    # Handle European format (comma as decimal)
    if "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    elif "," in cleaned and "." in cleaned:
        # Assume 1,234.56 format
        cleaned = cleaned.replace(",", "")
    
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_product_title(som: dict) -> Optional[str]:
    """Extract product title from SOM."""
    # Look for heading with product_title attribute
    headings = find_elements_by_role(som, "heading")
    for heading in headings:
        if heading.get("attrs", {}).get("product_title"):
            return heading.get("text")
    
    # Fallback: use page title or first h1
    if som.get("title"):
        return som["title"]
    
    for heading in headings:
        if heading.get("level") == 1:
            return heading.get("text")
    
    return None


def extract_availability(som: dict) -> Optional[str]:
    """Extract availability status from SOM."""
    status_element = find_element_by_role(som, "status")
    
    if status_element:
        attrs = status_element.get("attrs", {})
        availability = attrs.get("availability")
        if availability:
            return availability
        
        # Infer from text
        text = status_element.get("text", "").lower()
        if "in stock" in text or "available" in text:
            return "in_stock"
        elif "out of stock" in text or "unavailable" in text:
            return "out_of_stock"
        elif "preorder" in text or "pre-order" in text:
            return "preorder"
    
    return "unknown"


def detect_retailer(url: str) -> str:
    """Detect retailer from URL domain."""
    domain = url.lower()
    if "amazon" in domain:
        return "Amazon"
    elif "target" in domain:
        return "Target"
    elif "bestbuy" in domain:
        return "Best Buy"
    elif "walmart" in domain:
        return "Walmart"
    elif "ebay" in domain:
        return "eBay"
    else:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.netloc.replace("www.", "")


def add_product(conn: sqlite3.Connection, url: str) -> int:
    """Add a product to monitor, returning its ID."""
    cursor = conn.cursor()
    
    # Check if already exists
    cursor.execute("SELECT id FROM products WHERE url = ?", (url,))
    row = cursor.fetchone()
    if row:
        return row[0]
    
    # Fetch initial data
    som = fetch_som(url)
    name = None
    retailer = detect_retailer(url)
    
    if som:
        name = extract_product_title(som)
    
    cursor.execute(
        "INSERT INTO products (url, name, retailer) VALUES (?, ?, ?)",
        (url, name, retailer)
    )
    conn.commit()
    
    product_id = cursor.lastrowid
    
    # Record initial price
    if som:
        record_price(conn, product_id, som)
    
    return product_id


def record_price(conn: sqlite3.Connection, product_id: int, som: dict) -> dict:
    """Record current price for a product, returning price data."""
    price, currency = extract_price(som)
    availability = extract_availability(som)
    
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO price_history (product_id, price, currency, availability)
           VALUES (?, ?, ?, ?)""",
        (product_id, price, currency, availability)
    )
    conn.commit()
    
    return {
        "price": price,
        "currency": currency,
        "availability": availability
    }


def get_previous_price(conn: sqlite3.Connection, product_id: int) -> Optional[dict]:
    """Get the most recent price record before the current one."""
    cursor = conn.cursor()
    cursor.execute(
        """SELECT price, currency, availability, fetched_at
           FROM price_history
           WHERE product_id = ?
           ORDER BY fetched_at DESC
           LIMIT 1 OFFSET 1""",
        (product_id,)
    )
    row = cursor.fetchone()
    if row:
        return {
            "price": row[0],
            "currency": row[1],
            "availability": row[2],
            "fetched_at": row[3]
        }
    return None


def get_current_price(conn: sqlite3.Connection, product_id: int) -> Optional[dict]:
    """Get the most recent price record."""
    cursor = conn.cursor()
    cursor.execute(
        """SELECT price, currency, availability, fetched_at
           FROM price_history
           WHERE product_id = ?
           ORDER BY fetched_at DESC
           LIMIT 1""",
        (product_id,)
    )
    row = cursor.fetchone()
    if row:
        return {
            "price": row[0],
            "currency": row[1],
            "availability": row[2],
            "fetched_at": row[3]
        }
    return None


def check_for_changes(
    conn: sqlite3.Connection, 
    product_id: int, 
    product_name: str, 
    retailer: str
) -> Optional[dict]:
    """Compare current price to previous, returning change info if different."""
    current = get_current_price(conn, product_id)
    previous = get_previous_price(conn, product_id)
    
    if not current or not previous:
        return None
    
    changes = {}
    
    # Check price change
    if current["price"] != previous["price"]:
        if previous["price"] and current["price"]:
            pct_change = ((current["price"] - previous["price"]) / previous["price"]) * 100
            changes["price"] = {
                "old": previous["price"],
                "new": current["price"],
                "change_pct": round(pct_change, 1),
                "direction": "up" if pct_change > 0 else "down"
            }
    
    # Check availability change
    if current["availability"] != previous["availability"]:
        changes["availability"] = {
            "old": previous["availability"],
            "new": current["availability"]
        }
    
    if changes:
        return {
            "product_name": product_name,
            "retailer": retailer,
            "changes": changes
        }
    
    return None


def send_slack_alert(webhook_url: str, change_info: dict) -> bool:
    """Send a price change alert to Slack."""
    if not webhook_url:
        return False
    
    blocks = []
    
    # Header
    product = change_info["product_name"] or "Unknown Product"
    retailer = change_info["retailer"]
    blocks.append({
        "type": "header",
        "text": {
            "type": "plain_text",
            "text": f"Price Alert: {retailer}"
        }
    })
    
    # Product name
    blocks.append({
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": f"*{product}*"
        }
    })
    
    # Changes
    changes = change_info["changes"]
    
    if "price" in changes:
        p = changes["price"]
        emoji = "📉" if p["direction"] == "down" else "📈"
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"{emoji} Price: ${p['old']:.2f} → ${p['new']:.2f} ({p['change_pct']:+.1f}%)"
            }
        })
    
    if "availability" in changes:
        a = changes["availability"]
        emoji = "✅" if a["new"] == "in_stock" else "❌"
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"{emoji} Availability: {a['old']} → {a['new']}"
            }
        })
    
    payload = {"blocks": blocks}
    
    try:
        response = requests.post(webhook_url, json=payload, timeout=10)
        return response.status_code == 200
    except requests.RequestException:
        return False


def print_alert(change_info: dict) -> None:
    """Print a price change alert to the console."""
    product = change_info["product_name"] or "Unknown Product"
    retailer = change_info["retailer"]
    print(f"\n{'='*60}")
    print(f"PRICE ALERT: {retailer}")
    print(f"Product: {product}")
    
    changes = change_info["changes"]
    
    if "price" in changes:
        p = changes["price"]
        direction = "↓" if p["direction"] == "down" else "↑"
        print(f"Price: ${p['old']:.2f} → ${p['new']:.2f} ({p['change_pct']:+.1f}%) {direction}")
    
    if "availability" in changes:
        a = changes["availability"]
        print(f"Availability: {a['old']} → {a['new']}")
    
    print(f"{'='*60}\n")


def check_product(conn: sqlite3.Connection, product_id: int, url: str, name: str, retailer: str) -> None:
    """Check a single product for price changes."""
    print(f"Checking: {name or url}")
    
    som = fetch_som(url)
    if not som:
        print(f"  Failed to fetch SOM")
        return
    
    # Record new price
    price_data = record_price(conn, product_id, som)
    print(f"  Price: ${price_data['price']:.2f}" if price_data['price'] else "  Price: N/A")
    print(f"  Availability: {price_data['availability']}")
    
    # Check for changes
    change_info = check_for_changes(conn, product_id, name, retailer)
    if change_info:
        print_alert(change_info)
        if SLACK_WEBHOOK_URL:
            send_slack_alert(SLACK_WEBHOOK_URL, change_info)


def run_monitoring_loop(conn: sqlite3.Connection, products: list[str]) -> None:
    """Run continuous monitoring loop."""
    # Add all products
    product_ids = []
    for url in products:
        product_id = add_product(conn, url)
        product_ids.append((product_id, url))
    
    print(f"Monitoring {len(product_ids)} products")
    print(f"Check interval: {CHECK_INTERVAL_SECONDS} seconds")
    print()
    
    while True:
        cursor = conn.cursor()
        
        for product_id, url in product_ids:
            cursor.execute(
                "SELECT name, retailer FROM products WHERE id = ?",
                (product_id,)
            )
            row = cursor.fetchone()
            name, retailer = row if row else (None, None)
            
            check_product(conn, product_id, url, name, retailer)
            time.sleep(2)  # Be polite between requests
        
        print(f"\nNext check in {CHECK_INTERVAL_SECONDS} seconds...")
        time.sleep(CHECK_INTERVAL_SECONDS)


def main():
    # Example products to monitor
    products = [
        "https://www.amazon.com/dp/B0BSHF7WHW",  # AirPods Pro
        "https://www.amazon.com/dp/B0D5ZC1B5K",  # Kindle Paperwhite
        "https://www.target.com/p/apple-airpods-pro-2nd-generation/-/A-85978612",
        "https://www.bestbuy.com/site/apple-airpods-pro-2/6447382.p",
    ]
    
    conn = init_database(DB_PATH)
    
    try:
        run_monitoring_loop(conn, products)
    except KeyboardInterrupt:
        print("\nStopping monitor...")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
```

## Walking through the code

Let us break down the key components.

### Database schema

The agent uses two tables: `products` stores the URLs you want to monitor along with metadata, and `price_history` stores every price observation with a timestamp. This historical data is valuable for trend analysis, not just change detection.

```python
def init_database(db_path: str) -> sqlite3.Connection:
    """Initialize SQLite database with required tables."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            name TEXT,
            retailer TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            price REAL,
            currency TEXT DEFAULT 'USD',
            availability TEXT,
            fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    """)
    
    conn.commit()
    return conn
```

### Fetching SOM

The agent supports two modes: direct CLI invocation for local development, and the Cache API for production use. The Cache API is faster because it returns cached representations when available, avoiding redundant browser rendering.

```python
def fetch_som_via_cache_api(url: str, api_key: str) -> Optional[dict]:
    """Fetch SOM representation using Plasmate Cache API."""
    headers = {"Authorization": f"Bearer {api_key}"}
    params = {"url": url}
    
    try:
        response = requests.get(
            f"{PLASMATE_CACHE_URL}/v1/som",
            headers=headers,
            params=params,
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Cache API error for {url}: {e}")
        return None
```

### Extracting pricing data

The extraction functions use SOM element roles to find the right content. The `role: price` element contains the price value, the `role: heading` with `product_title: true` contains the product name, and the `role: status` contains availability information.

```python
def extract_price(som: dict) -> tuple[Optional[float], Optional[str]]:
    """Extract price and currency from SOM."""
    price_element = find_element_by_role(som, "price")
    
    if price_element:
        attrs = price_element.get("attrs", {})
        value = attrs.get("value")
        currency = attrs.get("currency", "USD")
        
        if value is not None:
            try:
                return float(value), currency
            except ValueError:
                pass
    
    return None, None
```

This is dramatically simpler than equivalent HTML extraction code, which would need CSS selectors, XPath expressions, or regex patterns specific to each retailer.

### Change detection

The agent compares the most recent price record to the previous one. When either price or availability differs, it generates a change report:

```python
def check_for_changes(
    conn: sqlite3.Connection, 
    product_id: int, 
    product_name: str, 
    retailer: str
) -> Optional[dict]:
    """Compare current price to previous, returning change info if different."""
    current = get_current_price(conn, product_id)
    previous = get_previous_price(conn, product_id)
    
    if not current or not previous:
        return None
    
    changes = {}
    
    if current["price"] != previous["price"]:
        if previous["price"] and current["price"]:
            pct_change = ((current["price"] - previous["price"]) / previous["price"]) * 100
            changes["price"] = {
                "old": previous["price"],
                "new": current["price"],
                "change_pct": round(pct_change, 1),
                "direction": "up" if pct_change > 0 else "down"
            }
    
    if changes:
        return {
            "product_name": product_name,
            "retailer": retailer,
            "changes": changes
        }
    
    return None
```

## Running the agent

Save the script as `price_monitor.py` and run it:

```bash
python3 price_monitor.py
```

The agent will fetch each product, record the initial price, and then check every hour for changes. Output looks like this:

```
Monitoring 4 products
Check interval: 3600 seconds

Checking: Apple AirPods Pro (2nd Generation)
  Price: $189.99
  Availability: in_stock
Checking: Kindle Paperwhite
  Price: $149.99
  Availability: in_stock
Checking: Apple AirPods Pro 2nd Generation
  Price: $199.99
  Availability: in_stock
Checking: Apple AirPods Pro 2
  Price: $179.99
  Availability: in_stock

Next check in 3600 seconds...
```

When a price changes, you see an alert:

```
============================================================
PRICE ALERT: Amazon
Product: Apple AirPods Pro (2nd Generation)
Price: $189.99 → $169.99 (-10.5%) ↓
============================================================
```

## Running on a schedule

For production use, you probably want to run the agent as a cron job rather than a continuous loop. Here is a single check version:

```python
def check_all_once(conn: sqlite3.Connection) -> None:
    """Check all products once, then exit."""
    cursor = conn.cursor()
    cursor.execute("SELECT id, url, name, retailer FROM products")
    
    for row in cursor.fetchall():
        product_id, url, name, retailer = row
        check_product(conn, product_id, url, name, retailer)
        time.sleep(2)
```

Add products once:

```python
conn = init_database("prices.db")
add_product(conn, "https://www.amazon.com/dp/B0BSHF7WHW")
add_product(conn, "https://www.target.com/p/...")
conn.close()
```

Then schedule checks via cron:

```bash
# Check prices every hour
0 * * * * cd /path/to/monitor && python3 price_monitor.py --check-once
```

## Scaling to hundreds of products

The basic agent works for a handful of products, but what if you need to monitor hundreds or thousands?

### Batch processing

Instead of checking products sequentially, use concurrent requests:

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def check_products_batch(conn: sqlite3.Connection, products: list, max_workers: int = 10) -> None:
    """Check multiple products concurrently."""
    
    def check_one(product_info):
        product_id, url, name, retailer = product_info
        som = fetch_som(url)
        if som:
            record_price(conn, product_id, som)
            return check_for_changes(conn, product_id, name, retailer)
        return None
    
    cursor = conn.cursor()
    cursor.execute("SELECT id, url, name, retailer FROM products")
    product_list = cursor.fetchall()
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(check_one, p): p for p in product_list}
        
        for future in as_completed(futures):
            change_info = future.result()
            if change_info:
                print_alert(change_info)
                if SLACK_WEBHOOK_URL:
                    send_slack_alert(SLACK_WEBHOOK_URL, change_info)
```

With 10 concurrent workers, you can check 100 products in about 30 seconds rather than 3 minutes.

### Using the Cache API

For high volume monitoring, the Plasmate Cache API is essential. The cache stores recent SOM representations, so if another user fetched the same page recently, you get the cached version instantly. This reduces both latency and cost.

The Cache API also handles browser infrastructure for you. You do not need to run headless Chrome instances or manage browser pools.

### Database optimization

For thousands of products, add appropriate indexes:

```python
cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_products_retailer 
    ON products(retailer)
""")

cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_price_history_fetched 
    ON price_history(fetched_at)
""")
```

Consider partitioning checks by retailer or priority level:

```python
# Check high priority products every hour
# Check low priority products every 4 hours

def get_products_to_check(conn: sqlite3.Connection, priority: str) -> list:
    cursor = conn.cursor()
    
    if priority == "high":
        cursor.execute(
            """SELECT id, url, name, retailer FROM products 
               WHERE retailer IN ('Amazon', 'Target', 'Best Buy')"""
        )
    else:
        cursor.execute(
            """SELECT id, url, name, retailer FROM products 
               WHERE retailer NOT IN ('Amazon', 'Target', 'Best Buy')"""
        )
    
    return cursor.fetchall()
```

## Cost analysis

How much does it cost to monitor products at scale using the Plasmate Cache API?

The Cache API is priced at $0.001 per SOM fetch (with a free tier of 1,000 fetches per month). Here is what that means for different monitoring volumes:

| Products | Check Frequency | Monthly Fetches | Monthly Cost |
|----------|-----------------|-----------------|--------------|
| 10       | Hourly          | 7,200           | $6.20        |
| 50       | Hourly          | 36,000          | $35.00       |
| 100      | Every 4 hours   | 18,000          | $17.00       |
| 500      | Every 4 hours   | 90,000          | $89.00       |
| 1,000    | Daily           | 30,000          | $29.00       |

Compare this to running your own browser infrastructure. A single Chrome instance for rendering requires approximately 500MB of RAM. Rendering 100 pages per hour requires multiple instances to keep up. Cloud compute for this setup easily exceeds $50 per month, plus you bear the maintenance burden.

The Cache API also benefits from shared caching. If multiple users monitor the same popular products, cached representations reduce costs for everyone.

## Building a dashboard

The SQLite database makes it easy to build visualizations. Here is a simple query to see price trends over time:

```sql
SELECT 
    p.name,
    p.retailer,
    ph.price,
    ph.fetched_at
FROM price_history ph
JOIN products p ON p.id = ph.product_id
WHERE p.id = ?
ORDER BY ph.fetched_at ASC
```

For a web dashboard, you can export to CSV and use any charting library:

```python
import csv

def export_price_history(conn: sqlite3.Connection, product_id: int, output_path: str) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """SELECT price, currency, availability, fetched_at
           FROM price_history
           WHERE product_id = ?
           ORDER BY fetched_at ASC""",
        (product_id,)
    )
    
    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["price", "currency", "availability", "fetched_at"])
        writer.writerows(cursor.fetchall())
```

## Next steps

This tutorial covered the fundamentals: fetching pages via SOM, extracting pricing data, storing history, and detecting changes. From here, you might want to add:

**Price thresholds:** Alert only when prices drop below a target or change by more than a certain percentage.

**Competitor comparison:** Track the same product across multiple retailers and alert when price gaps emerge.

**Trend analysis:** Use historical data to identify patterns like weekend sales or monthly promotions.

**API integration:** Push price data to your internal systems for automated repricing decisions.

**Multiple alert channels:** Add email, SMS, or PagerDuty notifications alongside Slack.

The core pattern remains the same: fetch via SOM, extract typed elements, compare to previous state, and take action on changes. The reliability of SOM extraction means you can focus on business logic rather than fighting with scrapers.

The complete code from this tutorial is available in the [Plasmate examples repository](https://github.com/nicholasoxford/plasmate-examples).
