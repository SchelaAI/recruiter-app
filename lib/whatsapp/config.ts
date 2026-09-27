import "server-only";

export type WhatsAppWebhookConfig = {
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
};

const DEFAULT_API_VERSION = "v23.0";
const DEFAULT_INITIAL_TEMPLATE_NAME = "interview_invitation";
// The user's WhatsApp Manager screenshot labels the template "English".
// For Meta, this is commonly `en`; override if your template metadata says `en_US`.
const DEFAULT_INITIAL_TEMPLATE_LANGUAGE = "en";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function getWhatsAppWebhookConfig(): WhatsAppWebhookConfig {
  return {
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    verifyToken: required("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    appSecret: required("WHATSAPP_APP_SECRET"),
  };
}

export function getWhatsAppSendConfig() {
  return {
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    accessToken: required("WHATSAPP_ACCESS_TOKEN"),
    apiVersion: DEFAULT_API_VERSION,
    initialTemplateName: DEFAULT_INITIAL_TEMPLATE_NAME,
    initialTemplateLanguage:
      process.env.WHATSAPP_INVITATION_LANGUAGE?.trim() || DEFAULT_INITIAL_TEMPLATE_LANGUAGE,
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || DEFAULT_INITIAL_TEMPLATE_LANGUAGE,
    // All four approved Schela templates use their URL CTA dynamically.
    // Meta template URLs must be:
    // - interview_invitation / scheduling_reminder / availability_request:
    //   https://recruiter.schela.app/book/{{1}}
    // - interview_scheduled:
    //   https://recruiter.schela.app/join/{{1}}
  };
}
