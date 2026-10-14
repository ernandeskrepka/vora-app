import IORedis from "ioredis";
import { env } from "@/env";

/**
 * O BullMQ exige maxRetriesPerRequest: null.
 * Uma conexao por processo (web e worker sao processos separados).
 */
const globalForRedis = globalThis as unknown as { redis?: IORedis };

function criar() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export const redis: IORedis = globalForRedis.redis ?? criar();

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
