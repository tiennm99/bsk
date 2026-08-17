import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { Receiver } from "@upstash/qstash";
import { serverEnv, redisKeyPrefix } from "@/lib/env/server";

const RATE_LIMIT_NS = "ratelimit";
const CACHE_NS = "cache";

// Cache keys: lowercase alphanumerics, '-' for words, ':' for sub-namespacing.
// Forbids spaces, glob chars (* ? [ ]), control chars, uppercase. Matches
// the strictness of `createRateLimiter` so callers cannot accidentally write
// keys that interact with SCAN globs or pollute neighboring apps.
const KEY_RE = /^[a-z0-9][a-z0-9:-]*$/;

// SCAN patterns allow '*' for sweeps but are otherwise constrained.
const SCAN_PATTERN_RE = /^[a-z0-9:*-]+$/;

/** @typedef {string | number | boolean | null | JsonMap | JsonArray} Json */
/** @typedef {{ [k: string]: Json }} JsonMap */
/** @typedef {Json[]} JsonArray */

const redis = new Redis({
  url: serverEnv.UPSTASH_REDIS_REST_URL,
  token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * @param {string} ns
 * @param {string} key
 * @returns {string}
 */
function withPrefix(ns, key) {
  if (!KEY_RE.test(key)) {
    throw new Error(
      `Invalid cache key (lowercase + digits + '-' + ':' only, must start with alphanumeric): ${JSON.stringify(key)}`,
    );
  }
  return `${redisKeyPrefix}:${ns}:${key}`;
}

/**
 * @param {string} ns
 * @param {string} pattern
 * @returns {string}
 */
function withScanPattern(ns, pattern) {
  if (!SCAN_PATTERN_RE.test(pattern)) {
    throw new Error(`Invalid SCAN pattern: ${JSON.stringify(pattern)}`);
  }
  return `${redisKeyPrefix}:${ns}:${pattern}`;
}

export const cache = {
  /**
   * @template {Json} T
   * @param {string} key
   * @returns {Promise<T | null>}
   */
  async get(key) {
    return redis.get(withPrefix(CACHE_NS, key));
  },
  /**
   * @param {string} key
   * @param {Json} value
   * @param {{ ex?: number }} [opts]
   */
  async set(key, value, opts) {
    if (opts?.ex !== undefined) {
      return redis.set(withPrefix(CACHE_NS, key), value, { ex: opts.ex });
    }
    return redis.set(withPrefix(CACHE_NS, key), value);
  },
  /**
   * @param {string} key
   * @param {...string} rest
   */
  async del(key, ...rest) {
    const keys = [key, ...rest];
    return redis.del(...keys.map((k) => withPrefix(CACHE_NS, k)));
  },
  /**
   * Iterate the BSK cache namespace. `matchSuffix` is appended to the
   * `bsk:{env}:cache:` prefix; keep it as narrow as possible — `"*"` sweeps
   * the entire BSK cache and should only be used in admin tools.
   *
   * @param {string} matchSuffix
   * @param {string | number} [cursor]
   */
  async scan(matchSuffix, cursor = 0) {
    return redis.scan(cursor, {
      match: withScanPattern(CACHE_NS, matchSuffix),
      count: 100,
    });
  },
};

/**
 * Build a sliding-window rate limiter scoped to the BSK app + env.
 * `name` is the bucket label (e.g. "login", "queue-pickup"); it's appended
 * after the bsk:{env}:ratelimit prefix and used to namespace the bucket.
 *
 * @param {string} name
 * @param {number} requests
 * @param {number} windowSeconds
 */
export function createRateLimiter(name, requests, windowSeconds) {
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
 *
 * @returns {Receiver | null}
 */
export function getQStashReceiver() {
  if (!serverEnv.QSTASH_CURRENT_SIGNING_KEY || !serverEnv.QSTASH_NEXT_SIGNING_KEY) {
    return null;
  }
  return new Receiver({
    currentSigningKey: serverEnv.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: serverEnv.QSTASH_NEXT_SIGNING_KEY,
  });
}
