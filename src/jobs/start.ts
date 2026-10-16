import "dotenv/config";
import { scheduleFixedSummaries } from "./scheduler";

scheduleFixedSummaries()
  .then(() => console.log("Resumos diário/semanal agendados em horário fixo."))
  .catch((err) => {
    console.error("Falha ao agendar resumos", err);
    process.exit(1);
  });
