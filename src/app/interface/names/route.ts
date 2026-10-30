import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import {
  saveNames,
  TOKEN_PATTERN,
  type NameEntry,
} from "@/lib/participant-names";

// Uses the filesystem, so this must run on the Node.js runtime.
export const runtime = "nodejs";

const MAX_ENTRIES = 50000;
const MAX_NAME_LENGTH = 100;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

// Saves first names for the links the Processor just generated. Admin only.
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return fail("Unauthorized", 401);

  let list: unknown;
  try {
    list = (await request.json())?.names;
  } catch {
    return fail("Request body must be valid JSON.", 400);
  }

  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ENTRIES) {
    return fail("A non-empty list of names is required.", 400);
  }

  const entries: NameEntry[] = [];
  for (const item of list) {
    const token = typeof item?.token === "string" ? item.token : "";
    const firstName =
      typeof item?.firstName === "string" ? item.firstName.trim() : "";

    if (!TOKEN_PATTERN.test(token) || firstName.length > MAX_NAME_LENGTH) {
      return fail(
        "Each entry needs a valid token and a first name of 100 characters or fewer.",
        400,
      );
    }
    entries.push({ token, firstName });
  }

  try {
    await saveNames(entries);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save names:", error);
    return fail("Could not save names.", 500);
  }
}
