import type { NextApiRequest, NextApiResponse } from 'next';

// In-memory store for rate limiting (in production, use Redis)
// Format: { "ip:15min-bucket": attemptCount }
const rateLimitStore = new Map<string, { attempts: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes in milliseconds
const MAX_LOGIN_ATTEMPTS = 5;

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export async function rateLimitLogin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const clientIp = getClientIp(req);
  const now = Date.now();
  
  // Create a bucket key based on IP and time window
  const bucketKey = `login:${clientIp}`;
  const bucketData = rateLimitStore.get(bucketKey);
  
  // Check if we need to reset the bucket
  if (bucketData && now > bucketData.resetTime) {
    rateLimitStore.delete(bucketKey);
  }
  
  // Get current bucket or create new one
  let current = rateLimitStore.get(bucketKey);
  
  if (!current) {
    current = {
      attempts: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
    rateLimitStore.set(bucketKey, current);
    return true; // Allow request
  }
  
  current.attempts++;
  
  if (current.attempts > MAX_LOGIN_ATTEMPTS) {
    const resetTimeSeconds = Math.ceil((current.resetTime - now) / 1000);
    res.status(429).json({
      error: 'Too many login attempts',
      retryAfter: resetTimeSeconds,
      message: `Please try again in ${resetTimeSeconds} seconds`,
    });
    return false;
  }
  
  return true; // Allow request
}
