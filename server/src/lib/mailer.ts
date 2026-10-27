// Transactional email through the Resend REST API (no SDK). Without RESEND_API_KEY (local dev) the message is
// printed to the server log instead, so password reset links still work.

type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(mail: Mail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[mail] (RESEND_API_KEY not set, not sent)\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'Gymawy <onboarding@resend.dev>', ...mail }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function appUrl() {
  return (process.env.APP_URL || process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173').replace(/\/$/, '');
}
