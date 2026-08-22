import { NextRequest, NextResponse } from "next/server";
import { sendAttachment } from "@/lib/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const form = await req.formData();
    const file = form.get("file");
    const caption = (form.get("caption") as string | null) ?? undefined;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const result = await sendAttachment(
      id,
      bytes,
      file.name || "file",
      file.type || "application/octet-stream",
      caption
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[api/conversations/:id/attachments POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
