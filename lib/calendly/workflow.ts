import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendCandidateEmail } from "@/lib/email/client";
import {
  sendAiWhatsAppMessage, sendInterviewScheduledTemplate, sendSchedulingReminderTemplate,
} from "@/lib/whatsapp/outreach";
import { createInterviewSchedulingLink, getCalendlyScheduledEvent } from "./client";

function isWithinWhatsAppWindow(lastCandidateReplyAt?: string | null) {
  if (!lastCandidateReplyAt) return false;
  return Date.now() - new Date(lastCandidateReplyAt).getTime() < 24 * 60 * 60 * 1000;
}

function meetingUrlFromLocation(location?: { join_url?: string; location?: string; type?: string } | null) {
  if (location?.join_url?.startsWith("http")) return location.join_url;
  if (location?.location?.startsWith("http")) return location.location;
  return null;
}

function candidateDateTime(value: string, timezone?: string | null) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone || "UTC",
    }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

async function sendSchedulingMessage(input: {
  orgId: string;
  interviewId: number;
  conversationId: string;
  candidateId: string;
  candidateEmail: string;
  candidateWaId?: string | null;
  lastCandidateReplyAt?: string | null;
  primaryChannel: "wa" | "em";
  companyName: string;
  roleTitle: string;
  text: string;
  subject: string;
}) {
  if (input.primaryChannel === "wa" && input.candidateWaId && isWithinWhatsAppWindow(input.lastCandidateReplyAt)) {
    return sendAiWhatsAppMessage({
      orgId: input.orgId,
      conversationId: input.conversationId,
      candidateWaId: input.candidateWaId,
      text: input.text,
    });
  }

  return sendCandidateEmail({
    orgId: input.orgId,
    candidateId: input.candidateId,
    candidateEmail: input.candidateEmail,
    conversationId: input.conversationId,
    interviewId: input.interviewId,
    subject: input.subject,
    text: input.text,
    thread: true,
  });
}

