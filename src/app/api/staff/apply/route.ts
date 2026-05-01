import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ApplyPayload = {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;

  // role field from UI (we’ll map into request_role)
  request_role?: string;
  role?: string;

  why_joining?: string;
  experience?: string;
  values_alignment?: string;

  // if your UI uses camelCase, we’ll accept that too
  firstName?: string;
  lastName?: string;
  requestRole?: string;
  whyJoining?: string;
  valuesAlignment?: string;

  relevant_experience?: string;
  relevantExperience?: string;
};

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ApplyPayload;

    const email = (body.email || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const payload = {
  email,
  first_name: body.first_name ?? body.firstName ?? null,
  last_name: body.last_name ?? body.lastName ?? null,
  phone: body.phone ?? null,

  request_role: body.request_role ?? body.requestRole ?? body.role ?? "staff",

  why_joining: body.why_joining ?? body.whyJoining ?? null,
  experience: body.experience ?? body.relevant_experience ?? body.relevantExperience ?? null,

  values_alignment: body.values_alignment ?? body.valuesAlignment ?? null,

  status: "submitted",
};


    const db = svc();

    const { data, error } = await db
      .from("staff_applications")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, application: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
