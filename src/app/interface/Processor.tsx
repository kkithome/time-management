'use client'

import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { firstName } from './names'

type ConditionCode = '1' | '2' | '3' | '4'
type Group = 'control' | 'treatment'

type Parsed = {
  fileName: string
  headers: string[]
  rows: string[][]
  // Assigned once per uploaded file, so changing the name column never reshuffles anyone.
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

// Conditions 1 and 2 are control; 3 and 4 are treatment.
function groupFor(conditionNumber: ConditionCode): Group {
  return conditionNumber === '1' || conditionNumber === '2' ? 'control' : 'treatment'
}

function participantNumberFor(index: number): string {
  return String(index + 1).padStart(4, '0')
}

// Fisher–Yates shuffle (returns a new array).
function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export default function Processor() {
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [nameColumn, setNameColumn] = useState(0)
  const [adminKey, setAdminKey] = useState('')
  // Set once the links have been activated on the server; links only work after that.
  const [batchId, setBatchId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setParsed(null)
    setBatchId(null)
    setError(null)
    setNotice(null)
    if (!file) return

    const text = await file.text()

    const parseResult = Papa.parse<string[]>(text, {
      skipEmptyLines: 'greedy',
      transform: (value) => value.trim(),
    })

    if (parseResult.data.length < 2) {
      setError('The CSV needs a header row and at least one participant row.')
      return
    }

    const [headers, ...rows] = parseResult.data
    const guessedNameColumn = headers.findIndex((header) => /name/i.test(header))

    // Repeating 1,2,3,4,1,2,3,4,... keeps the groups as balanced as possible,
    // then shuffling randomizes which recipient gets which condition.
    const orderedConditions = Array.from(
      { length: rows.length },
      (_, index) => String((index % 4) + 1) as ConditionCode,
    )

    setNameColumn(guessedNameColumn >= 0 ? guessedNameColumn : 0)
    setParsed({
      fileName: file.name,
      headers,
      rows,
      conditions: shuffle(orderedConditions),
    })
  }

  // Registers these participants on the server. Only now do their links work, and any
  // links from an earlier upload stop working.
  async function activateLinks() {
    if (!parsed) return
    if (!adminKey) {
      setError('Enter the admin key first.')
      return
    }

    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch('/interface/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          participants: parsed.rows.map((_, index) => ({
            participantNumber: participantNumberFor(index),
            conditionNumber: parsed.conditions[index],
          })),
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'The admin key is incorrect.'
            : (data?.error ?? 'Could not activate the links.'),
        )
      }

      setBatchId(data.batchId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate the links.')
    } finally {
      setBusy(false)
    }
  }

  // Clears every participant on the server, so all links already sent stop working.
  async function clearParticipants() {
    if (!adminKey) {
      setError('Enter the admin key to clear participants.')
      return
    }
    if (
      !window.confirm(
        'Clear all participants? Every link that has already been sent will stop working.',
      )
    ) {
      return
    }

    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch('/interface/participants', {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(
          response.status === 401
            ? 'The admin key is incorrect.'
            : (data?.error ?? 'Could not clear participants.'),
        )
      }

      setParsed(null)
      setBatchId(null)
      setNameColumn(0)
      // Reset the file input so choosing the same file again still triggers onChange.
      if (fileInputRef.current) fileInputRef.current.value = ''
      setNotice('Participants cleared. All previously generated links are no longer valid.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear participants.')
    } finally {
      setBusy(false)
    }
  }

  // Rebuilt whenever the file, the name column or the active batch changes.
  const output = useMemo(() => {
    if (!parsed || !batchId) return null
    const { rows, conditions } = parsed

    const counts: Record<ConditionCode, number> = { '1': 0, '2': 0, '3': 0, '4': 0 }
    const preview: PreviewRow[] = []

    // The output file has only these five columns; no other columns from the upload are kept.
    const outputRows: string[][] = [
      ['participantNumber', 'name', 'conditionNumber', 'condition', 'personalizedLink'],
    ]

    rows.forEach((row, index) => {
      const participantNumber = participantNumberFor(index)
      const conditionNumber = conditions[index]
      const group = groupFor(conditionNumber)
      // Only the first name goes into the link and the preview.
      const name = firstName(row[nameColumn] ?? '')
      counts[conditionNumber] += 1

      const link =
        `${window.location.origin}/interface/${group}` +
        `?participantName=${encodeURIComponent(name)}` +
        `&participantNumber=${participantNumber}` +
        `&conditionNumber=${conditionNumber}` +
        `&batchId=${encodeURIComponent(batchId)}`

      outputRows.push([participantNumber, name, conditionNumber, group, link])

      if (index < PREVIEW_ROWS) {
        preview.push({ participantNumber, name, conditionNumber, group, link })
      }
    })

    return { csv: Papa.unparse(outputRows), counts, preview }
  }, [parsed, nameColumn, batchId])

  function download() {
    if (!output || !parsed) return
    const blob = new Blob([output.csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = parsed.fileName.replace(/\.csv$/i, '') + '-with-links.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const remainingRows = parsed ? Math.max(0, parsed.rows.length - PREVIEW_ROWS) : 0

  return (
    <main className="processor-shell">
      {/* gridTemplateColumns is overridden because there is no logo <img> in the first column.
          Add your logo as the first child and remove the style prop to restore the 2-column layout. */}
      <header className="processor-header" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <span>CPSY 1960 Capstone</span>
          <h1>Participant link generator</h1>
          <p>
            Upload a participant list and get back a CSV with balanced condition assignments and a
            personalized link for each person.
          </p>
        </div>
      </header>

      <div className="processor-card">
        {/* Step 1 */}
        <section className="step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h2>Upload your participant list</h2>
            <p>
              A CSV with a header row. The file is processed in your browser; only participant
              numbers and condition numbers are sent to the server, never names.
            </p>

            <div className="configuration">
              <label>
                Admin key
                <input
                  type="password"
                  value={adminKey}
                  autoComplete="off"
                  onChange={(event) => setAdminKey(event.target.value)}
                />
              </label>
            </div>

            <label className="file-input">
              {parsed ? 'Choose a different file' : 'Choose CSV file'}
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} />
            </label>

            <button
              type="button"
              className="file-input"
              style={{ marginLeft: 10 }}
              onClick={clearParticipants}
              disabled={busy}
            >
              Clear participants
            </button>

            {parsed && (
              <p>
                Loaded <strong>{parsed.rows.length}</strong> participants from {parsed.fileName}.
              </p>
            )}

            {notice && <p>{notice}</p>}
            {error && <p className="processor-error">{error}</p>}
          </div>
        </section>

        {/* Step 2 */}
        <section className={`step${parsed ? '' : ' disabled-step'}`}>
          <div className="step-number">2</div>
          <div className="step-content">
            <h2>Choose the name column</h2>
            <p>Only the first name is used to personalize each link.</p>

            <div className="configuration">
              <label>
                Name column
                <select
                  value={nameColumn}
                  disabled={!parsed}
                  onChange={(event) => setNameColumn(Number(event.target.value))}
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
        <section className={`step${parsed ? '' : ' disabled-step'}`}>
          <div className="step-number">3</div>
          <div className="step-content">
            <div className="preview-heading">
              <div>
                <h2>Activate, preview and download</h2>
                <p>
                  {output
                    ? `Links are active. Condition counts: 1 = ${output.counts['1']}, 2 = ${output.counts['2']}, 3 = ${output.counts['3']}, 4 = ${output.counts['4']}`
                    : parsed
                      ? 'Activate the links to make them valid. This replaces any earlier batch.'
                      : 'Upload a file to get started.'}
                </p>
              </div>
              {batchId ? (
                <button type="button" onClick={download} disabled={!output}>
                  Download CSV
                </button>
              ) : (
                <button type="button" onClick={activateLinks} disabled={!parsed || busy}>
                  {busy ? 'Working…' : 'Activate links'}
                </button>
              )}
            </div>

            {output && (
              <div className="preview-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>First name</th>
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
                          <span className={`condition ${row.group}`}>{row.group}</span>
                        </td>
                        <td className="link-cell">{row.link}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {remainingRows > 0 && (
                  <div className="more-rows">+ {remainingRows} more rows in the download</div>
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
  )
}