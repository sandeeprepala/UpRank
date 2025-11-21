import { verifyToken } from '../utils/jwt.js';

export default function authMiddleware(req, res, next) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' });
  const token = h.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload || !payload.user_id || !payload.name || !payload.region) return res.status(401).json({ error: 'invalid_token' });
  // attach user info
  req.user = { user_id: String(payload.user_id), name: String(payload.name),region: String(payload.region) };
  next();
}