export async function handleCalendlyInviteeCreated(input: {
  routeToken?: string | null;
  inviteeUri?: string | null;
  oldInviteeUri?: string | null;
  eventUri?: string | null;
  inviteeEmail?: string | null;
  cancelUrl?: string | null;
  rescheduleUrl?: string | null;
  rescheduled?: boolean;
}) {
  const admin = createAdminClient();
  let route: {
    org_id: string;
    interview_id: number;
    candidate_id: string;
    conversation_id: string;
    route_token?: string;
    event_type_uri?: string;
  } | null = null;

  if (input.routeToken) {
    const { data } = await admin
      .from("calendly_booking_routes")
      .select("route_token,org_id,interview_id,candidate_id,conversation_id,event_type_uri")
      .eq("route_token", input.routeToken)
      .maybeSingle();
    route = data;
  }

  if (!route && input.inviteeUri) {
    const { data: interview } = await admin
      .from("interviews")
      .select("id,org_id,candidate_id")
      .eq("calendly_invitee_uri", input.inviteeUri)
      .maybeSingle();
    if (interview) {
      const { data: conversation } = await admin
        .from("conversations")
        .select("id")
        .eq("org_id", interview.org_id)
        .eq("interview_id", interview.id)
        .maybeSingle();
      if (conversation) route = { org_id: interview.org_id, interview_id: interview.id, candidate_id: interview.candidate_id, conversation_id: conversation.id };
    }
  }

  if (!route && input.oldInviteeUri) {
    const { data: interview } = await admin
      .from("interviews")
      .select("id,org_id,candidate_id")
      .eq("calendly_invitee_uri", input.oldInviteeUri)
      .maybeSingle();
    if (interview) {
      const { data: conversation } = await admin
        .from("conversations")
        .select("id")
        .eq("org_id", interview.org_id)
        .eq("interview_id", interview.id)
        .maybeSingle();
      if (conversation) route = { org_id: interview.org_id, interview_id: interview.id, candidate_id: interview.candidate_id, conversation_id: conversation.id };
    }
  }

  if (!route) throw new Error("Calendly booking could not be matched to a Schela interview");
  if (!input.eventUri) throw new Error("Calendly booking webhook is missing event URI");

  const [{ data: candidate }, { data: interview }, { data: conversation }, { data: organization }, event] = await Promise.all([
    admin.from("candidates").select("id,name,email,phone_e164,time_zone").eq("id", route.candidate_id).eq("org_id", route.org_id).single(),
    admin.from("interviews").select("id,role_title,channel,last_candidate_reply_at").eq("id", route.interview_id).eq("org_id", route.org_id).single(),
    admin.from("conversations").select("id,primary_channel").eq("id", route.conversation_id).eq("org_id", route.org_id).single(),
    admin.from("organizations").select("name").eq("id", route.org_id).single(),
    getCalendlyScheduledEvent(route.org_id, input.eventUri),
  ]);

  if (!candidate || !interview || !conversation || !organization) throw new Error("Calendly booking context is incomplete");
  if (input.inviteeEmail && input.inviteeEmail.toLowerCase() !== candidate.email.toLowerCase()) {
    throw new Error("Calendly invitee email does not match the Schela candidate");
  }

  if (route.event_type_uri && event.resource.event_type && route.event_type_uri !== event.resource.event_type) {
    throw new Error("Calendly event type does not match the Schela booking route");
  }

  const startTime = event.resource.start_time;
  const meetingLink = meetingUrlFromLocation(event.resource.location);
  const bookedAt = new Date().toISOString();

  const [interviewWrite, candidateWrite, conversationWrite, routeWrite, messageWrite, notificationWrite] = await Promise.all([
    admin.from("interviews").update({
      scheduled_at: startTime,
      calendly_event_uri: input.eventUri,
      calendly_invitee_uri: input.inviteeUri ?? null,
      calendly_cancel_url: input.cancelUrl ?? null,
      calendly_reschedule_url: input.rescheduleUrl ?? null,
      meeting_link: meetingLink,
      ai_state: "calendar_updated",
      updated_at: bookedAt,
    }).eq("id", route.interview_id).eq("org_id", route.org_id),
    admin.from("candidates").update({ ai_state: "calendar_updated", updated_at: bookedAt }).eq("id", route.candidate_id).eq("org_id", route.org_id),
    admin.from("conversations").update({ escalated: false, escalation_reason: null, updated_at: bookedAt }).eq("id", route.conversation_id).eq("org_id", route.org_id),
    (input.routeToken || route.route_token)
      ? admin.from("calendly_booking_routes").update({ used_at: bookedAt })
          .eq("route_token", input.routeToken || route.route_token)
          .eq("org_id", route.org_id)
      : Promise.resolve({ error: null }),
    admin.from("messages").insert({
      org_id: route.org_id,
      conversation_id: route.conversation_id,
      from_role: "system",
      sender_kind: "system",
      sender_name: "Calendly",
      text: `Interview booked for ${candidateDateTime(startTime, candidate.time_zone)}${meetingLink ? ` · ${meetingLink}` : ""}`,
      channel: null,
      delivered: true,
      delivery_status: "delivered",
    }),
    admin.from("notifications").insert({
      org_id: route.org_id,
      type: "calendar_updated",
      title: input.rescheduled ? "Interview rescheduled" : "Interview booked",
      description: `${candidate.name} · ${candidateDateTime(startTime, candidate.time_zone)}`,
      link_candidate_id: route.candidate_id,
      link_conversation_id: route.conversation_id,
      link_interview_id: route.interview_id,
    }),
  ]);

  const writeErrors = [
    interviewWrite.error,
    candidateWrite.error,
    conversationWrite.error,
    routeWrite.error,
    messageWrite.error,
    notificationWrite.error,
  ].filter(Boolean);
  if (writeErrors.length) {
    throw new Error(`Could not persist Calendly booking: ${writeErrors.map((error) => error?.message).join(" | ")}`);
  }

  const confirmation = `You're all set — your ${interview.role_title || "interview"} interview is booked for ${candidateDateTime(startTime, candidate.time_zone)}.${meetingLink ? ` Meeting link: ${meetingLink}` : ""} I'll send reminders before the interview.`;
  // Send the approved five-variable WhatsApp confirmation when an actual
  // HTTPS meeting link exists. The CTA uses /join/{{1}} with the opaque route token.
  const isWhatsApp = (conversation.primary_channel || interview.channel) === "wa";
  let joinRouteToken = input.routeToken || route.route_token || null;
  if (!joinRouteToken && meetingLink) {
    const { data: latestRoute } = await admin.from("calendly_booking_routes")
      .select("route_token").eq("org_id", route.org_id)
      .eq("interview_id", route.interview_id)
      .not("used_at", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    joinRouteToken = latestRoute?.route_token || null;
  }
  if (isWhatsApp && candidate.phone_e164 && meetingLink?.startsWith("https://") &&
      joinRouteToken) {
    const timeZone = candidate.time_zone || "UTC";
    let interviewDate: string;
    let interviewTime: string;
    try {
      interviewDate = new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium", timeZone,
      }).format(new Date(startTime));
      interviewTime = new Intl.DateTimeFormat("en-US", {
        hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short",
      }).format(new Date(startTime));
    } catch {
      interviewDate = new Date(startTime).toISOString().slice(0, 10);
      interviewTime = new Date(startTime).toISOString().slice(11, 16) + " UTC";
    }
    await sendInterviewScheduledTemplate({
      orgId: route.org_id, conversationId: route.conversation_id,
      candidateWaId: candidate.phone_e164, candidateName: candidate.name,
      companyName: organization.name, roleTitle: interview.role_title || "Interview",
      interviewDate, interviewTime, joinRouteToken, meetingUrl: meetingLink,
    });
  } else await sendSchedulingMessage({
    orgId: route.org_id,
    interviewId: route.interview_id,
    conversationId: route.conversation_id,
    candidateId: route.candidate_id,
    candidateEmail: candidate.email,
    candidateWaId: candidate.phone_e164,
    lastCandidateReplyAt: interview.last_candidate_reply_at,
    primaryChannel: (conversation.primary_channel || interview.channel || "em") as "wa" | "em",
    companyName: organization.name,
    roleTitle: interview.role_title || "Interview",
    text: confirmation,
    subject: `Interview confirmed: ${interview.role_title || "Interview"} at ${organization.name}`,
  });

  return { orgId: route.org_id, interviewId: route.interview_id };
}

