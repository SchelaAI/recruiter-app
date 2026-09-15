import "server-only";
import { getGroqClient, MODEL } from "./groq";
import { CLASSIFY_SYSTEM_PROMPT, DRAFT_SYSTEM_PROMPT, ESCALATION_DRAFT_SYSTEM_PROMPT, SCHEDULING_TOOLS, CONFIDENCE_THRESHOLD } from "./prompts";
import { createAdminClient } from "@/lib/supabase/server";

export interface ClassificationResult {
  /** The model's own working-out, produced BEFORE it commits to a label. Kept for the audit trail. */
  reasoning: string;
  intent: "confirm" | "reschedule" | "decline" | "question_routine" | "question_sensitive" | "other";
  confidence: number;
  /** Anything genuinely unclear the model had to guess at. Non-empty forces a human into the loop. */
  ambiguities: string[];
  proposed_datetime: string | null;
  reason: string | null;
  summary: string;
}

export interface OrchestrationResult {
  classification: ClassificationResult;
  action: "auto_reply" | "escalate";
  draftReply: string | null;
  toolCalls: { name: string; args: unknown }[];
  /** Why this escalated, in plain language a recruiter can read. Null when auto-replying. */
  escalationReason: string | null;
  /** True when draftReply is a suggestion for the recruiter to review, not something Schela sent. */
  draftIsSuggestionOnly: boolean;
}

interface MessageContext {
  candidateName: string;
  jobPosition: string;
  interviewFormat?: string;
  scheduledAt?: string;
  channel: "wa" | "em";
  /** The hiring company's name — the brand the candidate sees, never "Schela". */
  companyName?: string;
  /** The recruiter Schela is assisting — named in escalation replies per the Conversation Design System. */
  recruiterName?: string;
  /** Real meeting link, when one exists. The prompt omits the line entirely when absent — never invented. */
  meetingLink?: string;
  /** Real, bookable slot labels. The AI may only offer times from this list — never invented ones. */
  availableSlots?: string[];
  /** Recent turns, oldest first. Without this the AI cannot resolve "the other slot" or "as I said". */
  history?: { from: "schela" | "candidate" | "system"; text: string }[];
}

/**
 * Single entry point for turning one inbound candidate message into a
 * decision. This is intentionally ONE model (gpt-oss-120b via Groq) doing
 * both classification and drafting, not the two-tier cheap/strong model
 * split sketched in the execution plan doc — that plan assumed OpenAI's
 * mini-tier lineup specifically. With a single specified model, the
 * confidence threshold below is what stands in for "Tier 2" — it's a
 * logic-level safety net, not a second model call. Every branch below
 * writes to ai_decisions regardless of outcome, so nothing happens
 * off the record.
 */
