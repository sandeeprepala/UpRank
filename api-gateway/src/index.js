import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const LEADERBOARD_SERVICE_URLS = ['http://localhost:5001','http://localhost:5002','http://localhost:5003']

const app = express();

// Round-robin load balancer across configured leaderboard service URLs
const upstreams = Array.isArray(LEADERBOARD_SERVICE_URLS) && LEADERBOARD_SERVICE_URLS.length > 0
	? LEADERBOARD_SERVICE_URLS
	: ['http://localhost:5000'];

let rrIndex = 0;
function nextTarget() {
	const t = upstreams[rrIndex % upstreams.length];
	rrIndex = (rrIndex + 1) % upstreams.length;
	return t;
}

// health endpoint for gateway
app.get('/health', (req, res) => {
	res.json({ ok: true, upstreams });
});

// Proxy all API requests and distribute them round-robin to upstreams
app.use('/', createProxyMiddleware({
	changeOrigin: true,
	ws: true,
	logLevel: 'warn',
	router: (req) => {
		const target = nextTarget();
		console.log(`[gateway] proxy ${req.method} ${req.url} -> ${target}`);
		return target;
	},
	onError: (err, req, res) => {
		console.error('[gateway] proxy error', err && err.message ? err.message : err);
		try {
			if (!res.headersSent) res.status(502).json({ error: 'bad_gateway' });
		} catch (e) {
			console.error('failed to send error response', e);
		}
	}
}));

const PORT = process.env.PORT || GATEWAY_PORT || 3000;
app.listen(PORT, () => {
	console.log(`API Gateway running on port ${PORT}, upstreams: ${upstreams.join(', ')}`);
});
