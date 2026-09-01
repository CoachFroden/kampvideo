import { authError, requireUser } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request, false);
    return Response.json({ approved: user.approved === true, role: user.role ?? "viewer" });
  } catch (error) { return authError(error); }
}
