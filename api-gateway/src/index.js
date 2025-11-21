import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import morgan from 'morgan';
import RateLimiter from './middlewares/rateLimiter.js';
import { LEADERBOARD_SERVICE_URL, PORT } from './config.js';

const app = express();
app.use(express.json());
app.use(morgan('dev'));

// simple token-bucket rate limiter middleware
app.use(RateLimiter());

// Basic proxy forwarder to leaderboard service
app.all('/score/*', async (req, res) => {
  try {
    const url = `${LEADERBOARD_SERVICE_URL}${req.path.replace('/score', '') || req.path}`;
    const resp = await axios({
      method: req.method,
      url,
      headers: { ...req.headers, host: undefined },
      data: req.body,
      params: req.query,
      timeout: 5000,
    });
    res.status(resp.status).json(resp.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    console.error('Gateway proxy error', err.message);
    res.status(502).json({ error: 'Bad gateway' });
  }
});

// Proxy login to leaderboard-service
app.post('/auth/login', async (req, res) => {
  try {
    const resp = await axios.post(`${LEADERBOARD_SERVICE_URL}/auth/login`, req.body, { timeout: 5000 });
    res.status(resp.status).json(resp.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    console.error('Gateway auth proxy error', err.message);
    res.status(502).json({ error: 'Bad gateway' });
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const resp = await axios.post(`${LEADERBOARD_SERVICE_URL}/auth/register`, req.body, { timeout: 5000 });
    res.status(resp.status).json(resp.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    console.error('Gateway auth proxy error', err.message);
    res.status(502).json({ error: 'Bad gateway' });
  }
});

// Forward other leaderboard endpoints
app.all('/top', async (req, res) => {
  try {
    const resp = await axios.get(`${LEADERBOARD_SERVICE_URL}/top`, { params: req.query });
    res.json(resp.data);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Bad gateway' });
  }
});

app.all('/rank/:userId', async (req, res) => {
  try {
    const resp = await axios.get(`${LEADERBOARD_SERVICE_URL}/rank/${req.params.userId}`, { params: req.query });
    res.json(resp.data);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Bad gateway' });
  }
});

app.all('/around/:userId', async (req, res) => {
  try {
    const resp = await axios.get(`${LEADERBOARD_SERVICE_URL}/around/${req.params.userId}`, { params: req.query });
    res.json(resp.data);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Bad gateway' });
  }
});

const port = PORT || 4000;
app.listen(port, () => console.log(`API Gateway listening on ${port}`));
