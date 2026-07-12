/**
 * Auth routes.
 *
 *   POST /api/auth/token  — mint a JWT for a trainee_id
 *
 * Returns 501 when JWT_SECRET is not configured (dev mode).
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';

export const authRouter = Router();

authRouter.post('/token', (req, res) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(501).json({
      error: 'Auth is not enabled on this server. Set JWT_SECRET to enable it.',
    });
  }

  const { trainee_id } = req.body;
  if (!trainee_id || typeof trainee_id !== 'string' || !trainee_id.trim()) {
    return res.status(400).json({ error: 'trainee_id is required' });
  }

  const expiry = process.env.JWT_EXPIRY || '8h';
  const token = jwt.sign({ trainee_id: trainee_id.trim() }, secret, {
    expiresIn: expiry as jwt.SignOptions['expiresIn'],
  });

  return res.json({ token, trainee_id: trainee_id.trim(), expires_in: expiry });
});
