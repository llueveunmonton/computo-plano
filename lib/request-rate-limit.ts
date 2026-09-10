const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function rateLimited(request: Request, limit = 5) {
  const now = Date.now();
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(key);
  }

  const key = `${limit}:${clientKey(request)}`;
  const current = attempts.get(key);
  if (!current) {
    if (attempts.size >= MAX_TRACKED_KEYS) return true;
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > limit;
}
