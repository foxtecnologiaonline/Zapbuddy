import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { runDailySummary } from "./dailySummary";
import { runWeeklySummary } from "./weeklySummary";

function connection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL não configurado");
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export const summaryQueue = new Queue("summaries", { connection: connection() });

export const summaryWorker = new Worker(
  "summaries",
  async (job) => {
    if (job.name === "daily-summary") return runDailySummary();
    if (job.name === "weekly-summary") return runWeeklySummary();
  },
  { connection: connection() }
);

// Horário fixo, não "a cada N horas a partir de agora" — evita deriva de horário e mantém o
// resumo como hábito previsível (variação alvo: menos de 5min em 95% dos casos).
export async function scheduleFixedSummaries(): Promise<void> {
  const dailyHour = Number(process.env.DAILY_SUMMARY_HOUR ?? 20);
  const weeklyDay = Number(process.env.WEEKLY_SUMMARY_DAY ?? 0);
  const weeklyHour = Number(process.env.WEEKLY_SUMMARY_HOUR ?? 20);

  await summaryQueue.add("daily-summary", {}, { repeat: { pattern: `0 ${dailyHour} * * *` }, jobId: "daily-summary" });

  await summaryQueue.add(
    "weekly-summary",
    {},
    { repeat: { pattern: `0 ${weeklyHour} * * ${weeklyDay}` }, jobId: "weekly-summary" }
  );
}
