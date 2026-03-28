const ALLOWED_ORIGINS = [
	'https://hubi.work',
	'https://qudiqudi.github.io',
	'http://localhost:8000',
	'http://127.0.0.1:8000',
];

function corsHeaders(request) {
	const origin = request.headers.get('Origin') || '';
	if (!ALLOWED_ORIGINS.includes(origin)) return { 'Vary': 'Origin' };
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, If-Match',
		'Access-Control-Expose-Headers': 'ETag',
		'Vary': 'Origin',
	};
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const headers = corsHeaders(request);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers });
		}

		const match = url.pathname.match(/^\/sync\/([a-f0-9]{64})$/);
		if (!match) return new Response('Not found', { status: 404, headers });
		const key = match[1];

		// Rate limiting: 30 writes per minute per channel
		if (request.method === 'PUT') {
			const rlKey = `rl:${key}`;
			const now = Math.floor(Date.now() / 1000);
			const window = 60;
			const limit = 30;

			const rlRaw = await env.SYNC_KV.get(rlKey);
			let rl = rlRaw ? JSON.parse(rlRaw) : { count: 0, start: now };
			if (now - rl.start > window) {
				rl = { count: 0, start: now };
			}
			rl.count++;
			if (rl.count > limit) {
				return new Response('Rate limited', { status: 429, headers: { ...headers, 'Retry-After': String(window - (now - rl.start)) } });
			}
			await env.SYNC_KV.put(rlKey, JSON.stringify(rl), { expirationTtl: window * 2 });

			const body = await request.text();
			if (body.length > 512 * 1024) return new Response('Too large', { status: 413, headers });
			if (!body.startsWith('HUBI2:')) return new Response('Invalid format', { status: 400, headers });

			// ETag-based compare-and-swap
			const ifMatch = request.headers.get('If-Match');
			if (ifMatch) {
				const existing = await env.SYNC_KV.get(key);
				if (existing !== null) {
					const currentEtag = await computeEtag(existing);
					if (ifMatch !== currentEtag) {
						return new Response('Conflict', { status: 409, headers: { ...headers, 'ETag': currentEtag } });
					}
				}
			}

			await env.SYNC_KV.put(key, body, { expirationTtl: 30 * 86400 });
			const etag = await computeEtag(body);
			return new Response(null, { status: 204, headers: { ...headers, 'ETag': etag } });
		}

		if (request.method === 'GET') {
			const val = await env.SYNC_KV.get(key);
			if (!val) return new Response('', { status: 404, headers });
			const etag = await computeEtag(val);
			return new Response(val, { headers: { ...headers, 'Content-Type': 'text/plain', 'ETag': etag } });
		}

		return new Response('Method not allowed', { status: 405, headers });
	}
};

async function computeEtag(body) {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
	const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
	return `"${hex.slice(0, 16)}"`;
}
