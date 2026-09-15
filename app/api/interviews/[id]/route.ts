import { NextRequest, NextResponse } from "next/server";
import { listInterviews, updateInterview, deleteInterview, notifyCancellation } from "@/lib/store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const interviews = await listInterviews();
    const interview = interviews.find((i) => i.id === Number(id));
    if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ interview });
  } catch (err) {
    console.error("[api/interviews/:id GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const patch = await req.json();
    const interview = await updateInterview(Number(id), patch);
    if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ interview });
  } catch (err) {
    console.error("[api/interviews/:id PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason : "";

    // Notify before deleting — once the row's gone there's nothing left to
    // notify about. If the send fails, cancellation still proceeds (the
    // interview genuinely is cancelled either way), but the failure is
    // reported back so the UI doesn't falsely claim the candidate was told.
    const notifyResult = await notifyCancellation(Number(id), reason);

    const ok = await deleteInterview(Number(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true, notified: notifyResult.notified, notifyError: notifyResult.error });
  } catch (err) {
    console.error("[api/interviews/:id DELETE]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