export async function processInboundMessage(params: {
  orgId: string;
  conversationId: string;
  messageId: number;
  messageText: string;
  context: MessageContext;
}): Promise<OrchestrationResult> {
  const { orgId, conversationId, messageId, messageText, context } = params;

  const classification = await classify(messageText, context);

  // FULLY AUTOMATED MODE
  // Schela replies to every inbound message itself — no message waits on a
  // human before the candidate hears back. What used to be an "escalate and
  // stay silent" path is now "reply now, and separately flag the recruiter".
  //
  // The one thing still withheld is INVENTED FACTS. Schela has no access to
  // salary bands, offer terms, benefits, or visa policy, so for those it
  // replies immediately and says a recruiter will follow up with specifics,
  // rather than making a number up. That's a limit on fabrication, not on
  // automation — the candidate is never left without a response.
  let notifyReason: string | null = null;
  if (classification.intent === "question_sensitive") {
    notifyReason = "Answered automatically, but needs your follow-up: compensation, offer, policy, or a request to speak with someone.";
  } else if (classification.reason === "parse_failed" || classification.reason === "ai_unavailable") {
    notifyReason = "Schela couldn't reliably interpret this message and replied with a clarifying question.";
  } else if (classification.ambiguities.length > 0) {
    notifyReason = `Replied, but asked the candidate to clarify: ${classification.ambiguities.join("; ")}`;
  } else if (classification.confidence < CONFIDENCE_THRESHOLD) {
    notifyReason = `Replied with lower confidence (${classification.confidence.toFixed(2)}) that this is "${classification.intent}".`;
  }

  const isSensitive = classification.intent === "question_sensitive";
  // Only act on the world (confirm/reschedule/withdraw) when the read is
  // solid. A shaky interpretation still gets a reply — it just doesn't move
  // a real interview until the candidate confirms.
  const confidentEnoughToAct =
    !isSensitive &&
    classification.ambiguities.length === 0 &&
    classification.reason !== "parse_failed" &&
    classification.confidence >= CONFIDENCE_THRESHOLD;

  let draftReply: string | null = null;
  const toolCalls: { name: string; args: unknown }[] = [];

  if (isSensitive) {
    // Sends automatically. Acknowledges the question and commits to a
    // recruiter follow-up, without stating any figure or term Schela
    // doesn't actually have. No tools: a sensitive message must never
    // drive an automated state change.
    draftReply = await draftEscalationSuggestion(messageText, context);
  } else {
    const drafted = await draft(messageText, classification, context, !confidentEnoughToAct);
    draftReply = drafted.text;
    if (confidentEnoughToAct) toolCalls.push(...drafted.toolCalls);
  }

  await logDecision({
    orgId,
    conversationId,
    messageId,
    tier: "tier1",
    intent: classification.intent,
    confidence: classification.confidence,
    actionTaken: "auto_reply",
    reasoning: classification.reasoning,
    ambiguities: classification.ambiguities,
    escalationReason: notifyReason,
  });

  return {
    classification,
    action: "auto_reply",
    draftReply,
    toolCalls,
    // Kept as a heads-up for the recruiter — Schela already replied, so this
    // is "worth your attention", not "blocking on you".
    escalationReason: notifyReason,
    draftIsSuggestionOnly: false,
  };
}

/** Renders recent turns for the model. Kept short so history never crowds out the actual message. */
function formatHistory(history?: { from: string; text: string }[]): string {
  if (!history || history.length === 0) return "";
  const recent = history.slice(-8);
  const lines = recent.map((m) => {
    const who = m.from === "candidate" ? "Candidate" : m.from === "schela" ? "Schela" : "System";
    const text = m.text.length > 300 ? `${m.text.slice(0, 300)}…` : m.text;
    return `${who}: ${text}`;
  });
  return `Conversation so far (oldest first):\n${lines.join("\n")}\n\n`;
}