export async function handleCalendlyInviteeCanceled(input: {
  routeToken?: string | null;
  inviteeUri?: string | null;
  oldInviteeUri?: string | null;
  eventUri?: string | null;
  inviteeEmail?: string | null;
  rescheduled?: boolean;
  cancellationReason?: string | null;
}) {
  const admin = createAdminClient();
  let interviewQuery = null as null | { id: number; org_id: string; candidate_id: string; role_title: string | null; channel: "wa" | "em"; last_candidate_reply_at: string | null; ai_state: string };
  let conversationId: string | null = null;

  if (input.routeToken) {
    const { data: route } = await admin.from("calendly_booking_routes").select("org_id,interview_id,conversation_id").eq("route_token", input.routeToken).maybeSingle();
    if (route) {
      const { data } = await admin.from("interviews").select("id,org_id,candidate_id,role_title,channel,last_candidate_reply_at,ai_state").eq("id", route.interview_id).eq("org_id", route.org_id).maybeSingle();
      interviewQuery = data as typeof interviewQuery;
      conversationId = route.conversation_id;
    }
  }

  if (!interviewQuery && input.inviteeUri) {
    const { data } = await admin.from("interviews").select("id,org_id,candidate_id,role_title,channel,last_candidate_reply_at,ai_state").eq("calendly_invitee_uri", input.inviteeUri).maybeSingle();
    interviewQuery = data as typeof interviewQuery;
  }
  if (!interviewQuery && input.oldInviteeUri) {
    const { data } = await admin.from("interviews").select("id,org_id,candidate_id,role_title,channel,last_candidate_reply_at,ai_state").eq("calendly_invitee_uri", input.oldInviteeUri).maybeSingle();
    interviewQuery = data as typeof interviewQuery;
  }
  if (!interviewQuery && input.eventUri) {
    const { data } = await admin.from("interviews").select("id,org_id,candidate_id,role_title,channel,last_candidate_reply_at,ai_state").eq("calendly_event_uri", input.eventUri).maybeSingle();
    interviewQuery = data as typeof interviewQuery;
  }
  if (!interviewQuery) throw new Error("Calendly cancellation could not be matched to a Schela interview");

  if (!conversationId) {
    const { data } = await admin.from("conversations").select("id").eq("org_id", interviewQuery.org_id).eq("interview_id", interviewQuery.id).maybeSingle();
    conversationId = data?.id ?? null;
  }
  if (!conversationId) throw new Error("Calendly cancellation has no Schela conversation");

  const [{ data: candidate }, { data: conversation }, { data: organization }] = await Promise.all([
    admin.from("candidates").select("id,name,email,phone_e164").eq("id", interviewQuery.candidate_id).eq("org_id", interviewQuery.org_id).single(),
    admin.from("conversations").select("primary_channel").eq("id", conversationId).eq("org_id", interviewQuery.org_id).single(),
    admin.from("organizations").select("name").eq("id", interviewQuery.org_id).single(),
  ]);
  if (!candidate || !conversation || !organization) throw new Error("Cancellation context is incomplete");
  if (input.inviteeEmail && input.inviteeEmail.toLowerCase() !== candidate.email.toLowerCase()) throw new Error("Calendly cancellation email mismatch");

  const now = new Date().toISOString();
  const workflowClosed = interviewQuery.ai_state === "completed";
  const interviewUpdate = input.rescheduled && !workflowClosed
    ? {
        ai_state: "rescheduling",
        reminder_24h_sent_at: null,
        reminder_1h_sent_at: null,
        updated_at: now,
      }
    : {
        scheduled_at: null,
        meeting_link: null,
        calendly_event_uri: null,
        calendly_invitee_uri: null,
        calendly_cancel_url: null,
        calendly_reschedule_url: null,
        ai_state: workflowClosed ? "completed" : "rescheduling",
        reminder_24h_sent_at: null,
        reminder_1h_sent_at: null,
        updated_at: now,
      };

  await Promise.all([
    admin.from("interviews").update(interviewUpdate).eq("id", interviewQuery.id).eq("org_id", interviewQuery.org_id),
    admin.from("candidates").update({ ai_state: workflowClosed ? "completed" : "rescheduling", updated_at: now }).eq("id", candidate.id).eq("org_id", interviewQuery.org_id),
    admin.from("messages").insert({
      org_id: interviewQuery.org_id,
      conversation_id: conversationId,
      from_role: "system",
      sender_kind: "system",
      sender_name: "Calendly",
      text: input.rescheduled ? "Calendly marked the previous booking as rescheduled." : `Calendly booking cancelled${input.cancellationReason ? `: ${input.cancellationReason}` : "."}`,
      channel: null,
      delivered: true,
      delivery_status: "delivered",
    }),
  ]);

  // Calendly emits canceled + created for a normal reschedule. The created
  // webhook will update Schela with the new slot, so do not send a second link.
  if (workflowClosed || input.rescheduled) return { orgId: interviewQuery.org_id, interviewId: interviewQuery.id };

  const link = await createInterviewSchedulingLink({
    orgId: interviewQuery.org_id,
    interviewId: interviewQuery.id,
    conversationId,
    candidateId: candidate.id,
    candidateName: candidate.name,
    candidateEmail: candidate.email,
  });
  const text = `No problem — your previous interview time was cancelled. You can choose a new time here: ${link.bookingUrl}`;
  await sendSchedulingMessage({
    orgId: interviewQuery.org_id,
    interviewId: interviewQuery.id,
    conversationId,
    candidateId: candidate.id,
    candidateEmail: candidate.email,
    candidateWaId: candidate.phone_e164,
    lastCandidateReplyAt: interviewQuery.last_candidate_reply_at,
    primaryChannel: (conversation.primary_channel || interviewQuery.channel || "em") as "wa" | "em",
    companyName: organization.name,
    roleTitle: interviewQuery.role_title || "Interview",
    text,
    subject: `Choose a new interview time: ${interviewQuery.role_title || "Interview"} at ${organization.name}`,
  });

  return { orgId: interviewQuery.org_id, interviewId: interviewQuery.id };
}

