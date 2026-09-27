import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppSendConfig } from "./config";
import { normalizeWhatsAppNumber } from "./phone";
import {
  sendWhatsAppInterviewTemplate, sendWhatsAppText,
  sendWhatsAppAvailabilityTemplate, sendWhatsAppSchedulingReminderTemplate,
  sendWhatsAppInterviewScheduledTemplate,
} from "./client";
import { schelaTemplateText } from "./templates";
import { createInterviewSchedulingLink } from "@/lib/calendly/client";

const ROUTE_DAYS = 30;

function errorText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1500) : "Unknown WhatsApp error";
}

export async function sendInitialWhatsAppOutreach(input: {
  orgId: string;
  interviewId: number;
  conversationId: string;
  candidateId: string;
  candidateName: string;
  countryCode: string;
  phone: string;
  phoneE164?: string | null;
  companyName: string;
  roleTitle: string;
  candidateEmail: string;
  format: string;
}) {
  const admin = createAdminClient();
  const config = getWhatsAppSendConfig();
  const to = input.phoneE164 || normalizeWhatsAppNumber(input.countryCode, input.phone);
  if (!to) throw new Error("Candidate has no valid WhatsApp phone number");

  const expiresAt = new Date(Date.now() + ROUTE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: routeClaimed, error: routeError } = await admin.rpc(
    "claim_whatsapp_thread_route",
    {
      p_sender_phone_number_id: config.phoneNumberId,
      p_candidate_wa_id: to,
      p_org_id: input.orgId,
      p_candidate_id: input.candidateId,
      p_conversation_id: input.conversationId,
      p_interview_id: input.interviewId,
      p_expires_at: expiresAt,
    },
  );

  if (routeError) throw new Error(`Could not claim WhatsApp route: ${routeError.message}`);
  if (!routeClaimed) {
    throw new Error(
      "This phone number already has another active Schela interview on the shared WhatsApp sender. Finish or expire that thread before starting another one.",
    );
  }

  const visibleText = `Hi ${input.candidateName}, this is Schela, the AI Hiring Coordinator for ${input.companyName}. We'd like to schedule your interview for the ${input.roleTitle} position. Please choose a convenient time using the link below.`;
  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      org_id: input.orgId,
      conversation_id: input.conversationId,
      from_role: "schela",
      sender_kind: "ai",
      sender_name: "Schela",
      text: visibleText,
      channel: "wa",
      delivered: false,
      delivery_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !message) {
    await admin
      .from("whatsapp_thread_routes")
      .delete()
      .eq("sender_phone_number_id", config.phoneNumberId)
      .eq("candidate_wa_id", to)
      .eq("conversation_id", input.conversationId);
    throw new Error(insertError?.message ?? "Could not create outbound WhatsApp message row");
  }

  let createdBookingToken: string | null = null;
  try {
    // The approved interview_invitation has a dynamic "Choose a time" CTA.
    // Proactive WhatsApp invitations therefore require a Calendly interview so
    // Schela can populate the exact one-use /book/{{1}} token.
    if (input.format !== "Calendly") {
      throw new Error("WhatsApp interview invitations require the Calendly format because the approved template uses a dynamic booking button");
    }
    {
      const link = await createInterviewSchedulingLink({
        orgId: input.orgId,
        interviewId: input.interviewId,
        conversationId: input.conversationId,
        candidateId: input.candidateId,
        candidateName: input.candidateName,
        candidateEmail: input.candidateEmail,
      });
      createdBookingToken = link.routeToken;
    }

    const result = await sendWhatsAppInterviewTemplate({
      to,
      candidateName: input.candidateName,
      companyName: input.companyName,
      roleTitle: input.roleTitle,
      bookingRouteToken: createdBookingToken ?? undefined,
    });

    const sentAt = new Date().toISOString();
    await Promise.all([
      admin
        .from("messages")
        .update({
          whatsapp_message_id: result.messageId,
          delivery_status: "accepted",
          delivery_error: null,
        })
        .eq("id", message.id)
        .eq("org_id", input.orgId),
      admin
        .from("interviews")
        .update({ initial_outreach_sent_at: sentAt, ai_state: "waiting_reply" })
        .eq("id", input.interviewId)
        .eq("org_id", input.orgId),
      admin
        .from("candidates")
        .update({ ai_state: "waiting_reply", phone_e164: to, updated_at: sentAt })
        .eq("id", input.candidateId)
        .eq("org_id", input.orgId),
      admin
        .from("conversations")
        .update({
          updated_at: sentAt,
          escalated: false,
          escalation_reason: null,
        })
        .eq("id", input.conversationId)
        .eq("org_id", input.orgId),
    ]);

    return { ok: true as const, messageId: result.messageId };
  } catch (error) {
    const reason = errorText(error);
    if (createdBookingToken) {
      // The template wasn't accepted; don't leave a seemingly sent booking URL.
      await Promise.all([
        admin.from("calendly_booking_routes")
          .delete().eq("route_token", createdBookingToken)
          .eq("org_id", input.orgId).eq("interview_id", input.interviewId),
        admin.from("interviews")
          .update({ calendly_booking_link_sent_at: null })
          .eq("id", input.interviewId).eq("org_id", input.orgId),
      ]);
    }
    await Promise.all([
      admin
        .from("whatsapp_thread_routes")
        .delete()
        .eq("sender_phone_number_id", config.phoneNumberId)
        .eq("candidate_wa_id", to)
        .eq("conversation_id", input.conversationId),
      admin
        .from("messages")
        .update({ delivery_status: "failed", delivery_error: reason, delivered: false })
        .eq("id", message.id)
        .eq("org_id", input.orgId),
      admin
        .from("interviews")
        .update({ ai_state: "escalated" })
        .eq("id", input.interviewId)
        .eq("org_id", input.orgId),
      admin
        .from("conversations")
        .update({ escalated: true, escalation_reason: reason, updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .eq("org_id", input.orgId),
    ]);
    return { ok: false as const, error: reason };
  }
}

export async function sendHumanWhatsAppMessage(input: {
  orgId: string;
  conversationId: string;
  candidateName: string;
  candidateWaId: string;
  senderName: string;
  text: string;
}) {
  const admin = createAdminClient();
  const { data: row, error: insertError } = await admin
    .from("messages")
    .insert({
      org_id: input.orgId,
      conversation_id: input.conversationId,
      from_role: "schela",
      sender_kind: "human",
      sender_name: input.senderName || "Recruiter",
      text: input.text,
      channel: "wa",
      delivered: false,
      delivery_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !row) throw new Error(insertError?.message ?? "Could not save message");

  try {
    const result = await sendWhatsAppText({ to: input.candidateWaId, text: input.text });
    await Promise.all([
      admin
        .from("messages")
        .update({ whatsapp_message_id: result.messageId, delivery_status: "accepted", delivery_error: null })
        .eq("id", row.id)
        .eq("org_id", input.orgId),
      admin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .eq("org_id", input.orgId),
    ]);
    return { ok: true as const };
  } catch (error) {
    const reason = errorText(error);
    await admin
      .from("messages")
      .update({ delivery_status: "failed", delivery_error: reason, delivered: false })
      .eq("id", row.id)
      .eq("org_id", input.orgId);
    return { ok: false as const, error: reason };
  }
}

export async function sendAiWhatsAppMessage(input: {
  orgId: string;
  conversationId: string;
  candidateWaId: string;
  text: string;
}) {
  const admin = createAdminClient();
  const { data: row, error: insertError } = await admin
    .from("messages")
    .insert({
      org_id: input.orgId,
      conversation_id: input.conversationId,
      from_role: "schela",
      sender_kind: "ai",
      sender_name: "Schela",
      text: input.text,
      channel: "wa",
      delivered: false,
      delivery_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !row) throw new Error(insertError?.message ?? "Could not save AI WhatsApp reply");

  try {
    const result = await sendWhatsAppText({ to: input.candidateWaId, text: input.text });
    await Promise.all([
      admin
        .from("messages")
        .update({ whatsapp_message_id: result.messageId, delivery_status: "accepted", delivery_error: null })
        .eq("id", row.id)
        .eq("org_id", input.orgId),
      admin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .eq("org_id", input.orgId),
    ]);
    return { messageRowId: row.id as number, providerMessageId: result.messageId };
  } catch (error) {
    const reason = errorText(error);
    await admin
      .from("messages")
      .update({ delivery_status: "failed", delivery_error: reason, delivered: false })
      .eq("id", row.id)
      .eq("org_id", input.orgId);
    throw new Error(reason);
  }
}

/** Persist all provider-bound templates into the existing unified Schela thread. */
async function sendApprovedTemplateToConversation(input: {
  orgId: string;
  conversationId: string;
  templateName: "availability_request" | "scheduling_reminder" | "interview_scheduled";
  templateVariables: Record<string, string>;
  /** Shown to recruiters, not substituted into the approved Meta body. */
  link: string;
  send: () => Promise<{ messageId: string }>;
}) {
  const admin = createAdminClient();
  const preview = `${schelaTemplateText(input.templateName, input.templateVariables)}\n${input.link}`;
  const { data: row, error: insertError } = await admin.from("messages").insert({
    org_id: input.orgId,
    conversation_id: input.conversationId,
    from_role: "schela",
    sender_kind: "ai",
    sender_name: "Schela",
    text: preview,
    channel: "wa",
    delivery_status: "pending",
    delivered: false,
  }).select("id").single();
  if (insertError || !row) throw new Error(insertError?.message || "Could not save WhatsApp template message");
  try {
    const result = await input.send();
    const updatedAt = new Date().toISOString();
    const [{ error: messageError }, { error: conversationError }] = await Promise.all([
      admin.from("messages").update({
        whatsapp_message_id: result.messageId, delivery_status: "accepted", delivery_error: null,
      }).eq("id", row.id).eq("org_id", input.orgId),
      admin.from("conversations").update({ updated_at: updatedAt }).eq("id", input.conversationId).eq("org_id", input.orgId),
    ]);
    if (messageError || conversationError) throw new Error(messageError?.message || conversationError?.message);
    return { messageRowId: row.id as number, providerMessageId: result.messageId };
  } catch (error) {
    await admin.from("messages").update({
      delivery_status: "failed", delivery_error: errorText(error), delivered: false,
    }).eq("id", row.id).eq("org_id", input.orgId);
    throw error;
  }
}

export async function sendAvailabilityRequestTemplate(input: {
  orgId: string; conversationId: string; candidateWaId: string;
  candidateName: string; companyName: string; roleTitle: string;
  bookingUrl: string; bookingRouteToken: string;
}) {
  return sendApprovedTemplateToConversation({
    orgId: input.orgId, conversationId: input.conversationId,
    templateName: "availability_request",
    templateVariables: {
      candidate_name: input.candidateName, job_title: input.roleTitle, company_name: input.companyName,
    },
    link: input.bookingUrl,
    send: () => sendWhatsAppAvailabilityTemplate({
      to: input.candidateWaId, candidateName: input.candidateName,
      roleTitle: input.roleTitle, companyName: input.companyName,
      bookingRouteToken: input.bookingRouteToken,
    }),
  });
}

export async function sendSchedulingReminderTemplate(input: {
  orgId: string; conversationId: string; candidateWaId: string;
  candidateName: string; roleTitle: string; bookingUrl: string; bookingRouteToken: string;
}) {
  return sendApprovedTemplateToConversation({
    orgId: input.orgId, conversationId: input.conversationId,
    templateName: "scheduling_reminder",
    templateVariables: { candidate_name: input.candidateName, job_title: input.roleTitle },
    link: input.bookingUrl,
    send: () => sendWhatsAppSchedulingReminderTemplate({
      to: input.candidateWaId, candidateName: input.candidateName,
      roleTitle: input.roleTitle, bookingRouteToken: input.bookingRouteToken,
    }),
  });
}

export async function sendInterviewScheduledTemplate(input: {
  orgId: string; conversationId: string; candidateWaId: string;
  candidateName: string; roleTitle: string; companyName: string;
  interviewDate: string; interviewTime: string; joinRouteToken: string;
  meetingUrl: string;
}) {
  return sendApprovedTemplateToConversation({
    orgId: input.orgId, conversationId: input.conversationId,
    templateName: "interview_scheduled",
    templateVariables: {
      candidate_name: input.candidateName, job_title: input.roleTitle,
      company_name: input.companyName, interview_date: input.interviewDate,
      interview_time: input.interviewTime,
    },
    link: input.meetingUrl,
    send: () => sendWhatsAppInterviewScheduledTemplate({
      to: input.candidateWaId, candidateName: input.candidateName,
      roleTitle: input.roleTitle, companyName: input.companyName,
      interviewDate: input.interviewDate, interviewTime: input.interviewTime,
      joinRouteToken: input.joinRouteToken,
    }),
  });
}