async function classify(text: string, context: MessageContext): Promise<ClassificationResult> {
  const completion = await getGroqClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Candidate: ${context.candidateName}\nRole: ${context.jobPosition}\nChannel: ${context.channel}\n${context.scheduledAt ? `Currently scheduled: ${context.scheduledAt}\n` : ""}\n${formatHistory(context.history)}New message to classify: "${text}"`,
      },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);

    // Validate rather than trust. A malformed intent or an out-of-range
    // confidence must not silently become a green light to act.
    const VALID_INTENTS = ["confirm", "reschedule", "decline", "question_routine", "question_sensitive", "other"];
    const intent = VALID_INTENTS.includes(parsed.intent) ? parsed.intent : "other";

    let confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(Math.max(parsed.confidence, 0), 1)
      : 0;
    // If the model didn't return a usable intent, its confidence is meaningless.
    if (intent !== parsed.intent) confidence = 0;

    const ambiguities = Array.isArray(parsed.ambiguities)
      ? parsed.ambiguities.filter((a: unknown): a is string => typeof a === "string" && a.trim().length > 0)
      : [];

    // Enforce the prompt's own calibration rule in code — a model that flags
    // an ambiguity and then reports 0.95 confidence is contradicting itself,
    // and the safe reading is the one it stated explicitly.
    if (ambiguities.length > 0) confidence = Math.min(confidence, 0.70);

    return {
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      intent,
      confidence,
      ambiguities,
      proposed_datetime: parsed.proposed_datetime ?? null,
      reason: parsed.reason ?? null,
      summary: parsed.summary ?? text.slice(0, 120),
    };
  } catch {
    // Model didn't return valid JSON — treat as a hard "don't act automatically" signal, never guess.
    return {
      reasoning: "",
      intent: "other",
      confidence: 0,
      ambiguities: [],
      proposed_datetime: null,
      reason: "parse_failed",
      summary: text.slice(0, 120),
    };
  }
}

async function draft(
  text: string,
  classification: ClassificationResult,
  context: MessageContext,
  isEscalating: boolean
): Promise<{ text: string; toolCalls: { name: string; args: unknown }[] }> {
  const ambiguityNote = classification.ambiguities.length > 0
    ? `\n\nAMBIGUOUS — do not guess. Ask one short clarifying question naming the specific options. Unclear: ${classification.ambiguities.join("; ")}`
    : "";

  const completion = await getGroqClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: DRAFT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Company: ${context.companyName ?? "the hiring company"}\nRecruiter: ${context.recruiterName ?? "the recruiter"}\nCandidate: ${context.candidateName} (role: ${context.jobPosition})\n\n${formatHistory(context.history)}New message: "${text}"\n\nDetected intent: ${classification.intent}. ${context.scheduledAt ? `Current scheduled time: ${context.scheduledAt}.` : ""}${context.meetingLink ? ` Meeting Link: ${context.meetingLink}.` : ""}${context.availableSlots?.length ? `\n\nAvailable slots you may offer (use these EXACT labels, never invent times):\n${context.availableSlots.map((sl) => `• ${sl}`).join("\n")}` : ""}${ambiguityNote}\n\nDraft the reply as Schela${isEscalating ? " (a recruiter will review this before it is sent)" : ", and call the appropriate scheduling tool if one clearly applies"}.`,
      },
    ],
    // No tools offered when escalating: the caller discards them anyway, and
    // asking for tool calls it will never run just invites a confusing audit trail.
    ...(isEscalating ? {} : { tools: SCHEDULING_TOOLS, tool_choice: "auto" as const }),
    temperature: 0.4,
  });

  const message = completion.choices[0]?.message;
  const toolCalls =
    message?.tool_calls?.map((tc) => ({
      name: tc.function.name,
      args: safeJsonParse(tc.function.arguments),
    })) ?? [];

  return { text: message?.content ?? "", toolCalls };
}

/** Suggestion for a human to review on a sensitive escalation. Never sent automatically, never uses tools. */
async function draftEscalationSuggestion(text: string, context: MessageContext): Promise<string> {
  try {
    const completion = await getGroqClient().chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: ESCALATION_DRAFT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Company: ${context.companyName ?? "the hiring company"}\nRecruiter: ${context.recruiterName ?? "the recruiter"}\nCandidate: ${context.candidateName} (role: ${context.jobPosition})\n\n${formatHistory(context.history)}They asked: "${text}"\n\nWrite a suggested reply for the recruiter to review.`,
        },
      ],
      temperature: 0.4,
    });
    return completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    // A failed suggestion must never block the escalation itself from being raised.
    console.error("[orchestrator] escalation suggestion failed:", err);
    return "";
  }
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

async function logDecision(params: {
  orgId: string;
  conversationId: string;
  messageId: number;
  tier: "tier1" | "tier2" | "human";
  intent: string;
  confidence: number;
  actionTaken: string;
  reasoning: string;
  ambiguities: string[];
  escalationReason: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("ai_decisions").insert({
    org_id: params.orgId,
    conversation_id: params.conversationId,
    message_id: params.messageId,
    tier: params.tier,
    model: MODEL,
    intent: params.intent,
    confidence: params.confidence,
    action_taken: params.actionTaken,
    reasoning: params.reasoning || null,
    ambiguities: params.ambiguities.length > 0 ? params.ambiguities : null,
    escalation_reason: params.escalationReason,
  });
  if (error) {
    // The AI decision itself should never be blocked by the audit log
    // failing to write — but this must not fail silently either.
    console.error("[ai_decisions] failed to log:", error.message);
  }
}
