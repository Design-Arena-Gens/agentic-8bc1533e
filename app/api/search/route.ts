import type { NextRequest } from 'next/server';
import * as cheerio from 'cheerio';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SOURCES: { name: string; url: (region: 'us' | 'eu') => string }[] = [
  { name: 'RetailMeNot', url: () => 'https://www.retailmenot.com/view/crocs.com' },
  { name: 'Groupon', url: () => 'https://www.groupon.com/coupons/stores/crocs.com' },
  { name: 'CouponBirds', url: () => 'https://www.couponbirds.com/codes/crocs.com' },
  { name: 'DontPayFull', url: () => 'https://www.dontpayfull.com/at/crocs.com' },
  { name: 'CupomGuru', url: () => 'https://r.jina.ai/http://www.crocs.com/coupons' }
];

function readerUrl(rawUrl: string) {
  // Use Jina Reader proxy to fetch raw text to avoid heavy anti-bot and CORS
  const normalized = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
  return `https://r.jina.ai/${normalized}`;
}

function extractCodesFromText(text: string): string[] {
  const candidates = new Set<string>();
  const patterns: RegExp[] = [
    /\b[A-Z0-9]{5,12}\b/g,
    /\b[Cc][Rr][Oo][Cc][Ss][A-Z0-9]{2,8}\b/g,
    /\bWELCOME[A-Z0-9]{0,6}\b/g,
    /\bSAVE[0-9]{1,3}\b/g
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const code = m[0].toUpperCase();
      // Heuristics to reduce false positives
      if (/^(HTTPS|HTTP|WWW|CROCSCOM|COUPON|VOUCHER|EXPIRES)$/.test(code)) continue;
      if (/^[0-9]{6,}$/.test(code)) continue;
      if (code.length < 5 || code.length > 16) continue;
      candidates.add(code);
    }
  }
  return Array.from(candidates);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = (searchParams.get('region') as 'us' | 'eu') || 'us';

  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const res = await fetch(readerUrl(s.url(region)), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const text = await res.text();
      // Try to extract from plain text first
      let codes = extractCodesFromText(text);
      // If empty, try basic HTML parsing (Jina returns text, but just in case)
      if (codes.length === 0) {
        const $ = cheerio.load(text);
        const pageText = $('body').text();
        codes = extractCodesFromText(pageText);
      }
      return { source: s.name, codes };
    })
  );

  const codes: { code: string; source: string }[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const c of r.value.codes) {
        codes.push({ code: c, source: r.value.source });
      }
    }
  }

  return new Response(JSON.stringify({ codes }), { headers: { 'content-type': 'application/json' } });
}
