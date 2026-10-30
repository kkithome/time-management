"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { downloadWorkshopCalendar, getWorkshopDisplay } from "./calendar";

type Props = {
  condition: "control" | "treatment";
  participantName: string;
  participantNumber: string;
  conditionNumber: string;
};

type Status = "idle" | "submitting" | "submitted";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <div className="single-interface">
        <div className="interface-version">{children}</div>
      </div>
    </main>
  );
}

export default function ConfirmationApp({
  condition,
  participantName,
  participantNumber,
  conditionNumber,
}: Props) {
  const [attendance, setAttendance] = useState<"yes" | "no" | "">("");
  const [origin, setOrigin] = useState("");
  const [alreadyAtLocation, setAlreadyAtLocation] = useState<"yes" | "no" | "">(
    "",
  );
  const [departureTime, setDepartureTime] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const isTreatment = condition === "treatment";
  const showPlanQuestions = isTreatment && attendance === "yes";
  const workshop = getWorkshopDisplay();

  const WORKSHOP_START_TIME = "19:00";

  const isDepartureValid =
    alreadyAtLocation === "yes" ||
    (alreadyAtLocation === "no" &&
      departureTime !== "" &&
      departureTime < WORKSHOP_START_TIME);

  // Downloads the calendar file and records the download on the server.
  async function handleCalendarDownload() {
    try {
      downloadWorkshopCalendar();
    } catch (calendarError) {
      console.error("Could not generate calendar file:", calendarError);
      return;
    }

    try {
      await fetch("/interface/calendar-download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ participantNumber }),
      });
    } catch (reportError) {
      console.error("Could not record calendar download:", reportError);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!attendance) {
      setError("Please let us know whether you will attend.");
      return;
    }

    if (showPlanQuestions && !isDepartureValid) {
      setError(
        alreadyAtLocation === ""
          ? "Please indicate whether you will already be at the workshop location."
          : "Please enter a departure time before 7:00 PM.",
      );
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch("/interface/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          participantNumber,
          conditionNumber,
          condition,
          attendance,

          origin:
            showPlanQuestions && alreadyAtLocation === "no"
              ? origin
              : undefined,

          alreadyAtLocation: showPlanQuestions ? alreadyAtLocation : undefined,

          departureTime: showPlanQuestions
            ? alreadyAtLocation === "yes"
              ? "N/A"
              : departureTime
            : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error ?? "Something went wrong. Please try again.",
        );
      }

      setStatus("submitted");

      if (isTreatment && attendance === "yes") {
        void handleCalendarDownload();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setStatus("idle");
    }
  }

  if (status === "submitted") {
    return (
      <Shell>
        <section className="confirmation-card">
          <div className="success">
            <div className="success-check" aria-hidden="true">
              ✓
            </div>

            <h1 className="greeting">
              Thank you
              {participantName && (
                <>
                  , <strong>{participantName}</strong>
                </>
              )}
            </h1>

            <p className="intro" style={{ margin: "0 auto" }}>
              Your response has been recorded.
              {attendance === "yes" &&
                " We look forward to seeing you at the workshop."}
            </p>

            {isTreatment && attendance === "yes" && (
              <div className="calendar-callout">
                <div className="calendar-copy">
                  <span className="calendar-icon">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </span>

                  <strong>
                    Add the workshop to your calendar so you don&apos;t miss it.
                  </strong>
                </div>

                <button type="button" onClick={handleCalendarDownload}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
                  </svg>
                  Add to calendar
                </button>
              </div>
            )}
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="confirmation-card">
        <h1 className="greeting">
          Welcome
          {participantName && (
            <>
              , <strong>{participantName}</strong>
            </>
          )}
        </h1>

        {participantNumber && (
          <p className="participant-number">
            Participant number: <strong>{participantNumber}</strong>
          </p>
        )}

        <p className="intro">
          Please let us know whether you will attend the{" "}
          <strong>{workshop.title}</strong>.
        </p>

        <div className="event-details">
          <div className="date-tile">
            <span>{workshop.month}</span>
            <strong>{workshop.day}</strong>
          </div>

          <div className="event-copy">
            <h2>{workshop.title}</h2>
            <p>{workshop.description}</p>

            <dl>
              <div>
                <dt>When</dt>
                <dd>{workshop.when}</dd>
              </div>

              <div>
                <dt>Where</dt>
                <dd>{workshop.location}</dd>
              </div>
            </dl>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <fieldset>
            <legend>Can you attend?</legend>

            <label
              className={`choice${attendance === "yes" ? " selected" : ""}`}
            >
              <input
                type="radio"
                name="attendance"
                value="yes"
                checked={attendance === "yes"}
                onChange={() => setAttendance("yes")}
              />
              <span className="radio" />
              <span>
                <strong>Yes, I can attend</strong>
              </span>
            </label>

            {showPlanQuestions && (
              <div className="plan-section">
                <fieldset>
                  <legend>Will you already be at the workshop location?</legend>

                  <label
                    className={`choice${
                      alreadyAtLocation === "yes" ? " selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="alreadyAtLocation"
                      value="yes"
                      checked={alreadyAtLocation === "yes"}
                      onChange={() => {
                        setAlreadyAtLocation("yes");
                        setDepartureTime("");
                        setOrigin("");
                      }}
                    />
                    <span className="radio" />
                    <span>
                      <strong>
                        I will already be at the workshop location.
                      </strong>
                    </span>
                  </label>

                  <label
                    className={`choice${
                      alreadyAtLocation === "no" ? " selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="alreadyAtLocation"
                      value="no"
                      checked={alreadyAtLocation === "no"}
                      onChange={() => setAlreadyAtLocation("no")}
                    />
                    <span className="radio" />
                    <span>
                      <strong>No, I&apos;ll be traveling there</strong>
                    </span>
                  </label>
                </fieldset>

                {alreadyAtLocation === "yes" && (
                  <div className="plan-section">
                    <p>
                      <strong>
                        What time will you leave for the workshop?
                      </strong>
                    </p>
                    <p>N/A — you will already be at the workshop location.</p>
                  </div>
                )}

                {alreadyAtLocation === "no" && (
                  <>
                    <label className="travel-question">
                      <span>Where will you be coming from?</span>
                      <input
                        type="text"
                        value={origin}
                        onChange={(event) => setOrigin(event.target.value)}
                        maxLength={200}
                      />
                    </label>

                    <label className="travel-question">
                      <span>What time will you leave for the workshop?</span>
                      <input
                        type="time"
                        value={departureTime}
                        max="18:59"
                        onChange={(event) =>
                          setDepartureTime(event.target.value)
                        }
                        required
                      />
                      <small>
                        Please select a departure time before 7:00 PM.
                      </small>
                    </label>

                    {departureTime !== "" &&
                      departureTime >= WORKSHOP_START_TIME && (
                        <p className="submission-error" role="alert">
                          Your departure time must be before 7:00 PM.
                        </p>
                      )}
                  </>
                )}
              </div>
            )}

            <label
              className={`choice${attendance === "no" ? " selected" : ""}`}
            >
              <input
                type="radio"
                name="attendance"
                value="no"
                checked={attendance === "no"}
                onChange={() => setAttendance("no")}
              />
              <span className="radio" />
              <span>
                <strong>No, I can&apos;t attend</strong>
              </span>
            </label>
          </fieldset>

          <button
            type="submit"
            className="submit-button"
            disabled={
              !attendance ||
              status === "submitting" ||
              (showPlanQuestions && !isDepartureValid)
            }
          >
            {status === "submitting" ? "Submitting…" : "Submit response"}
          </button>

          {error && (
            <p className="submission-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </Shell>
  );
}
