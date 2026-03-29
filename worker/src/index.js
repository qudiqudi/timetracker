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

// --- Beacon (page analytics) ---

async function hashIP(ip, date) {
	const data = new TextEncoder().encode(ip + ':' + date);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(hash)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function trackBeacon(env, request) {
	const date = new Date().toISOString().slice(0, 10);
	const key = `_b:${date}`;
	const b = await env.SYNC_KV.get(key, 'json') || { views: 0, visitors: [], pages: {} };

	b.views++;

	// Count unique visitors by hashed IP (rotates daily, not reversible)
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	const ipHash = await hashIP(ip, date);
	if (!b.visitors.includes(ipHash)) b.visitors.push(ipHash);

	// Count page views by tab
	try {
		const body = await request.json();
		if (body.page && typeof body.page === 'string') {
			const page = body.page.slice(0, 20);
			b.pages[page] = (b.pages[page] || 0) + 1;
		}
	} catch {}

	await env.SYNC_KV.put(key, JSON.stringify(b), { expirationTtl: METRICS_TTL });
}

// --- Metrics ---

const METRICS_TTL = 90 * 86400; // 90 days

async function trackMetric(env, method, status, bytes, channelKey) {
	const date = new Date().toISOString().slice(0, 10);
	const key = `_m:${date}`;
	const m = await env.SYNC_KV.get(key, 'json') || { get: 0, put: 0, hit: 0, miss: 0, err: 0, bytes: 0, ch: [] };

	if (method === 'GET') {
		m.get++;
		if (status === 200) m.hit++;
		else if (status === 404) m.miss++;
	} else if (method === 'PUT') {
		m.put++;
		m.bytes += bytes || 0;
	}
	if (status >= 400 && status !== 404) m.err++;

	if (channelKey) {
		const prefix = channelKey.slice(0, 8);
		if (!m.ch.includes(prefix)) m.ch.push(prefix);
	}

	await env.SYNC_KV.put(key, JSON.stringify(m), { expirationTtl: METRICS_TTL });
}

// --- Cloudflare Analytics ---

async function fetchCfAnalytics(env, fromDate, toDate) {
	if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return null;

	const query = `{
		viewer {
			zones(filter: { zoneTag: "${env.CF_ZONE_ID}" }) {
				httpRequests1dGroups(
					filter: { date_geq: "${fromDate}" date_leq: "${toDate}" }
					limit: 366
					orderBy: [date_ASC]
				) {
					dimensions { date }
					sum { requests bytes threats responseStatusMap { edgeResponseStatus requests } }
				}
			}
		}
	}`;

	const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.CF_API_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ query }),
	});

	const json = await resp.json();
	const rows = json.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
	if (!rows) return null;

	const daily = {};
	for (const row of rows) {
		let status_2xx = 0, status_4xx = 0, status_5xx = 0;
		for (const s of row.sum.responseStatusMap) {
			if (s.edgeResponseStatus >= 200 && s.edgeResponseStatus < 300) status_2xx += s.requests;
			else if (s.edgeResponseStatus >= 400 && s.edgeResponseStatus < 500) status_4xx += s.requests;
			else if (s.edgeResponseStatus >= 500) status_5xx += s.requests;
		}
		daily[row.dimensions.date] = {
			requests: row.sum.requests,
			bytes: row.sum.bytes,
			threats: row.sum.threats,
			status_2xx,
			status_4xx,
			status_5xx,
		};
	}

	return daily;
}

// --- Grafana Simple JSON datasource ---

const BEACON_METRICS = [
	'page_views',
	'unique_visitors',
	'page_timer',
	'page_history',
	'page_stats',
	'page_sync',
];

const KV_METRICS = [
	'requests_get',
	'requests_put',
	'kv_hits',
	'kv_misses',
	'kv_hit_rate',
	'unique_channels',
	'errors',
	'bytes_written',
];

const CF_METRICS = [
	'cf_requests',
	'cf_bytes',
	'cf_threats',
	'cf_status_2xx',
	'cf_status_4xx',
	'cf_status_5xx',
];

const ALL_METRICS = [...BEACON_METRICS, ...KV_METRICS, ...CF_METRICS];

const BEACON_EXTRACTORS = {
	page_views: d => d.views,
	unique_visitors: d => (d.visitors || []).length,
	page_timer: d => (d.pages || {}).timer || 0,
	page_history: d => (d.pages || {}).history || 0,
	page_stats: d => (d.pages || {}).stats || 0,
	page_sync: d => (d.pages || {}).sync || 0,
};

const KV_EXTRACTORS = {
	requests_get: d => d.get,
	requests_put: d => d.put,
	kv_hits: d => d.hit,
	kv_misses: d => d.miss,
	kv_hit_rate: d => d.get > 0 ? Math.round((d.hit / d.get) * 100) : null,
	unique_channels: d => (d.ch || []).length,
	errors: d => d.err,
	bytes_written: d => d.bytes,
};

const CF_EXTRACTORS = {
	cf_requests: d => d.requests,
	cf_bytes: d => d.bytes,
	cf_threats: d => d.threats,
	cf_status_2xx: d => d.status_2xx,
	cf_status_4xx: d => d.status_4xx,
	cf_status_5xx: d => d.status_5xx,
};

