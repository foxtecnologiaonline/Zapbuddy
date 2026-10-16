import { runOrchestrator } from "./ai/orchestrator.js";

/**
 * Demo manual do orquestrador — não é teste automatizado, é para rodar
 * `npm run demo` e ler as respostas/tool calls no tom certo antes de
 * plugar no webhook do WhatsApp.
 */
async function main() {
  const userId = "demo-user";
  const mensagens = [
    "oi, me chamo Marina, sou autônoma de design",
    "gastei 45 reais no mercado hoje de manhã",
    "me lembra de pagar o DAS dia 20",
    "como tá meu resumo da semana?",
  ];

  for (const texto of mensagens) {
    console.log(`\n> usuário: ${texto}`);
    const runner = await runOrchestrator(userId, [{ role: "user", text: texto }]);
    const finalMessage = await runner;
    for (const block of finalMessage.content) {
      if (block.type === "text") console.log(`< zapbuddy: ${block.text}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
