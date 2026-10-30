"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import Papa from "papaparse";


type ConditionCode = "1" | "2" | "3" | "4";
type Group = "control" | "treatment";

type Parsed = {
  fileName: string;
  headers: string[];
  rows: string[][];
  // Assigned once per uploaded file, so changing the name column never reshuffles anyone.
  conditions: ConditionCode[];
  // One random token per participant. The link carries the token, never the name.
  tokens: string[];
};

type PreviewRow = {
  participantNumber: string;
  conditionNumber: ConditionCode;
  group: Group;
  link: string;
};

const PREVIEW_ROWS = 5;

// Conditions 1 and 2 are control; 3 and 4 are treatment.
function groupFor(conditionNumber: ConditionCode): Group {
  return conditionNumber === "1" || conditionNumber === "2"
    ? "control"
    : "treatment";
}

// 12 random hex characters (48 bits): not guessable, so numbers can't be used to reveal names.
function makeToken(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

// Fisher–Yates shuffle (returns a new array).
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function Processor() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [nameColumn, setNameColumn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Result of the last "save names" attempt, shown next to the download button.
  const [saveMessage, setSaveMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setParsed(null);
    setError(null);
    setSaveMessage(null);
    if (!file) return;

    const text = await file.text();

    const parseResult = Papa.parse<string[]>(text, {
      skipEmptyLines: "greedy",
      transform: (value) => value.trim(),
    });

    if (parseResult.data.length < 2) {
      setError("The CSV needs a header row and at least one participant row.");
      return;
    }

    const [headers, ...rows] = parseResult.data;
    const guessedNameColumn = headers.findIndex((header) =>
      /name/i.test(header),
    );

    // Repeating 1,2,3,4,1,2,3,4,... keeps the groups as balanced as possible,
    // then shuffling randomizes which recipient gets which condition.
    const orderedConditions = Array.from(
      { length: rows.length },
      (_, index) => String((index % 4) + 1) as ConditionCode,
    );

    setNameColumn(guessedNameColumn >= 0 ? guessedNameColumn : 0);
    setParsed({
      fileName: file.name,
      headers,
      rows,
      conditions: shuffle(orderedConditions),
      tokens: rows.map(() => makeToken()),
    });
  }

  function clearParticipants() {
    setParsed(null);
    setNameColumn(0);
    setError(null);
    setSaveMessage(null);
    // Reset the file input so choosing the same file again still triggers onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Rebuilt whenever the file changes.
  const output = useMemo(() => {
    if (!parsed) return null;
    const { rows, conditions, tokens } = parsed;

    const counts: Record<ConditionCode, number> = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
    };
    const preview: PreviewRow[] = [];

    // The output file has only these four columns. No names are included.
    const outputRows: string[][] = [
      ["participantNumber", "conditionNumber", "condition", "personalizedLink"],
    ];

    // Find the ID column in the CSV header.
    const idColumn = parsed.headers.findIndex(
      (header) => header.trim().toLowerCase() === "id",
    );

    if (idColumn === -1) {
      throw new Error("Your CSV must contain an ID column.");
    }

    rows.forEach((row, index) => {
      const participantID = row[idColumn]?.trim() ?? "";

      // Extract the numeric portion of IDs such as ID-001.
      const match = participantID.match(/^ID-(\d+)$/i);

      if (!match) {
        throw new Error(
          `Invalid participant ID "${participantID}". Expected format: ID-001.`,
        );
      }

      const participantNumber = match[1];
      const conditionNumber = conditions[index];
      const group = groupFor(conditionNumber);
      counts[conditionNumber] += 1;


      const link =
        `${window.location.origin}/interface/${group}` +
        `?participantNumber=${participantNumber}` +
        `&conditionNumber=${conditionNumber}` +
        `&token=${tokens[index]}`;

      outputRows.push([participantNumber, conditionNumber, group, link]);

      if (index < PREVIEW_ROWS) {
        preview.push({ participantNumber, conditionNumber, group, link });
      }
    });

    return { csv: Papa.unparse(outputRows), counts, preview };
  }, [parsed]);

  function downloadCsv() {
    if (!output || !parsed) return;
    const blob = new Blob([output.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      parsed.fileName.replace(/\.csv$/i, "") + "-with-links.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }


  async function saveAndDownload() {
    if (!output || !parsed) return;

    setBusy(true);

    downloadCsv();

    setBusy(false);
  }

  const remainingRows = parsed
    ? Math.max(0, parsed.rows.length - PREVIEW_ROWS)
    : 0;

  return (
    <main className="processor-shell">
      <header
        className="processor-header"
        style={{ gridTemplateColumns: "1fr" }}
      >
        <div>
          <h1>Participant Link Generator</h1>
          <p>
            Upload a participant list and get back a CSV with balanced condition
            assignments and an anonymous link for each person.
          </p>
        </div>
      </header>

      <div className="processor-card">
        {/* Step 1 */}
        <section className="step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h2>Upload Your Participant List</h2>
            <p>
              A CSV with a header row. The file is processed in your browser.
              When you download, each participant&apos;s first name is saved on
              the server so their page can greet them. Names are never put in
              the links or in the responses file.
            </p>

            <label className="file-input">
              {parsed ? "Choose a different file" : "Choose CSV file"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
              />
            </label>

            {(parsed || error) && (
              <button
                type="button"
                className="file-input"
                style={{ marginLeft: 10 }}
                onClick={clearParticipants}
              >
                Clear Participants
              </button>
            )}

            {parsed && (
              <p>
                Loaded <strong>{parsed.rows.length}</strong> participants from{" "}
                {parsed.fileName}.
              </p>
            )}

            {error && <p className="processor-error">{error}</p>}
          </div>
        </section>

       
        {/* Step 3 */}
        <section className={`step${output ? "" : " disabled-step"}`}>
          <div className="step-number">3</div>
          <div className="step-content">
            <div className="preview-heading">
              <div>
                <h2>Preview and Download</h2>
                <p>
                  {output
                    ? `Condition counts: 1 = ${output.counts["1"]}, 2 = ${output.counts["2"]}, 3 = ${output.counts["3"]}, 4 = ${output.counts["4"]}`
                    : "Upload a file to see the generated links."}
                </p>
              </div>
              <button
                type="button"
                onClick={saveAndDownload}
                disabled={!output || busy}
              >
                {busy ? "Saving…" : "Download CSV"}
              </button>
            </div>

            {saveMessage && (
              <p
                className={
                  saveMessage.kind === "error" ? "processor-error" : undefined
                }
              >
                {saveMessage.text}
              </p>
            )}

            {output && (
              <div className="preview-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Code</th>
                      <th>Condition</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.preview.map((row) => (
                      <tr key={row.participantNumber}>
                        <td>{row.participantNumber}</td>
                        <td>{row.conditionNumber}</td>
                        <td>
                          <span className={`condition ${row.group}`}>
                            {row.group}
                          </span>
                        </td>
                        <td className="link-cell">{row.link}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {remainingRows > 0 && (
                  <div className="more-rows">
                    + {remainingRows} more rows in the download
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="processor-footer">
        <Link href="/interface/control">Preview control page</Link>
        <Link href="/interface/treatment">Preview treatment page</Link>
      </footer>
    </main>
  );
}