function daysBetween(from, to) {
	const days = [];
	const d = new Date(from.toISOString().slice(0, 10));
	const end = new Date(to.toISOString().slice(0, 10));
	while (d <= end) {
		days.push(d.toISOString().slice(0, 10));
		d.setDate(d.getDate() + 1);
	}
	return days;
}

async function handleGrafana(request, env, url) {
	const apiKey = request.headers.get('X-API-Key') || url.searchParams.get('apiKey');
	if (apiKey !== env.METRICS_KEY) {
		return new Response('Unauthorized', { status: 401 });
	}

	// Connection test
	if (url.pathname === '/grafana' || url.pathname === '/grafana/') {
		return new Response('OK');
	}

	if (request.method === 'POST' && url.pathname === '/grafana/search') {
		return Response.json(ALL_METRICS);
	}

	if (request.method === 'POST' && url.pathname === '/grafana/query') {
		const body = await request.json();
		const from = new Date(body.range.from);
		const to = new Date(body.range.to);
		const dates = daysBetween(from, to);
		const fromDate = dates[0];
		const toDate = dates[dates.length - 1];

		const wantsCf = body.targets.some(t => t.target.startsWith('cf_'));
		const wantsKv = body.targets.some(t => KV_METRICS.includes(t.target));
		const wantsBeacon = body.targets.some(t => t.target.startsWith('page_') || t.target === 'unique_visitors');

		// Fetch all data sources in parallel
		const [kvEntries, beaconEntries, cfData] = await Promise.all([
			wantsKv ? Promise.all(
				dates.map(async date => {
					const data = await env.SYNC_KV.get(`_m:${date}`, 'json');
					return { date, ts: new Date(date + 'T12:00:00Z').getTime(), data: data || { get: 0, put: 0, hit: 0, miss: 0, err: 0, bytes: 0, ch: [] } };
				})
			) : Promise.resolve(null),
			wantsBeacon ? Promise.all(
				dates.map(async date => {
					const data = await env.SYNC_KV.get(`_b:${date}`, 'json');
					return { date, ts: new Date(date + 'T12:00:00Z').getTime(), data: data || { views: 0, visitors: [], pages: {} } };
				})
			) : Promise.resolve(null),
			wantsCf ? fetchCfAnalytics(env, fromDate, toDate) : Promise.resolve(null),
		]);

		const result = body.targets.map(t => {
			if (t.target.startsWith('cf_')) {
				const extractor = CF_EXTRACTORS[t.target];
				const empty = { requests: 0, bytes: 0, threats: 0, status_2xx: 0, status_4xx: 0, status_5xx: 0 };
				return {
					target: t.target,
					datapoints: dates.map(date => [
						extractor?.(cfData?.[date] || empty) ?? 0,
						new Date(date + 'T12:00:00Z').getTime(),
					]),
				};
			}
			if (BEACON_EXTRACTORS[t.target]) {
				return {
					target: t.target,
					datapoints: beaconEntries.map(e => [BEACON_EXTRACTORS[t.target](e.data), e.ts]),
				};
			}
			return {
				target: t.target,
				datapoints: kvEntries.map(e => [KV_EXTRACTORS[t.target]?.(e.data) ?? 0, e.ts]),
			};
		});

		return Response.json(result);
	}

	return new Response('Not found', { status: 404 });
}

// --- Main handler ---

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Grafana Simple JSON datasource (server-side, no CORS needed)
		if (url.pathname.startsWith('/grafana')) {
			return handleGrafana(request, env, url);
		}

		const headers = corsHeaders(request);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers });
		}

		// Page view beacon
		if (url.pathname === '/beacon' && request.method === 'POST') {
			ctx.waitUntil(trackBeacon(env, request));
			return new Response(null, { status: 204, headers });
		}

		const match = url.pathname.match(/^\/sync\/([a-f0-9]{64})$/);
		if (!match) return new Response('Not found', { status: 404, headers });
		const channelKey = match[1];

		if (request.method === 'PUT') {
			const body = await request.text();
			if (body.length > 512 * 1024) {
				ctx.waitUntil(trackMetric(env, 'PUT', 413, body.length, channelKey));
				return new Response('Too large', { status: 413, headers });
			}
			if (!body.startsWith('HUBI2:')) {
				ctx.waitUntil(trackMetric(env, 'PUT', 400, body.length, channelKey));
				return new Response('Invalid format', { status: 400, headers });
			}

			await env.SYNC_KV.put(channelKey, body, { expirationTtl: 30 * 86400 });
			ctx.waitUntil(trackMetric(env, 'PUT', 204, body.length, channelKey));
			return new Response(null, { status: 204, headers });
		}

		if (request.method === 'GET') {
			const val = await env.SYNC_KV.get(channelKey);
			const status = val ? 200 : 404;
			ctx.waitUntil(trackMetric(env, 'GET', status, 0, channelKey));
			if (!val) return new Response('', { status: 404, headers });
			return new Response(val, { headers: { ...headers, 'Content-Type': 'text/plain' } });
		}

		ctx.waitUntil(trackMetric(env, request.method, 405, 0, null));
		return new Response('Method not allowed', { status: 405, headers });
	}
};
