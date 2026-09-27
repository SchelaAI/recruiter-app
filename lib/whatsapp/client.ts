import "server-only";

import { getWhatsAppSendConfig } from "./config";
import { buildWhatsAppTemplateRequest, SCHELA_WHATSAPP_TEMPLATES, type WhatsAppNamedTemplateArgs } from "./templates";

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerBody: unknown,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

type SendResult = {
  messageId: string;
  raw: unknown;
};

async function graphPost(body: Record<string, unknown>): Promise<SendResult> {
  const { phoneNumberId, accessToken, apiVersion } = getWhatsAppSendConfig();
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage =
      raw && typeof raw === "object" && "error" in raw
        ? JSON.stringify((raw as { error?: unknown }).error)
        : `HTTP ${response.status}`;
    throw new WhatsAppApiError(
      `WhatsApp send failed: ${providerMessage}`,
      response.status,
      raw,
    );
  }

  const messageId =
    raw &&
    typeof raw === "object" &&
    "messages" in raw &&
    Array.isArray((raw as { messages?: unknown[] }).messages)
      ? ((raw as { messages: Array<{ id?: string }> }).messages[0]?.id ?? "")
      : "";

  if (!messageId) {
    throw new WhatsAppApiError(
      "WhatsApp accepted the request but returned no message id",
      response.status,
      raw,
    );
  }

  return { messageId, raw };
}

/**
 * Send a name registered in Schela's catalog. For templates other than the
 * invitation, callers must provide the verified variables from Meta Manager.
 */
export async function sendWhatsAppApprovedTemplate(input: WhatsAppNamedTemplateArgs) {
  return graphPost(buildWhatsAppTemplateRequest(input));
}

export async function sendWhatsAppInterviewTemplate(input: {
  to: string;
  candidateName: string;
  companyName: string;
  roleTitle: string;
  /** An opaque per-interview token; only for a verified dynamic URL button. */
  bookingRouteToken?: string;
}) {
  const { initialTemplateLanguage } = getWhatsAppSendConfig();
  return sendWhatsAppApprovedTemplate({
    to: input.to,
    name: SCHELA_WHATSAPP_TEMPLATES.interviewInvitation,
    language: initialTemplateLanguage,
    namedBody: {
      candidate_name: input.candidateName,
      company_name: input.companyName,
      job_title: input.roleTitle,
    },
    ...(input.bookingRouteToken ? { dynamicUrlSuffix: input.bookingRouteToken } : {}),
  });
}

export async function sendWhatsAppText(input: { to: string; text: string }) {
  return graphPost({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "text",
    text: { preview_url: false, body: input.text },
  });
}

/** Approved template: candidate_name, job_title; Choose a time URL CTA. */
export async function sendWhatsAppSchedulingReminderTemplate(input: {
  to: string; candidateName: string; roleTitle: string; bookingRouteToken: string;
}) {
  const config = getWhatsAppSendConfig();
  return sendWhatsAppApprovedTemplate({
    to: input.to,
    name: SCHELA_WHATSAPP_TEMPLATES.schedulingReminder,
    language: config.templateLanguage,
    namedBody: { candidate_name: input.candidateName, job_title: input.roleTitle },
    dynamicUrlSuffix: input.bookingRouteToken,
  });
}

/** Approved template: candidate_name, job_title, company_name; Share availability URL CTA. */
export async function sendWhatsAppAvailabilityTemplate(input: {
  to: string; candidateName: string; roleTitle: string; companyName: string; bookingRouteToken: string;
}) {
  const config = getWhatsAppSendConfig();
  return sendWhatsAppApprovedTemplate({
    to: input.to,
    name: SCHELA_WHATSAPP_TEMPLATES.availabilityRequest,
    language: config.templateLanguage,
    namedBody: {
      candidate_name: input.candidateName,
      job_title: input.roleTitle,
      company_name: input.companyName,
    },
    dynamicUrlSuffix: input.bookingRouteToken,
  });
}

/** Approved template: candidate_name, job_title, company_name, interview_date, interview_time. */
export async function sendWhatsAppInterviewScheduledTemplate(input: {
  to: string; candidateName: string; roleTitle: string; companyName: string;
  interviewDate: string; interviewTime: string; joinRouteToken: string;
}) {
  const config = getWhatsAppSendConfig();
  return sendWhatsAppApprovedTemplate({
    to: input.to,
    name: SCHELA_WHATSAPP_TEMPLATES.interviewScheduled,
    language: config.templateLanguage,
    namedBody: {
      candidate_name: input.candidateName,
      job_title: input.roleTitle,
      company_name: input.companyName,
      interview_date: input.interviewDate,
      interview_time: input.interviewTime,
    },
    dynamicUrlSuffix: input.joinRouteToken,
  });
}
