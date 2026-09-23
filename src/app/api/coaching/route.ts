import { NextRequest } from "next/server";
import { coachingGET, coachingPOST, failure } from "@/lib/coaching/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    return await coachingGET(req);
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    return await coachingPOST(req);
  } catch (e) {
    return failure(e);
  }
}
