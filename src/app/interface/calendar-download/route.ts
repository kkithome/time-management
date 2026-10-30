import { NextResponse } from "next/server";
import {
  markCalendarDownloaded,
  ParticipantNotFoundError,
  CalendarNotApplicableError,
} from "@/lib/response-csv";

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  let participantNumber: unknown;
  try {
    const body = await request.json();
    participantNumber = body?.participantNumber;
  } catch {
    return fail("Request body must be valid JSON.", 400);
  }

  if (typeof participantNumber !== "string" || !participantNumber.trim()) {
    return fail("A valid participant number is required.", 400);
  }

  try {
    await markCalendarDownloaded(participantNumber.trim());
  } catch (error) {
    if (error instanceof ParticipantNotFoundError)
      return fail(error.message, 404);
    if (error instanceof CalendarNotApplicableError)
      return fail(error.message, 409);
    console.error("Failed to record calendar download:", error);
    return fail("Could not record the calendar download.", 500);
  }

  return NextResponse.json({ ok: true });
}
