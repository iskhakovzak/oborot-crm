import nodemailer from "nodemailer";
import { resolve, logEvent } from "./registry";

export async function sendEmail(opts: { to: string; subject: string; html?: string; text?: string; attachments?: { filename: string; path?: string; content?: Buffer }[] }): Promise<{ ok: boolean; sandbox: boolean; messageId?: string; error?: string }> {
  const r = await resolve("email");
  if (r.live && r.config.host) {
    try {
      const port = Number(r.config.port || 465);
      const t = nodemailer.createTransport({ host: r.config.host, port, secure: port === 465, auth: r.config.user ? { user: r.config.user, pass: r.config.pass } : undefined });
      const info = await t.sendMail({ from: r.config.from || r.config.user, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html ?? (opts.text ? `<pre style="font-family:inherit">${opts.text}</pre>` : undefined), attachments: opts.attachments });
      await logEvent({ kind: "email.send", provider: "smtp", direction: "out", payload: { to: opts.to, subject: opts.subject, messageId: info.messageId }, integrationId: r.integrationId });
      return { ok: true, sandbox: false, messageId: info.messageId };
    } catch (e) {
      await logEvent({ kind: "email.send", provider: "smtp", direction: "out", payload: { to: opts.to, subject: opts.subject, error: String(e) }, status: "error", integrationId: r.integrationId });
      return { ok: false, sandbox: false, error: String(e) };
    }
  }
  await logEvent({ kind: "email.send", provider: "smtp", direction: "out", payload: { to: opts.to, subject: opts.subject, attachments: opts.attachments?.map((a) => a.filename) }, status: "sandbox", integrationId: r.integrationId });
  return { ok: true, sandbox: true, messageId: `sandbox_${Date.now()}` };
}
