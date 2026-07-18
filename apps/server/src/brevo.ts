/**
 * Sends the World Cup login codes through Brevo's transactional email API
 * (api.brevo.com). The key + verified sender are Worker secrets/vars, so this is
 * only ever called server-side. transfermarkt.com-style hosts aside, Brevo is a
 * plain REST POST that works fine from a Worker.
 */

export interface BrevoEnv {
  BREVO_API_KEY?: string;
  /** Verified Brevo sender address (e.g. labrint@gmail.com). */
  AUTH_SENDER?: string;
  AUTH_SENDER_NAME?: string;
}

/** True only when both the key and a verified sender are configured. */
export function emailConfigured(env: BrevoEnv): boolean {
  return !!env.BREVO_API_KEY && !!env.AUTH_SENDER;
}

/** Email a 6-digit login code. `product` names the board the code is for (e.g.
 * "Club Football", "World Cup Predictions") so the email reads correctly per game.
 * Throws on a non-2xx response so the caller can surface "couldn't send" rather
 * than silently claiming success. */
export async function sendOtpEmail(
  env: BrevoEnv,
  to: string,
  code: string,
  product = 'World Cup Predictions',
): Promise<void> {
  if (!emailConfigured(env)) throw new Error('email-not-configured');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY!,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.AUTH_SENDER, name: env.AUTH_SENDER_NAME || product },
      to: [{ email: to }],
      subject: `Your ${product} code: ${code}`,
      htmlContent:
        `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#1a1d2e">` +
        `<p>Your ${product} login code is:</p>` +
        `<p style="font-size:30px;font-weight:800;letter-spacing:4px">${code}</p>` +
        `<p style="color:#666">It expires in 10 minutes. If you didn't ask to log in, ignore this email.</p>` +
        `</div>`,
      textContent: `Your ${product} login code is ${code}. It expires in 10 minutes.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`brevo-${res.status}`);
  }
}