export async function sendDueInterviewReminder(input: { orgId: string; interviewId: number; kind: "24h" | "1h" }) {
  const admin = createAdminClient();
  const { data: interview } = await admin
    .from("interviews")
    .select("id,candidate_id,role_title,channel,scheduled_at,meeting_link,last_candidate_reply_at")
    .eq("id", input.interviewId)
    .eq("org_id", input.orgId)
    .single();
  if (!interview?.scheduled_at) throw new Error("Reminder interview is not scheduled");

  const [{ data: candidate }, { data: conversation }, { data: organization }] = await Promise.all([
    admin.from("candidates").select("id,name,email,phone_e164,time_zone").eq("id", interview.candidate_id).eq("org_id", input.orgId).single(),
    admin.from("conversations").select("id,primary_channel").eq("org_id", input.orgId).eq("interview_id", input.interviewId).single(),
    admin.from("organizations").select("name").eq("id", input.orgId).single(),
  ]);
  if (!candidate || !conversation || !organization) throw new Error("Reminder context is incomplete");

  const when = candidateDateTime(interview.scheduled_at, candidate.time_zone);
  const lead = input.kind === "24h" ? "A reminder for your upcoming interview" : "Your interview is coming up soon";
  const text = `${lead}: ${interview.role_title || "Interview"} at ${organization.name} — ${when}.${interview.meeting_link ? ` Meeting link: ${interview.meeting_link}` : ""}`;

  try {
    await sendSchedulingMessage({
      orgId: input.orgId,
      interviewId: input.interviewId,
      conversationId: conversation.id,
      candidateId: candidate.id,
      candidateEmail: candidate.email,
      candidateWaId: candidate.phone_e164,
      lastCandidateReplyAt: interview.last_candidate_reply_at,
      primaryChannel: (conversation.primary_channel || interview.channel || "em") as "wa" | "em",
      companyName: organization.name,
      roleTitle: interview.role_title || "Interview",
      text,
      subject: `Reminder: ${interview.role_title || "Interview"} at ${organization.name}`,
    });
    await admin.from("notifications").insert({
      org_id: input.orgId,
      type: "reminder_sent",
      title: input.kind === "24h" ? "24-hour reminder sent" : "1-hour reminder sent",
      description: `${candidate.name} · ${when}`,
      link_candidate_id: candidate.id,
      link_conversation_id: conversation.id,
      link_interview_id: input.interviewId,
    });
  } catch (error) {
    const field = input.kind === "24h" ? "reminder_24h_sent_at" : "reminder_1h_sent_at";
    await admin.from("interviews").update({ [field]: null }).eq("id", input.interviewId).eq("org_id", input.orgId);
    throw error;
  }
}

