import { NextRequest, NextResponse } from "next/server";
import { getOrganization, updateOrganization } from "@/lib/store";

export async function GET() {
  try {
    const organization = await getOrganization();
    return NextResponse.json({ organization });
  } catch (err) {
    console.error("[api/organization GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const patch: { name?: string; website?: string | null; poweredBySchela?: boolean; waTemplateName?: string | null; waTemplateLanguage?: string } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.website !== undefined) patch.website = body.website;
    if (typeof body.poweredBySchela === "boolean") patch.poweredBySchela = body.poweredBySchela;
    if (body.waTemplateName !== undefined) patch.waTemplateName = body.waTemplateName;
    if (typeof body.waTemplateLanguage === "string") patch.waTemplateLanguage = body.waTemplateLanguage;

    const organization = await updateOrganization(patch);
    return NextResponse.json({ organization });
  } catch (err) {
    console.error("[api/organization PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
