import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const raw = process.env.LEADERBOARD_SERVICE_URLS;
if (!raw) throw new Error("LEADERBOARD_SERVICE_URLS env variable required");

const upstreams = raw.split(',').map(u => u.trim());

let rrIndex = 0;
const nextTarget = () => {
  const t = upstreams[rrIndex];
  rrIndex = (rrIndex + 1) % upstreams.length;
  return t;
};

const app = express();

app.get('/health', (req, res) => {
  res.json({ ok: true, upstreams });
});

app.use(
  '/',
  createProxyMiddleware({
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',

    router: () => {
      const target = nextTarget();
      console.log(`[gateway] -> ${target}`);
      return target;
    },

    onError: (err, req, res) => {
      console.error('[gateway] proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'bad_gateway' });
      }
    }
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Upstreams: ${upstreams.join(', ')}`);
});
