import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

async function withBrowser<T>(fn: (page: import('puppeteer-core').Page) => Promise<T>): Promise<T> {
  const exePath = await chromium.executablePath;
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: exePath || undefined,
    headless: true,
    ignoreHTTPSErrors: true
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function addSampleProductToCart(page: import('puppeteer-core').Page, region: 'us' | 'eu') {
  const productUrl = region === 'eu'
    ? 'https://www.crocs.eu/p/classic-clog/10001.html'
    : 'https://www.crocs.com/p/classic-clog/10001.html';

  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // Accept cookies if present
  try {
    await page.waitForSelector('button[aria-label*="Accept" i], button:has-text("Accept")', { timeout: 5000 });
    await page.click('button[aria-label*="Accept" i], button:has-text("Accept")');
  } catch {}

  // Select first available size option if required
  try {
    const sizeButtons = await page.$$('button, a');
    for (const btn of sizeButtons) {
      const label = (await page.evaluate(el => (el as HTMLElement).innerText, btn)).trim();
      if (/^\s*(M|W|EU)?\s?\d{1,2}\s*$/i.test(label)) {
        try { await (btn as any).click(); break; } catch {}
      }
    }
  } catch {}

  // Click add to cart
  try {
    await page.waitForSelector('button[id*="add-to-cart" i], button:has-text("Add to Bag"), button:has-text("Add to Cart"), button:has-text("Add to basket")', { timeout: 15000 });
    await page.click('button[id*="add-to-cart" i], button:has-text("Add to Bag"), button:has-text("Add to Cart"), button:has-text("Add to basket")');
  } catch (e) {
    // Fallback: if product auto-added or selector changed, proceed
  }

  // Go to cart
  try {
    await page.goto(region === 'eu' ? 'https://www.crocs.eu/cart' : 'https://www.crocs.com/cart', { waitUntil: 'domcontentloaded' });
  } catch {}
}

async function applyPromoCode(page: import('puppeteer-core').Page, code: string) {
  // Try a variety of selectors typical for SFCC carts
  const selectors = [
    'input[name*="coupon" i]',
    'input[name*="promo" i]',
    'input[placeholder*="promo" i]',
    'input[placeholder*="code" i]'
  ];

  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click({ clickCount: 3 });
      await el.type(code, { delay: 20 });
      // Try to find an apply button near the input
      const applySelectors = [
        'button:has-text("Apply")',
        'button:has-text("Toepassen")',
        'button[name*="apply" i]'
      ];
      for (const a of applySelectors) {
        const btn = await page.$(a);
        if (btn) { await btn.click(); break; }
      }
      // Wait for response
      await page.waitForTimeout(3500);
      // Check for success or error messages
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (/applied|success|discount|promotion applied/i.test(bodyText)) {
        // Try to detect savings
        const savingsMatch = bodyText.match(/\$\s?([0-9]+(?:\.[0-9]{2})?)/) || bodyText.match(/save\s?([0-9]+%)/i);
        return { valid: true, message: 'Code toegepast', savings: savingsMatch ? savingsMatch[0] : undefined } as const;
      }
      if (/invalid|not valid|expired|kan niet|ongeldig|expired/i.test(bodyText)) {
        return { valid: false, message: 'Ongeldige of verlopen code' } as const;
      }
    }
  }

  return { valid: false, message: 'Kon veld niet vinden of geen feedback' } as const;
}

export async function POST(req: NextRequest) {
  const { code, region } = (await req.json()) as { code: string; region?: 'us' | 'eu' };
  const reg = region || 'us';

  try {
    const result = await withBrowser(async (page) => {
      await addSampleProductToCart(page, reg);
      const apply = await applyPromoCode(page, code);
      return apply;
    });

    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ valid: false, message: e?.message || 'Fout bij testen' }), { status: 500 });
  }
}
