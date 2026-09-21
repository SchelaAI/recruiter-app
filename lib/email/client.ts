import "server-only";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailConfig } from "./config";
import { ensureEmailRoute } from "./routing";
import { renderOutboundEmailHtml, renderOutboundEmailText } from "./content";

async function threadHeaders(conversationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("messages")
    .select("email_message_id,created_at")
    .eq("conversation_id", conversationId)
    .eq("channel", "em")
    .not("email_message_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(30);

  const ids = (data ?? []).map((row) => row.email_message_id).filter(Boolean) as string[];
  if (!ids.length) return undefined;

  return {
    "In-Reply-To": ids[ids.length - 1],
    References: ids.join(" "),
  };
}

async function maybeFetchMessageId(resend: Resend, providerId: string) {
  try {
    const { data } = await resend.emails.get(providerId);
    const messageId = (data as (typeof data & { message_id?: string }) | null)?.message_id;
    return messageId || null;
  } catch {
    return null;
  }
}

export async function sendCandidateEmail(input: {
  orgId: string;
  candidateId: string;
  candidateEmail: string;
  conversationId: string;
  interviewId: number;
  subject: string;
  text: string;
  senderKind?: "ai" | "human";
  senderName?: string;
  thread?: boolean;
}) {
  const admin = createAdminClient();
  const config = getEmailConfig();
  const resend = new Resend(config.apiKey);
  const route = await ensureEmailRoute({
    orgId: input.orgId,
    candidateId: input.candidateId,
    conversationId: input.conversationId,
    interviewId: input.interviewId,
  });

  const headers = input.thread === false ? undefined : await threadHeaders(input.conversationId);

  const { data: row, error: insertError } = await admin
    .from("messages")
    .insert({
      org_id: input.orgId,
      conversation_id: input.conversationId,
      from_role: "schela",
      sender_kind: input.senderKind ?? "ai",
      sender_name: input.senderName ?? "Schela",
      text: input.text,
      channel: "em",
      email_subject: input.subject,
      delivered: false,
      delivery_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !row) {
    throw new Error(insertError?.message ?? "Could not save outbound email");
  }

  const { data, error } = await resend.emails.send(
    {
      from: config.fromAddress,
      to: [input.candidateEmail],
      replyTo: route.inbound_address,
      subject: input.subject,
      text: renderOutboundEmailText(input.text),
      html: renderOutboundEmailHtml(input.text),
      headers,
    },
    { idempotencyKey: `schela-message/${row.id}` },
  );

  if (error || !data?.id) {
    const reason = error ? JSON.stringify(error).slice(0, 1500) : "Resend returned no email id";
    await admin
      .from("messages")
      .update({ delivery_status: "failed", delivery_error: reason, delivered: false })
      .eq("id", row.id)
      .eq("org_id", input.orgId);
    throw new Error(`Email send failed: ${reason}`);
  }

  const messageId = await maybeFetchMessageId(resend, data.id);
  await Promise.all([
    admin
      .from("messages")
      .update({
        resend_email_id: data.id,
        email_message_id: messageId,
        delivery_status: "accepted",
        delivery_error: null,
      })
      .eq("id", row.id)
      .eq("org_id", input.orgId),
    admin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", input.conversationId)
      .eq("org_id", input.orgId),
  ]);

  return { messageRowId: row.id as number, resendEmailId: data.id, messageId };
}
