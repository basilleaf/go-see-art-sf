import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const RPM = 10 // 10 requests per minute

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(RPM, "1 m"),
  analytics: true,
});
