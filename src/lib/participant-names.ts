import { promises as fs } from "node:fs";
import path from "node:path";

// Maps a random link token -> the participant's FIRST name, used only to greet them.
// Kept in its own file, separate from responses.csv, so submitted responses stay anonymous.
const DATA_DIR = path.join(process.cwd(), "data");
const NAMES_PATH = path.join(DATA_DIR, "participant-names.json");

export const TOKEN_PATTERN = /^[0-9a-f]{12}$/;

export type NameEntry = { token: string; firstName: string };

let writeQueue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = writeQueue.then(task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readNames(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(NAMES_PATH, "utf8")) as Record<
      string,
      string
    >;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

// Adds (or updates) names. Tokens are unique per participant, so batches never collide.
export function saveNames(entries: NameEntry[]): Promise<void> {
  return enqueue(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const names = await readNames();

    for (const entry of entries) names[entry.token] = entry.firstName;

    const tempPath = `${NAMES_PATH}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(names), "utf8");
    await fs.rename(tempPath, NAMES_PATH);
  });
}

// Returns the first name for a token, or '' if the token is missing or unknown.
export async function getFirstName(token: string): Promise<string> {
  if (!TOKEN_PATTERN.test(token)) return "";
  const names = await readNames();
  return names[token] ?? "";
}
