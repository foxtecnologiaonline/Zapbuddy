import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleIncomingWebhook, verifyWebhookSubscription } from "../src/webhook/handler";
import { verifyMetaSignature } from "../src/lib/verifySignature";

// Body parser desligado de propósito: a verificação de assinatura HMAC da Meta precisa dos
// bytes crus do corpo, não do JSON já parseado.
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const challenge = verifyWebhookSubscription(req.query as Record<string, string | undefined>);
    if (challenge) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).end();
    return;
  }

  if (req.method === "POST") {
    const rawBody = await readRawBody(req);

    if (!verifyMetaSignature(rawBody, req.headers["x-hub-signature-256"] as string | undefined)) {
      res.status(401).end();
      return;
    }

    // Responde 200 de imediato — a Meta Cloud API reenvia a entrega em caso de timeout/erro.
    res.status(200).end();
    await handleIncomingWebhook(JSON.parse(rawBody.toString("utf-8")));
    return;
  }

  res.status(405).end();
}
