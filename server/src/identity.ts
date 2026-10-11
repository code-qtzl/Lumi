/**
 * Anonymous per-browser identity — every visitor gets their own trainee id.
 *
 * No accounts, no PII: the first request mints a random id and sets it in a
 * signed, httpOnly cookie. Every session and report is owned by that id, so
 * a trainee only ever sees their own work (vision: "Trainee scores are
 * private to the trainee"). Clearing cookies starts a fresh history.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getSession } from './session/store';

export const COOKIE_NAME = 'lumi_tid';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

declare module 'express-serve-static-core' {
  interface Request {
    traineeId: string;
  }
}

/** Secret for signing the cookie. Required in production; dev gets a fixed fallback. */
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  return 'lumi-dev-only-secret';
}

/** Called at boot so a misconfigured production deploy fails fast, not per request. */
export function assertIdentityConfig(): void {
  secret();
}

function sign(id: string): string {
  return createHmac('sha256', secret()).update(id).digest('base64url');
}

/** Returns the trainee id if the cookie value is `<id>.<sig>` with a valid signature. */
export function verify(value: string): string | null {
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(id));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Attaches req.traineeId, minting and setting a new cookie when absent or tampered. */
export function identify(req: Request, res: Response, next: NextFunction): void {
  const raw = readCookie(req, COOKIE_NAME);
  const existing = raw ? verify(raw) : null;
  if (existing) {
    req.traineeId = existing;
    return next();
  }
  const id = randomUUID();
  req.traineeId = id;
  res.cookie(COOKIE_NAME, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR_MS,
    path: '/',
  });
  next();
}

/**
 * Guards every /api/sessions/:id/* route: someone else's session answers 404,
 * same as a missing one, so ids can't be probed for existence.
 */
export function requireOwnedSession(req: Request<{ id: string }>, res: Response, next: NextFunction): void {
  const state = getSession(req.params.id);
  if (state && state.owner_id !== req.traineeId) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  next();
}
