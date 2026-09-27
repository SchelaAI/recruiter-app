/**
 * Template names observed in the owner's September 27 WhatsApp Manager recording.
 * The user supplied four approved template detail screenshots. Their named
 * body-variable contracts are defined below; the button URLs are NOT visible
 * in the screenshots and must be verified separately before dynamic CTA sends.
 */
export const SCHELA_WHATSAPP_TEMPLATES = {
  interviewInvitation: "interview_invitation",
  interviewScheduled: "interview_scheduled",
  interviewConfirmation: "interview_confirmation",
  interviewReminder: "interview_reminder",
  interviewStartingSoon: "interview_starting_soon", // Final suffix inferred from cropped video.
  schedulingReminder: "scheduling_reminder",
  availabilityRequest: "availability_request",
  rescheduleRequest: "reschedule_request",
  interviewRescheduled: "interview_rescheduled",
  interviewCancelled: "interview_cancelled",
  missedInterview: "missed_interview",
} as const;

export type SchelaWhatsAppTemplateName =
  (typeof SCHELA_WHATSAPP_TEMPLATES)[keyof typeof SCHELA_WHATSAPP_TEMPLATES];

// Exact named placeholders visible in the owner's active interview_invitation template.
export const INTERVIEW_INVITATION_BODY_FIELDS = [
  "candidate_name",
  "company_name",
  "job_title",
] as const;

/** Exact body parameter names observed in the four approved screenshots. */
export const SCHEDULING_REMINDER_BODY_FIELDS = ["candidate_name", "job_title"] as const;
export const INTERVIEW_SCHEDULED_BODY_FIELDS = [
  "candidate_name", "job_title", "company_name", "interview_date", "interview_time",
] as const;
export const AVAILABILITY_REQUEST_BODY_FIELDS = [
  "candidate_name", "job_title", "company_name",
] as const;

/** Recipient-facing preview text for the single shared Schela conversation. */
export function schelaTemplateText(
  template: "interview_invitation" | "scheduling_reminder" | "interview_scheduled" | "availability_request",
  params: Record<string, string>,
) {
  const x = (key: string) => params[key] ?? "";
  switch (template) {
    case "interview_invitation":
      return `Hi ${x("candidate_name")}, this is Schela, the AI Hiring Coordinator for ${x("company_name")}. We'd like to schedule your interview for the ${x("job_title")} position. Please choose a convenient time using the link below.`;
    case "scheduling_reminder":
      return `Hi ${x("candidate_name")}, we're still waiting for you to select an interview time for the ${x("job_title")} position. Please choose a convenient slot using the link below.`;
    case "interview_scheduled":
      return `Hi ${x("candidate_name")}, your interview for the ${x("job_title")} position at ${x("company_name")} is confirmed for ${x("interview_date")} at ${x("interview_time")}. Please use the link below to join.`;
    case "availability_request":
      return `Hi ${x("candidate_name")}, we'd like to schedule your interview for the ${x("job_title")} position at ${x("company_name")}. Please share your preferred availability using the link below.`;
  }
}

export type WhatsAppNamedTemplateArgs = {
  to: string;
  name: SchelaWhatsAppTemplateName;
  language: string;
  namedBody?: Record<string, string>;
  positionalBody?: string[];
  /** Only pass this if the approved template has a dynamic URL button. */
  dynamicUrlSuffix?: string;
  urlButtonIndex?: number;
};

/** Pure builder so we can unit-test the Cloud API payload without provider credentials. */
export function buildWhatsAppTemplateRequest(input: WhatsAppNamedTemplateArgs) {
  if (!input.to.trim() || !input.name.trim() || !input.language.trim()) {
    throw new Error("WhatsApp template recipient, name, and language are required");
  }
  if (input.namedBody && input.positionalBody) {
    throw new Error("Use either named or positional WhatsApp body variables, never both");
  }
  const components: Array<Record<string, unknown>> = [];
  if (input.namedBody) {
    const parameters = Object.entries(input.namedBody).map(([parameter_name, text]) => {
      if (!/^[a-z][a-z0-9_]*$/.test(parameter_name) || !text?.trim()) {
        throw new Error(`Invalid or empty WhatsApp named parameter: ${parameter_name}`);
      }
      return { type: "text", parameter_name, text: text.trim() };
    });
    if (parameters.length) components.push({ type: "body", parameters });
  } else if (input.positionalBody?.length) {
    const parameters = input.positionalBody.map((text) => {
      if (!text?.trim()) throw new Error("WhatsApp positional parameters may not be empty");
      return { type: "text", text: text.trim() };
    });
    components.push({ type: "body", parameters });
  }
  if (input.dynamicUrlSuffix !== undefined) {
    const suffix = input.dynamicUrlSuffix.trim();
    if (!suffix || suffix.length > 512 || /[\s\u0000-\u001f]/.test(suffix)) {
      throw new Error("Invalid dynamic WhatsApp URL button suffix");
    }
    const index = input.urlButtonIndex ?? 0;
    if (!Number.isInteger(index) || index < 0 || index > 9) {
      throw new Error("Invalid WhatsApp URL button index");
    }
    components.push({
      type: "button",
      sub_type: "url",
      index: String(index),
      parameters: [{ type: "text", text: suffix }],
    });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to.trim(),
    type: "template",
    template: {
      name: input.name,
      language: { code: input.language.trim() },
      components,
    },
  };
}
