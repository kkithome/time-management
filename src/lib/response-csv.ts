import { neon } from "@neondatabase/serverless";

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

function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is missing.");
  }

  return neon(databaseUrl);
}

export class DuplicantParticipantError extends Error {
  constructor(participantNumber: string) {
    super(
      `Participant number ${participantNumber} has already submitted a response.`,
    );
    this.name = "DuplicateParticipantError";
  }
}

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
  const sql = getDatabase();

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
      throw new DuplicantParticipantError(response.participantNumber);
    }
    throw error;
  }
}

export async function markCalendarDownloaded(
  participantNumber: string,
): Promise<void> {
  const sql = getDatabase();

  const existing = await sql`
    SELECT calendar_downloaded
    FROM research_responses
    WHERE participant_number = ${participantNumber}
  `;

  if (existing.length === 0) {
    throw new ParticipantNotFoundError(participantNumber);
  }

  const calendarDownloaded = existing[0].calendar_downloaded;

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