/** cron-job.org: follow up once on an unused Calendly link after >=24 hours. */
export async function sendDueSchedulingReminder(input: { orgId: string; interviewId: number }) {
  const admin = createAdminClient();
  const { data: interview } = await admin.from("interviews")
    .select("id,candidate_id,role_title,channel,scheduled_at,ai_state,last_candidate_reply_at")
    .eq("id", input.interviewId).eq("org_id", input.orgId).single();
  if (!interview || interview.scheduled_at || interview.ai_state === "completed") return { skipped: true };

  const [{ data: candidate }, { data: organization }, { data: conversation }, { data: route }] = await Promise.all([
    admin.from("candidates").select("id,name,email,phone_e164").eq("id", interview.candidate_id).eq("org_id", input.orgId).single(),
    admin.from("organizations").select("name").eq("id", input.orgId).single(),
    admin.from("conversations").select("id,primary_channel").eq("interview_id", input.interviewId).eq("org_id", input.orgId).single(),
    admin.from("calendly_booking_routes").select("route_token,booking_url,created_at")
      .eq("interview_id", input.interviewId).eq("org_id", input.orgId)
      .is("used_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!candidate || !organization || !conversation || !route?.booking_url) return { skipped: true };
  const url = `https://recruiter.schela.app/book/${route.route_token}`;
  if ((conversation.primary_channel || interview.channel) === "wa" && candidate.phone_e164) {
    await sendSchedulingReminderTemplate({
      orgId: input.orgId, conversationId: conversation.id, candidateWaId: candidate.phone_e164,
      candidateName: candidate.name, roleTitle: interview.role_title || "Interview",
      bookingUrl: url, bookingRouteToken: route.route_token,
    });
  } else {
    // Static button URLs cannot carry Schela's unique interview token. Until
    // the Meta button has been verified, email the real link instead.
    await sendCandidateEmail({
      orgId: input.orgId, candidateId: candidate.id, candidateEmail: candidate.email,
      conversationId: conversation.id, interviewId: input.interviewId, thread: true,
      subject: `Reminder: choose an interview time for ${interview.role_title || "Interview"}`,
      text: `Hi ${candidate.name}, we're still waiting for you to select an interview time for the ${interview.role_title || "Interview"} position at ${organization.name}. Please choose a convenient slot here: ${url}`,
    });
  }
  await admin.from("notifications").insert({
    org_id: input.orgId, type: "reminder_sent", title: "Scheduling reminder sent",
    description: `${candidate.name} · ${interview.role_title || "Interview"}`,
    link_candidate_id: candidate.id, link_conversation_id: conversation.id,
    link_interview_id: input.interviewId,
  });
  return { skipped: false };
}
