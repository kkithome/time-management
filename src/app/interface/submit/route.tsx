import { NextResponse } from "next/server";
import {
  saveResponse,
  DuplicantParticipantError,
  type AnonymousResponse,
} from "@/lib/response-csv";


const CONDITION_NUMBERS = ["1", "2", "3", "4"] as const;
const MAX_TEXT_LENGTH = 350;

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value))
    return String(value).trim();
  return undefined;
}

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > MAX_TEXT_LENGTH) return null;
  return trimmed === "" ? undefined : trimmed;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return fail("Request body must be a JSON object");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("Request body must be a valid JSON");
  }

  const participantNumber = toTrimmedString(body.participantNumber);
  if (!participantNumber || participantNumber.length > MAX_TEXT_LENGTH) {
    return fail("A valid participant number");
  }

  const conditionNumber = toTrimmedString(body.conditionNumber);
 
  const validConditionNumber =
    conditionNumber as AnonymousResponse["conditionNumber"];

  const attendance = body.attendance;
  if (attendance !== "yes" && attendance !== "no") {
    return fail('Attendance must be "yes" or "no". ');
  }

  const origin = optionalText(body.origin);
  if (origin === null) {
    return fail("Origin must be text of 350 characters or less");
  }

  const departureTime = optionalText(body.departureTime);
  if (departureTime === null) {
    return fail("Departure time must be text of 350 characters or less");
  }

  const expectedCondition: AnonymousResponse["condition"] =
    validConditionNumber === "1" || validConditionNumber === "2"
      ? "control"
      : "treatment";

  const contact: AnonymousResponse["contact"] =
    validConditionNumber === "1" || validConditionNumber === "3"
      ? "preferred"
      : "non-preferred";

  if (body.condition !== undefined && body.condition !== expectedCondition) {
    return fail("Condition does not match the condition number");
  }

  if (body.contact !== undefined && body.contact !== contact) {
    return fail("Preference does not match the condition number");
  }

  try {
    await saveResponse({
      participantNumber,
      conditionNumber: validConditionNumber,
      condition: expectedCondition,
      contact,
      attendance,
      origin,
      departureTime,
      calendarDownloaded: expectedCondition === 'treatment' && attendance === 'yes' ? 'no' : undefined,
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof DuplicantParticipantError) {
      return fail(error.message, 409);
    }
    console.error("Failed to save response:", error);
    return fail("Could not save your response. Please try again.", 500);
  }
  return NextResponse.json({ ok: true });
}
