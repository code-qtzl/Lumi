/**
 * JWT auth middleware.
 *
 * When JWT_SECRET is set, every protected route requires:
 *   Authorization: Bearer <token>
 *
 * When JWT_SECRET is NOT set (default dev mode), auth is skipped so the
 * server runs without any configuration.
 *
 * Tokens are minted by POST /api/auth/token.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  trainee_id?: string;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.JWT_SECRET;

  // Dev mode — no secret configured, skip auth entirely.
  if (!secret) {
    return next();
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required: Bearer <token>' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, secret) as { trainee_id: string };
    req.trainee_id = payload.trainee_id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
