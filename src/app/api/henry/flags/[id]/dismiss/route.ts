import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabaseService";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServiceClient();

    const { error } = await supabase
      .from("henry_chat_flags")
      .update({
        review_status: "dismissed",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("dismiss flag error:", error);
      return NextResponse.redirect(new URL(`/henry/flags/${id}`, _req.url));
    }

    return NextResponse.redirect(new URL(`/henry/flags/${id}`, _req.url));
  } catch (error) {
    console.error("dismiss route error:", error);
    return NextResponse.json({ error: "Failed to dismiss flag" }, { status: 500 });
  }
}