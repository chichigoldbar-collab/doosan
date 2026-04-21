import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabaseAdmin();

  const payload = {
    editable_title: body.editable_title ?? null,
    editable_body: body.editable_body ?? null,
    editable_tags: body.editable_tags ?? null,
    status: body.status ?? "needs_review",
    published_at: body.status === "published" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("posts")
    .update(payload)
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
