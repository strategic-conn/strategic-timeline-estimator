/**
 * The email copy of a bell notification — same brand shell as the invite /
 * reset templates in supabase/email-templates/. Pure (no server-only), so the
 * e2e spec can check escaping without sending anything.
 *
 * The text is user-written (task titles, comment previews, leave notes), so
 * every interpolation goes through `esc`.
 */

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Subject line: the notification itself, one line, capped. */
export function notificationSubject(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > 110 ? `${s.slice(0, 109)}…` : s;
}

export function renderNotificationEmail(input: {
  text: string;
  /** Absolute URL of the page the bell links to. */
  url: string;
  recipientName?: string | null;
}): { subject: string; html: string; text: string } {
  const subject = notificationSubject(input.text);
  const first = input.recipientName?.trim().split(/\s+/)[0];
  const hi = first ? `Hi ${esc(first)},` : "Hi,";
  const url = esc(input.url);
  const settings = esc(new URL("/settings", input.url).toString());

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f8;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 4px 20px 4px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background-color:#4f39f6;border-radius:8px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;line-height:32px;">S</td>
<td style="padding-left:10px;font-family:${FONT};font-size:15px;font-weight:600;color:#18181b;">Strategic Estimator</td>
</tr></table></td></tr>
<tr><td style="background-color:#ffffff;border:1px solid #e4e4ec;border-radius:14px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td height="4" style="height:4px;line-height:4px;font-size:0;background-color:#4f39f6;background-image:linear-gradient(90deg,#4f39f6,#7c6cff);">&nbsp;</td></tr>
<tr><td style="padding:32px 36px;font-family:${FONT};">
<p style="margin:0 0 6px 0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#4f39f6;">Notification</p>
<p style="margin:0 0 10px 0;font-size:15px;line-height:1.6;color:#3f3f46;">${hi}</p>
<p style="margin:0 0 24px 0;font-size:17px;line-height:1.5;font-weight:600;color:#18181b;">${esc(input.text)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#4f39f6" style="border-radius:10px;background-color:#4f39f6;">
<a href="${url}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Open in Strategic Estimator &rarr;</a>
</td></tr></table>
</td></tr></table></td></tr>
<tr><td style="padding:24px 8px 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:#a1a1aa;text-align:center;">
You get these emails for task assignments, mentions, time off and won deals.<br>
<a href="${settings}" target="_blank" style="color:#71717a;">Turn them off in Settings &rarr; Profile</a><br><br>
<span style="color:#71717a;">Strategic Connection &middot; Strategic Estimator</span>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = `${first ? `Hi ${first},` : "Hi,"}\n\n${input.text}\n\nOpen it: ${input.url}\n\nTurn these emails off in Settings > Profile: ${new URL("/settings", input.url).toString()}`;

  return { subject, html, text };
}
