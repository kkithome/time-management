import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

type ConditionNumber = "1" | "2" | "3" | "4";
type Condition = "control" | "treatment";
type Contact = "preferred" | "non-preferred";

const CONDITION_NUMBERS: ConditionNumber[] = ["1", "2", "3", "4"];
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
  // Check database configuration.
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured.");
    return fail("Database connection is not configured.", 500);
  }

  const sql = neon(process.env.DATABASE_URL);

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
    !CONDITION_NUMBERS.includes(conditionNumber as ConditionNumber)
  ) {
    return fail("A valid condition number is required.");
  }

  const validConditionNumber = conditionNumber as ConditionNumber;

  // Determine assigned condition and contact preference.
  const expectedCondition: Condition =
    validConditionNumber === "1" || validConditionNumber === "2"
      ? "control"
      : "treatment";

  const contact: Contact =
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


  if (body.contact !== undefined && body.contact !== contact) {
    return fail("Preference does not match the condition number.");
  }


  try {
  const dbInfo = await sql`
    SELECT
      current_database() AS database_name,
      current_schema() AS schema_name,
      current_setting('search_path') AS search_path,
      to_regclass('public.research_responses') AS public_table,
      to_regclass('research_responses') AS visible_table
  `;

  console.log("Database diagnostics:", dbInfo[0]);

  await sql`
    INSERT INTO research_responses (
      INSERT INTO research_responses (
        participant_number,
        condition_number,
        condition,
        contact,
        attendance,
        origin,
        already_at_location,
        departure_time,
        calendar_downloaded,
        submitted_at
      )
      VALUES (
        ${participantNumber},
        ${validConditionNumber},
        ${expectedCondition},
        ${contact},
        ${attendance},
        ${
          requiresPlanQuestions && alreadyAtLocation === "no"
            ? (origin ?? null)
            : null
        },
        ${requiresPlanQuestions ? (alreadyAtLocation as "yes" | "no") : null},
        ${departureTime ?? null},
        ${
          expectedCondition === "treatment" && attendance === "yes"
            ? "no"
            : null
        },
        ${new Date().toISOString()}
      )
    `;
  } catch (error) {
    if (isDuplicateError(error)) {
      return fail(
        "A response has already been submitted for this participant.",
        409,
      );
    }

    const dbError = error as {
      message?: string;
      code?: string;
    };

    console.error("Database submission failed:", {
      code: dbError.code,
      message: dbError.message,
    });

    return fail("Could not save your response. Please try again.", 500);
  }
    return NextResponse.json({ ok: true });


}
