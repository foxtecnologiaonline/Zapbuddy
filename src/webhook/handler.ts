import { messageQueue, IncomingMessageJob } from "../queue/queue";
import { sendAck } from "../lib/whatsapp";
import { getSupabase } from "../db/supabase";

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          audio?: { id: string };
        }>;
      };
    }>;
  }>;
}

async function findOrCreateUser(whatsappNumber: string): Promise<string> {
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("users")
    .insert({ whatsapp_number: whatsappNumber })
    .select("id")
    .single();

  if (error || !created) throw new Error(`Falha ao criar usuário: ${error?.message}`);
  return created.id;
}

// Handler responde com ack e enfileira antes de qualquer processamento pesado (transcrição, IA) —
// é o que faz o Tom parecer rápido mesmo quando o processamento real demora alguns segundos.
export async function handleIncomingWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

  for (const message of messages) {
    const whatsappNumber = message.from;
    const userId = await findOrCreateUser(whatsappNumber);

    const isAudio = message.type === "audio";
    await sendAck(whatsappNumber, isAudio ? "audio" : "text");

    const job: IncomingMessageJob = {
      userId,
      whatsappNumber,
      kind: isAudio ? "audio" : "text",
      text: message.text?.body,
      audioMediaId: message.audio?.id,
    };

    await messageQueue.add("process-message", job);
  }
}

export function verifyWebhookSubscription(query: Record<string, string | undefined>): string | null {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return challenge;
  }
  return null;
}
