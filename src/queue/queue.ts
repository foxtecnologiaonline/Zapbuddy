import { Queue } from "bullmq";
import IORedis from "ioredis";

function connection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL não configurado");
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export interface IncomingMessageJob {
  userId: string | null;
  whatsappNumber: string;
  kind: "text" | "audio";
  text?: string;
  audioMediaId?: string;
}

export const messageQueue = new Queue<IncomingMessageJob>("incoming-messages", {
  connection: connection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});
