const ALLOWED_ORIGINS = [
	'https://hubi.work',
	'http://localhost:8000',
	'http://127.0.0.1:8000',
];

function corsHeaders(request) {
	const origin = request.headers.get('Origin') || '';
	if (!ALLOWED_ORIGINS.includes(origin)) return { 'Vary': 'Origin' };
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
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

		if (request.method === 'PUT') {
			const body = await request.text();
			if (body.length > 512 * 1024) return new Response('Too large', { status: 413, headers });
			if (!body.startsWith('HUBI2:')) return new Response('Invalid format', { status: 400, headers });

			await env.SYNC_KV.put(key, body, { expirationTtl: 30 * 86400 });
			return new Response(null, { status: 204, headers });
		}

		if (request.method === 'GET') {
			const val = await env.SYNC_KV.get(key);
			if (!val) return new Response('', { status: 404, headers });
			return new Response(val, { headers: { ...headers, 'Content-Type': 'text/plain' } });
		}

		return new Response('Method not allowed', { status: 405, headers });
	}
};
