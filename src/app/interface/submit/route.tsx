import { NextResponse } from "next/server";
import {
  saveResponse,
  DuplicantParticipantError,
  type AnonymousResponse,
} from "@/lib/response-csv";

const CONDITION_NUMBERS = ["1", "2", "3", "4"] as const;
const MAX_TEXT_LENGTH = 350;
const WORKSHOP_START_TIME = "19:00";

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim();

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).trim();
  }

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

  // Parse request body.
  try {
    const parsed = await request.json();

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return fail("Request body must be a JSON object.");
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return fail("Request body must be valid JSON.");
  }

  // Validate participant number.
  const participantNumber = toTrimmedString(body.participantNumber);

  if (!participantNumber || participantNumber.length > MAX_TEXT_LENGTH) {
    return fail("A valid participant number is required.");
  }

  // Validate condition number.
  const conditionNumber = toTrimmedString(body.conditionNumber);

  if (
    !conditionNumber ||
    !CONDITION_NUMBERS.includes(
      conditionNumber as (typeof CONDITION_NUMBERS)[number],
    )
  ) {
    return fail("A valid condition number is required.");
  }

  const validConditionNumber =
    conditionNumber as AnonymousResponse["conditionNumber"];

  // Determine assigned condition and contact preference.
  const expectedCondition: AnonymousResponse["condition"] =
    validConditionNumber === "1" || validConditionNumber === "2"
      ? "control"
      : "treatment";

  const contact: AnonymousResponse["contact"] =
    validConditionNumber === "1" || validConditionNumber === "3"
      ? "preferred"
      : "non-preferred";

  // Validate attendance.
  const attendance = body.attendance;

  if (attendance !== "yes" && attendance !== "no") {
    return fail('Attendance must be "yes" or "no".');
  }

  // Validate origin.
  const origin = optionalText(body.origin);

  if (origin === null) {
    return fail("Origin must be text of 350 characters or less.");
  }

  // Planning questions only apply to treatment participants attending.
  const requiresPlanQuestions =
    expectedCondition === "treatment" && attendance === "yes";

  const alreadyAtLocation = body.alreadyAtLocation;

  let departureTime: string | undefined;

  if (requiresPlanQuestions) {
    // Validate whether participant is already at the location.
    if (alreadyAtLocation !== "yes" && alreadyAtLocation !== "no") {
      return fail(
        "Please indicate whether you will already be at the workshop location.",
      );
    }

    if (alreadyAtLocation === "yes") {
      // Participants already at the location must submit N/A.
      if (body.departureTime !== "N/A") {
        return fail(
          'Departure time must be "N/A" if you will already be at the workshop location.',
        );
      }

      departureTime = "N/A";
    } else {
      // Participants traveling to the workshop must provide a departure time.
      if (typeof body.departureTime !== "string") {
        return fail("Please provide your departure time.");
      }

      const submittedTime = body.departureTime.trim();

      // Validate 24-hour HH:mm format.
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(submittedTime)) {
        return fail("Please provide a valid departure time.");
      }

      // Departure must be earlier than 7:00 PM.
      if (submittedTime >= WORKSHOP_START_TIME) {
        return fail("Your departure time must be before 7:00 PM.");
      }

      departureTime = submittedTime;
    }
  }

  // Verify assigned condition.
  if (body.condition !== undefined && body.condition !== expectedCondition) {
    return fail("Condition does not match the condition number.");
  }

  // Verify contact preference.
  if (body.contact !== undefined && body.contact !== contact) {
    return fail("Preference does not match the condition number.");
  }

  // Save response.
  try {
    await saveResponse({
      participantNumber,
      conditionNumber: validConditionNumber,
      condition: expectedCondition,
      contact,
      attendance,

      origin:
        requiresPlanQuestions && alreadyAtLocation === "no"
          ? origin
          : undefined,

      alreadyAtLocation: requiresPlanQuestions
        ? (alreadyAtLocation as "yes" | "no")
        : undefined,

      departureTime,

      calendarDownloaded:
        expectedCondition === "treatment" && attendance === "yes"
          ? "no"
          : undefined,

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
