export const EMAIL_LEGAL_FOOTER =
  "Copyright © 2026 Schela AI. All rights reserved. Hosur Road, Bengaluru, KA 560100";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderOutboundEmailText(text: string) {
  return `${text.trim()}\n\n${EMAIL_LEGAL_FOOTER}`;
}

export function renderOutboundEmailHtml(text: string) {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map(
      (part) =>
        `<p style="margin:0 0 16px;line-height:1.7;font-size:15px;font-weight:500;color:#211d27">${escapeHtml(part).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f5f2;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#211d27">
    <div style="max-width:640px;margin:0 auto;padding:32px 18px">
      <div style="background:#ffffff;border:1px solid #ebe7ef;border-radius:18px;padding:30px 30px 24px;box-shadow:0 8px 30px rgba(38,28,51,.06)">
        <div style="display:inline-block;margin-bottom:22px;font-size:19px;line-height:1;font-weight:800;letter-spacing:-.02em;color:#6d28d9">Schela</div>
        <div>${paragraphs}</div>
        <div style="margin-top:26px;padding-top:18px;border-top:1px solid #eeeaf1;font-size:11px;line-height:1.65;color:#8e8895">
          ${escapeHtml(EMAIL_LEGAL_FOOTER)}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Keep only the newest human-authored portion of an inbound email.
 * Email providers often include the full quoted thread, signatures and
 * certificate badges in the plain-text body. Those are useful to the mailbox,
 * but noisy in Schela's chat UI and AI context.
 */
export function cleanInboundEmailText(value: string) {
  let text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) return "";

  const cutMarkers: RegExp[] = [
    /\n\s*On [\s\S]{0,700}?wrote:\s*(?:\n|$)/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}\s*(?:\n|$)/i,
    /\n\s*From:\s*[^\n]+\n\s*(?:Sent|Date):\s*[^\n]+\n\s*To:\s*[^\n]+(?:\n\s*Subject:\s*[^\n]+)?/i,
    /\n\s*_{5,}\s*(?:\n|$)/,
  ];

  let earliest = -1;
  for (const marker of cutMarkers) {
    const match = marker.exec(text);
    if (match && (earliest === -1 || match.index < earliest)) earliest = match.index;
  }
  if (earliest >= 0) text = text.slice(0, earliest).trim();

  // Remove common signature/certificate clutter that provides no scheduling context.
  const cleanedLines: string[] = [];
  let skippingCertificateUrl = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (/^<https?:\/\/(?:www\.)?certify-mail\.com\//i.test(trimmed)) {
      skippingCertificateUrl = !trimmed.includes(">");
      continue;
    }
    if (skippingCertificateUrl) {
      if (trimmed.includes(">")) skippingCertificateUrl = false;
      continue;
    }
    if (/^\[image:[^\]]*\]/i.test(trimmed)) continue;
    if (/^View certificate\.?$/i.test(trimmed)) continue;

    cleanedLines.push(line);
  }

  text = cleanedLines
    .join("\n")
    .replace(/\n\s*--\s*\n[\s\S]*$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}
