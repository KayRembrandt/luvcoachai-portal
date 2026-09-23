import { NextRequest } from "next/server";
import { 
  accessOverview, 
  createStaff, jsonResponse, 
  readEditorBody, 
  requireStaffAdmin, 
  setStaffStatus, 
  staffFailure, 
  updateStaff, } from "@/lib/staffAccessAdmin";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
    try {
        return jsonResponse(await accessOverview(await requireStaffAdmin(req)));
    }
    catch (error) {
        return staffFailure(error);
    }
}
export async function POST(req: NextRequest) {
    try {
        const admin = await requireStaffAdmin(req);
        const body = await readEditorBody(req);
        return body.id
            ? jsonResponse({ staff: await updateStaff(admin, body) })
            : jsonResponse(await createStaff(admin, body, req.nextUrl.origin), 201);
    }
    catch (error) {
        return staffFailure(error);
    }
}
export async function PATCH(req: NextRequest) {
    try {
        const admin = await requireStaffAdmin(req);
        const body = await readEditorBody(req);
        return jsonResponse({ staff: await setStaffStatus(admin, body) });
    }
    catch (error) {
        return staffFailure(error);
    }
}

