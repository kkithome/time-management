import { promises as fs } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

export type AnonymousResponse = {
  participantNumber: string;
  conditionNumber: "1" | "2" | "3" | "4";
  condition: "control" | "treatment";
  contact: "preferred" | "non-preferred";
  attendance: "yes" | "no";
  origin?: string;
  departureTime?: string;
  calendarDownloaded?: "yes" | "no";
  submittedAt: string;
};

const Data_DIR = path.join(process.cwd(), "data");
const CSV_PATH = path.join(Data_DIR, "responses.CSV");

const COLUMNS: (keyof AnonymousResponse)[] = [
  "participantNumber",
  "conditionNumber",
  "condition",
  "contact",
  "attendance",
  "origin",
  "departureTime",
  "calendarDownloaded",
  "submittedAt",
];

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
      `Participant number ${participantNumber} was not offered a calendar file.`)
    this.name = "CalendarNotApplicableError";
  }
}

let writeQueue = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(Data_DIR, { recursive: true });
}

async function readResponses(): Promise<AnonymousResponse[]> {
  let text: string;
  try {
    text = await fs.readFile(CSV_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  if (!text.trim()) return [];

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`Could not parse ${CSV_PATH}: ${parsed.errors[0].message}`);
  }

  return parsed.data.map((row) => ({
    participantNumber: row.participantNumber,
    conditionNumber:
      row.conditionNumber as AnonymousResponse["conditionNumber"],
    condition: row.conditionNumber as AnonymousResponse["condition"],
    contact: row.preference as AnonymousResponse["contact"],
    attendance: row.attendance as AnonymousResponse["attendance"],
    origin: row.origin || undefined,
    departureTime: row.departureTime || undefined,
    calendarDownloaded: (row.calendarDownloaded || undefined) as |
    AnonymousResponse['calendarDownloaded'],
    submittedAt: row.submittedAt,
  }));
}

async function writeResponses(responses: AnonymousResponse[]): Promise<void> {
    await ensureDataDir()

    const csv = Papa.unparse(
        {
            fields: COLUMNS as string[],
            data: responses.map((r) => COLUMNS.map((column) => r[column] ?? '')),
        },
        { newline: '\n'},
    )

    const tempPath = `{CSV_PATH}.tmp`
    await fs.writeFile(tempPath, csv + '\n', 'utf8')
    await fs.rename(tempPath, CSV_PATH)
}

async function appendResponse(response: AnonymousResponse): Promise<void> {

  const existing = await readResponses();

  if (
    existing.some((r) => r.participantNumber === response.participantNumber)
  ) {
    throw new DuplicantParticipantError(response.participantNumber);
  }

  await writeResponses([...existing, response])
}

async function applyCalendarDownloaded(participantNumber: string): Promise<void> {
    const existing = await readResponses()
    const target = existing.find((r) => r. participantNumber === participantNumber)
    
    if (!target) throw new ParticipantNotFoundError(participantNumber)
    if (!target.calendarDownloaded) throw new CalendarNotApplicableError(participantNumber)
    if (target.calendarDownloaded == "yes") return

    target.calendarDownloaded = 'yes'
    await writeResponses(existing)
}

export function saveResponse(response: AnonymousResponse): Promise<void> {
  return enqueue(() => appendResponse(response))
}

export function markCalendarDownloaded(participantNumber: string): Promise<void> {
    return enqueue(() => applyCalendarDownloaded(participantNumber))
}
