import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { EVENT_TITLE } from "@/lib/event-config";

type ConditionNumber = "1" | "2";
type Condition = "control" | "treatment";

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

function isDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured.");
    return fail("Database connection is not configured.", 500);
  }

  if (
    typeof EVENT_TITLE !== "string" ||
    !EVENT_TITLE.trim() ||
    EVENT_TITLE.length > MAX_TEXT_LENGTH
  ) {
    console.error("EVENT_TITLE is missing or invalid.");
    return fail("Event configuration is invalid.", 500);
  }

  const sql = neon(process.env.DATABASE_URL);

  let body: Record<string, unknown>;

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

  const participantNumber = toTrimmedString(body.participantNumber);

  if (!participantNumber || participantNumber.length > MAX_TEXT_LENGTH) {
    return fail("A valid participant number is required.");
  }

  const conditionNumber = toTrimmedString(body.conditionNumber);

  if (conditionNumber !== "1" && conditionNumber !== "2") {
    return fail("A valid condition number is required.");
  }

  const validConditionNumber = conditionNumber as ConditionNumber;

  // Condition 1 = control; Condition 2 = treatment.
  const expectedCondition: Condition =
    validConditionNumber === "1" ? "control" : "treatment";

  const attendance = body.attendance;

  if (attendance !== "yes" && attendance !== "no") {
    return fail('Attendance must be "yes" or "no".');
  }

  const origin = optionalText(body.origin);

  if (origin === null) {
    return fail("Origin must be text of 350 characters or less.");
  }

  const requiresPlanQuestions =
    expectedCondition === "treatment" && attendance === "yes";

  const alreadyAtLocation = body.alreadyAtLocation;
  let departureTime: string | null = null;

  if (requiresPlanQuestions) {
    if (alreadyAtLocation !== "yes" && alreadyAtLocation !== "no") {
      return fail(
        "Please indicate whether you will already be at the workshop location.",
      );
    }

    if (alreadyAtLocation === "yes") {
      if (body.departureTime !== "N/A") {
        return fail(
          'Departure time must be "N/A" if you will already be at the workshop location.',
        );
      }

      departureTime = "N/A";
    } else {
      if (typeof body.departureTime !== "string") {
        return fail("Please provide your departure time.");
      }

      const submittedTime = body.departureTime.trim();

      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(submittedTime)) {
        return fail("Please provide a valid departure time.");
      }

      if (submittedTime >= WORKSHOP_START_TIME) {
        return fail("Your departure time must be before 7:00 PM.");
      }

      departureTime = submittedTime;
    }
  }

  if (body.condition !== undefined && body.condition !== expectedCondition) {
    return fail("Condition does not match the condition number.");
  }

  const originValue =
    requiresPlanQuestions && alreadyAtLocation === "no"
      ? (origin ?? null)
      : null;

  const alreadyAtLocationValue = requiresPlanQuestions
    ? (alreadyAtLocation as "yes" | "no")
    : null;

  const calendarDownloadedValue = requiresPlanQuestions ? "no" : null;

  try {
    await sql`
      INSERT INTO research_responses (
        participant_number,
        event_title,
        condition_number,
        condition,
        attendance,
        origin,
        already_at_location,
        departure_time,
        calendar_downloaded,
        submitted_at
      )
      VALUES (
        ${participantNumber},
        ${EVENT_TITLE.trim()},
        ${validConditionNumber},
        ${expectedCondition},
        ${attendance},
        ${originValue},
        ${alreadyAtLocationValue},
        ${departureTime},
        ${calendarDownloadedValue},
        ${new Date().toISOString()}
      )
    `;

    console.log("Research response successfully inserted.", {
      conditionNumber: validConditionNumber,
      condition: expectedCondition,
      attendance,
    });
  } catch (error) {
    const dbError = error as {
      message?: string;
      code?: string;
      detail?: string;
      constraint?: string;
    };

    console.error("Research response INSERT failed:", {
      code: dbError.code,
      message: dbError.message,
      detail: dbError.detail,
      constraint: dbError.constraint,
    });

    if (isDuplicateError(error)) {
      return fail(
        "A response has already been submitted for this participant.",
        409,
      );
    }

    // Temporary diagnostics.
    if (process.env.DEBUG_SUBMISSIONS === "true") {
      return NextResponse.json(
        {
          ok: false,
          error: "Database INSERT failed",
          code: dbError.code ?? null,
          message: dbError.message ?? String(error),
          detail: dbError.detail ?? null,
          constraint: dbError.constraint ?? null,
        },
        { status: 500 },
      );
    }

    return fail("Could not save your response. Please try again.", 500);
  }

  return NextResponse.json({ ok: true });
}
