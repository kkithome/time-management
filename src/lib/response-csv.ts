import Papa from "papaparse";
import { getSql } from "./db";
import { EVENT_TITLE } from "./event-config";

export type AnonymousResponse = {
  participantNumber: string;
  conditionNumber: "1" | "2";
  condition: "control" | "treatment";
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

// Kept for compatibility with any existing imports using the old spelling.
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
        ${response.participantNumber},
        ${EVENT_TITLE},
        ${response.conditionNumber},
        ${response.condition},
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

  if (calendarDownloaded === "yes") return;

  await sql`
    UPDATE research_responses
    SET calendar_downloaded = 'yes'
    WHERE participant_number = ${participantNumber}
      AND calendar_downloaded = 'no'
  `;
}

const CSV_FIELDS = [
  "participantNumber",
  "eventTitle",
  "conditionNumber",
  "condition",
  "attendance",
  "origin",
  "alreadyAtLocation",
  "departureTime",
  "calendarDownloaded",
  "submittedAt",
];

export async function exportResponsesCsv(): Promise<string | null> {
  const sql = getSql();

  const rows = await sql`
    SELECT
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
    FROM research_responses
    ORDER BY submitted_at, participant_number
  `;

  const responseRows = (Array.isArray(rows) ? rows : rows.rows) as Array<{
    participant_number: string;
    event_title: string | null;
    condition_number: string;
    condition: string;
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
    r.event_title ?? "",
    r.condition_number,
    r.condition,
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
