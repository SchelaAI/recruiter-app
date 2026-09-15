import { NextRequest, NextResponse } from "next/server";
import { getDashboardSummary } from "@/lib/store";
import { getGroqClient, MODEL } from "@/lib/ai/groq";

/**
 * Real Ask Schela backend — takes a free-text question, builds a context
 * summary from the org's actual real data, and asks Groq to answer it.
 * Replaces what used to be two hardcoded question→answer pairs.
 */
export async function POST(req: NextRequest) {
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  try {
    const summary = await getDashboardSummary();

    const contextLines = [
      `Action items needing attention: ${summary.actionItems.length}`,
      ...summary.actionItems.slice(0, 8).map((a) => `- [${a.category}] ${a.candName}: ${a.summary}`),
      `Today's interviews: ${summary.todayInterviews.length}`,
      ...summary.todayInterviews.map((iv) => `- ${iv.time} ${iv.cand} (${iv.jobPosition || "no role set"}) — ${iv.aiState}`),
      `Active conversations: ${summary.activeConversations.length}`,
      ...summary.activeConversations.map((c) => `- ${c.candName}: "${c.lastMessage}"`),
      `This week: ${summary.performance.interviewsScheduled} interviews scheduled, ${summary.performance.aiConfirmedPct}% AI-confirmed.`,
    ];

    const completion = await getGroqClient().chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are Schela, an AI recruiting coordinator's in-app assistant. Answer the recruiter's question using ONLY the real data below — never invent candidate names, numbers, or events that aren't listed. If the data doesn't contain what's being asked, say so plainly rather than guessing. Keep answers to 2-3 sentences, direct and useful, no filler.\n\nCurrent data:\n${contextLines.join("\n")}`,
        },
        { role: "user", content: question },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const answer = completion.choices[0]?.message?.content ?? "I couldn't generate a response — try rephrasing.";
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[api/ask]", err);
    return NextResponse.json({ error: "Something went wrong reaching the AI model." }, { status: 500 });
  }
}
