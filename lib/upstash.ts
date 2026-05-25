import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { Receiver } from "@upstash/qstash";
import { serverEnv, redisKeyPrefix } from "@/lib/env/server";

const RATE_LIMIT_NS = "ratelimit";
const CACHE_NS = "cache";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

const redis = new Redis({
  url: serverEnv.UPSTASH_REDIS_REST_URL,
  token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
});

function withPrefix(ns: string, key: string) {
  if (!key || key.includes(" ")) {
    throw new Error(`Invalid cache key: ${JSON.stringify(key)}`);
  }
  return `${redisKeyPrefix}:${ns}:${key}`;
}

export const cache = {
  async get<T extends Json>(key: string): Promise<T | null> {
    return redis.get<T>(withPrefix(CACHE_NS, key));
  },
  async set(key: string, value: Json, opts?: { ex?: number }) {
    if (opts?.ex !== undefined) {
      return redis.set(withPrefix(CACHE_NS, key), value, { ex: opts.ex });
    }
    return redis.set(withPrefix(CACHE_NS, key), value);
  },
  async del(key: string, ...rest: string[]) {
    const keys = [key, ...rest];
    return redis.del(...keys.map((k) => withPrefix(CACHE_NS, k)));
  },
  /**
   * Iterate the BSK cache namespace. `matchSuffix` is appended to the
   * `bsk:{env}:cache:` prefix; keep it as narrow as possible — `"*"` sweeps
   * the entire BSK cache and should only be used in admin tools.
   */
  async scan(matchSuffix: string, cursor: string | number = 0) {
    return redis.scan(cursor, {
      match: withPrefix(CACHE_NS, matchSuffix),
      count: 100,
    });
  },
};

/**
 * Build a sliding-window rate limiter scoped to the BSK app + env.
 * `name` is the bucket label (e.g. "login", "queue-pickup"); it's appended
 * after the bsk:{env}:ratelimit prefix and used to namespace the bucket.
 */
export function createRateLimiter(name: string, requests: number, windowSeconds: number) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Rate-limiter name must be kebab-case alphanumerics: ${name}`);
  }
  return new Ratelimit({
    redis,
    prefix: `${redisKeyPrefix}:${RATE_LIMIT_NS}:${name}`,
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    analytics: false,
  });
}

/**
 * QStash signature verifier. Wraps the current + next signing keys so rotation
 * doesn't require code changes. Returns null when signing keys are not configured
 * (preview / dev environments without QStash provisioned).
 */
export function getQStashReceiver(): Receiver | null {
  if (!serverEnv.QSTASH_CURRENT_SIGNING_KEY || !serverEnv.QSTASH_NEXT_SIGNING_KEY) {
    return null;
  }
  return new Receiver({
    currentSigningKey: serverEnv.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: serverEnv.QSTASH_NEXT_SIGNING_KEY,
  });
}
