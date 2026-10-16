import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { IncomingMessageJob } from "./queue";
import { runOrchestrator } from "../orchestrator";
import { sendWhatsAppMessage } from "../lib/whatsapp";
import { toUserMessage } from "../lib/errors";

function connection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL não configurado");
  return new IORedis(url, { maxRetriesPerRequest: null });
}

const LATENCY_TARGET_MS = 3000;

export const worker = new Worker<IncomingMessageJob>(
  "incoming-messages",
  async (job) => {
    const start = Date.now();
    const { whatsappNumber } = job.data;

    try {
      const reply = await runOrchestrator(job.data);
      await sendWhatsAppMessage(whatsappNumber, reply);
    } catch (err) {
      await sendWhatsAppMessage(whatsappNumber, toUserMessage(err));
      throw err;
    } finally {
      const durationMs = Date.now() - start;
      if (durationMs > LATENCY_TARGET_MS) {
        console.warn(`Latência acima da meta (${LATENCY_TARGET_MS}ms): ${durationMs}ms no job ${job.id}`);
      }
    }
  },
  { connection: connection(), concurrency: 10 }
);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} falhou após retries`, err);
});
