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

// Demo build: nothing is actually sent. Sends are recorded in email_sends
// and reported as delivered so the flow can be shown end to end.
class DemoEmailProvider implements EmailProvider {
  async send(): Promise<SendEmailResult> {
    return { ok: true, providerMessageId: `demo_${Date.now().toString(36)}` };
  }
}

export function getEmailProvider(): EmailProvider {
  return new DemoEmailProvider();
}
