import "server-only";

export interface SendEmailParams {
  to: string;
  from: string;
  replyTo?: string;
  cc?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(params: SendEmailParams): Promise<SendEmailResult>;
}

// Abstracted per spec section 1 — "swappable for Postmark/SES." Anything
// that sends mail in this app goes through this interface, never the
// Resend SDK directly.
class ResendProvider implements EmailProvider {
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error:
          "RESEND_API_KEY is not set — email is queued in the database but won't actually send until it is.",
      };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: params.from,
          to: [params.to],
          cc: params.cc ? [params.cc] : undefined,
          reply_to: params.replyTo,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Resend API error (${res.status}): ${body}` };
      }

      const data = (await res.json()) as { id: string };
      return { ok: true, providerMessageId: data.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unknown send error" };
    }
  }
}

export function getEmailProvider(): EmailProvider {
  return new ResendProvider();
}
