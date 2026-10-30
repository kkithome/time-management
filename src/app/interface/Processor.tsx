'use client'

import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { firstName } from './names'


const fileInputRef = useRef<HTMLInputElement>(null)

type ConditionCode = '1' | '2' | '3' | '4'
type Group = 'control' | 'treatment'

type Parsed = {
    fileName: string
    headers: string[]
    rows: string[][]
    conditions: ConditionCode[]
}

type PreviewRow = {
    participantNumber: string
    name: string
    conditionNumber: ConditionCode
    group: Group
    link: string
}

const PREVIEW_ROWS = 5

type Result = {
    csv: string
    counts: Record<ConditionCode, number>
}

function groupFor(conditionNumber: ConditionCode): 'control' | 'treatment' {
    return conditionNumber === '1' || conditionNumber === '2' ? 'control' : 'treatment'
}

function shuffle<T>(items: T[]): T[] {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1))
        ; [result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

export default function Processor() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [nameColumn, setNameColumn] = useState(0);
  const [error, setError] = useState<string | null>(null);



  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setParsed(null);
    setError(null);
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
    });
  }

  function clearParticipants () {
    setParsed(null)
    setNameColumn(0)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ' '
  }

  const output = useMemo(() => {
    if (!parsed) return null;
    const { rows, conditions } = parsed;

    const counts: Record<ConditionCode, number> = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
    };
    const preview: PreviewRow[] = [];

    const outputRows: string[][] = [
      [
        "participantNumber",
        "conditionNumber",
        "condition",
        "personalizedLink",
      ],
    ];

    rows.forEach((row, index) => {
      const participantNumber = String(index + 1).padStart(4, "0");
      const conditionNumber = conditions[index];
      const group = groupFor(conditionNumber);
      const name = firstName(row[nameColumn] ?? '');
      counts[conditionNumber] += 1;

      const link =
        `${window.location.origin}/interface/${group}` +
        `?participantName=${encodeURIComponent(name)}` +
        `&participantNumber=${participantNumber}` +
        `&conditionNumber=${conditionNumber}`;


      outputRows.push([
        participantNumber,
        name,
        conditionNumber,
        group,
        link,
      ]);

      if (index < PREVIEW_ROWS) {
        preview.push({ participantNumber, name, conditionNumber, group, link });
      }
    });

    return { csv: Papa.unparse(outputRows), counts, preview };
  }, [parsed, nameColumn]);

  function download() {
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
          <span>Study tools</span>
          <h1>Participant Link Generator</h1>
          <p>
            Upload a participant list and get back a CSV with balanced condition
            assignments and a personalized link for each person.
          </p>
        </div>
      </header>

      <div className="processor-card">
        {/* Step 1 */}
        <section className="step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h2>Upload your Participant List</h2>
            <p>
              A CSV with a header row. Everything is processed in your browser;
              the file is not uploaded anywhere.
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

        {/* Step 2 */}
        <section className={`step${parsed ? "" : " disabled-step"}`}>
          <div className="step-number">2</div>
          <div className="step-content">
            <h2>Choose the Name Column</h2>
            <p>Only the first name is used to personalize each link.</p>

            <div className="configuration">
              <label>
                Name column
                <select
                  value={nameColumn}
                  disabled={!parsed}
                  onChange={(event) =>
                    setNameColumn(Number(event.target.value))
                  }
                >
                  {parsed ? (
                    parsed.headers.map((header, index) => (
                      <option key={index} value={index}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))
                  ) : (
                    <option>—</option>
                  )}
                </select>
              </label>
            </div>
          </div>
        </section>

        {/* Step 3 */}
        <section className={`step${output ? "" : " disabled-step"}`}>
          <div className="step-number">3</div>
          <div className="step-content">
            <div className="preview-heading">
              <div>
                <h2>Preview and download</h2>
                <p>
                  {output
                    ? `Condition counts: 1 = ${output.counts["1"]}, 2 = ${output.counts["2"]}, 3 = ${output.counts["3"]}, 4 = ${output.counts["4"]}`
                    : "Upload a file to see the generated links."}
                </p>
              </div>
              <button type="button" onClick={download} disabled={!output}>
                Download CSV
              </button>
            </div>

            {output && (
              <div className="preview-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>First Name</th>
                      <th>Code</th>
                      <th>Condition</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.preview.map((row) => (
                      <tr key={row.participantNumber}>
                        <td>{row.participantNumber}</td>
                        <td>{row.name}</td>
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
 