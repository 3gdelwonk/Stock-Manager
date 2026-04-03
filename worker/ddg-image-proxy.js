// Cloudflare Worker: DuckDuckGo Image Search Proxy
// Deploy: npx wrangler deploy worker/ddg-image-proxy.js --name ddg-image-proxy
// Or paste into Cloudflare Dashboard > Workers & Pages > Create > Quick Edit

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DDG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Referer': 'https://duckduckgo.com/',
};

async function getVQD(query) {
  const res = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images&iax=images&ia=images`, {
    headers: DDG_HEADERS,
  });
  const text = await res.text();
  const match = text.match(/vqd=['"]([^'"]+)['"]/);
  if (!match) {
    // Try alternate pattern
    const match2 = text.match(/vqd=([\d-]+)/);
    return match2?.[1] ?? null;
  }
  return match[1];
}

async function searchImages(query, num = 5) {
  const vqd = await getVQD(query);
  if (!vqd) return { error: 'Failed to get VQD token', results: [] };

  const params = new URLSearchParams({
    q: query,
    vqd,
    o: 'json',
    l: 'au-en',
    p: '-1',
    s: '0',
    f: ',,,,,',
  });

  const res = await fetch(`https://duckduckgo.com/i.js?${params}`, { headers: DDG_HEADERS });
  if (!res.ok) return { error: `DDG returned ${res.status}`, results: [] };

  const data = await res.json();
  const results = (data.results || []).slice(0, num).map(r => ({
    title: r.title || '',
    imageUrl: r.image || '',
    thumbnailUrl: r.thumbnail || '',
    width: r.width || 0,
    height: r.height || 0,
    source: r.source || '',
  }));

  return { results };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const num = parseInt(url.searchParams.get('num') || '5', 10);

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing ?q= parameter' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    try {
      const data = await searchImages(query, num);
      return new Response(JSON.stringify(data), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message, results: [] }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};
