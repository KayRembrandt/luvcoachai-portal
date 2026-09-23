import { NextRequest } from "next/server";
import { jsonResponse, listStaff, requireStaffAdmin, staffFailure } from "@/lib/staffAccessAdmin";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
    try {
        const admin = await requireStaffAdmin(req);
        const result = await listStaff(admin);
        return jsonResponse({ ...result, meRole: admin.staff.role, meId: admin.staff.id });
    }
    catch (error) {
        return staffFailure(error);
    }
}

