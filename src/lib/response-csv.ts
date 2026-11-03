import Papa from "papaparse";
import { getSql } from "./db";

export type AnonymousResponse = {
  participantNumber: string;
  conditionNumber: "1" | "2" | "3" | "4";
  condition: "control" | "treatment";
  contact: "preferred" | "non-preferred";
  attendance: "yes" | "no";
  origin?: string;
  alreadyAtLocation?: "yes" | "no";
  departureTime?: string;
  calendarDownloaded?: "yes" | "no";
  submittedAt: string;
};

export class DuplicateParticipantError extends Error {
  constructor(participantNumber: string) {
    super(
      `Participant number ${participantNumber} has already submitted a response.`,
    );
    this.name = "DuplicateParticipantError";
  }
}

// The old file spelled this class "DuplicantParticipantError". Kept so any import
// that still uses the old spelling keeps working.
export const DuplicantParticipantError = DuplicateParticipantError;

export class ParticipantNotFoundError extends Error {
  constructor(participantNumber: string) {
    super(`No response found for participant number ${participantNumber}`);
    this.name = "ParticipantNotFoundError";
  }
}

export class CalendarNotApplicableError extends Error {
  constructor(participantNumber: string) {
    super(
      `Participant number ${participantNumber} was not offered a calendar file.`,
    );
    this.name = "CalendarNotApplicableError";
  }
}

// Postgres error code 23505 = unique violation (participant already submitted).
function isDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function saveResponse(response: AnonymousResponse): Promise<void> {
  const sql = getSql();

  try {
    await sql`
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
        ${response.participantNumber},
        ${response.conditionNumber},
        ${response.condition},
        ${response.contact},
        ${response.attendance},
        ${response.origin ?? null},
        ${response.alreadyAtLocation ?? null},
        ${response.departureTime ?? null},
        ${response.calendarDownloaded ?? null},
        ${response.submittedAt}
      )
    `;
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new DuplicateParticipantError(response.participantNumber);
    }
    throw error;
  }
}

export async function markCalendarDownloaded(
  participantNumber: string,
): Promise<void> {
  const sql = getSql();

  const existing = await sql`
    SELECT calendar_downloaded
    FROM research_responses
    WHERE participant_number = ${participantNumber}
  `;

  const existingRows = (
    Array.isArray(existing) ? existing : existing.rows
  ) as Array<{ calendar_downloaded: string | null }>;

  if (existingRows.length === 0) {
    throw new ParticipantNotFoundError(participantNumber);
  }

  const calendarDownloaded = existingRows[0].calendar_downloaded;

  if (!calendarDownloaded) {
    throw new CalendarNotApplicableError(participantNumber);
  }

  if (calendarDownloaded === "yes") {
    return;
  }

  await sql`
    UPDATE research_responses
    SET calendar_downloaded = 'yes'
    WHERE participant_number = ${participantNumber}
      AND calendar_downloaded = 'no'
  `;
}

const CSV_FIELDS = [
  "participantNumber",
  "conditionNumber",
  "condition",
  "contact",
  "attendance",
  "origin",
  "alreadyAtLocation",
  "departureTime",
  "calendarDownloaded",
  "submittedAt",
];

// Builds the responses CSV for the /interface/responses.csv download.
// Returns null when there are no responses yet.
export async function exportResponsesCsv(): Promise<string | null> {
  const sql = getSql();

  const rows = await sql`
    SELECT participant_number, condition_number, condition, contact, attendance, origin,
           already_at_location, departure_time, calendar_downloaded, submitted_at
    FROM research_responses
    ORDER BY submitted_at, participant_number
  `;

  const responseRows = (Array.isArray(rows) ? rows : rows.rows) as Array<{
    participant_number: string;
    condition_number: string;
    condition: string;
    contact: string;
    attendance: string;
    origin: string | null;
    already_at_location: string | null;
    departure_time: string | null;
    calendar_downloaded: string | null;
    submitted_at: Date | string | null;
  }>;
  if (responseRows.length === 0) return null;

  const data = responseRows.map((r) => [
    r.participant_number,
    r.condition_number,
    r.condition,
    r.contact,
    r.attendance,
    r.origin ?? "",
    r.already_at_location ?? "",
    r.departure_time ?? "",
    r.calendar_downloaded ?? "",
    r.submitted_at instanceof Date
      ? r.submitted_at.toISOString()
      : String(r.submitted_at ?? ""),
  ]);

  return Papa.unparse({ fields: CSV_FIELDS, data }, { newline: "\n" }) + "\n";
}
