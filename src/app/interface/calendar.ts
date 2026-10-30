export const WORKSHOP = {
  title: "Time and Task Management Workshop",
  description:
    "Join the Curricular Resource Center’s academic coaches for a workshop on managing your time and getting your work under control for the rest of the term. You’ll learn how to plan out your weeks, figure out what actually needs your attention first, and break big assignments into steps you can realistically tackle. Come as you are and leave with a system you can start using right away.  We’ll have light snacks, too.",
  location: "CRC Lounge - 167 Angell Street",
  start: "20261104T1900000",
  end: "20261104T203000",
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December']

function formatTime(compact: string): string {
    const hours = Number(compact.slice(9,11))
    const minutes = Number(compact.slice(11, 13));
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`
    
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}


function foldLine(line: string): string {
    const limit = 73
    if (line.length <= limit) return line
    const parts: string[] = [line.slice(0, limit)]
    for (let i = limit; i < line.length; i += limit -1) {
        parts.push(' ' + line.slice(i, i + limit - 1))
    }
    return parts.join('\r\n')
}

function utcTimestamp(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function buildCalendarText(): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ACCESS Workshop//Confirmation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@access-workshop`,
    `DTSTAMP:${utcTimestamp(new Date())}`,
    `DTSTART:${WORKSHOP.start}`,
    `DTEND:${WORKSHOP.end}`,
    `SUMMARY:${escapeText(WORKSHOP.title)}`,
    `DESCRIPTION:${escapeText(WORKSHOP.description)}`,
    `LOCATION:${escapeText(WORKSHOP.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

return lines.map(foldLine).join('\r\n') + '\r\n'

}

export function downloadWorkshopCalendar(): void {
    if (typeof window === 'undefined') return
    const calendarText = buildCalendarText()

    const blob = new Blob([calendarText], {
        type: 'text/calendar;cahrset=utf-8'
    })

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = 'time-management.ics'
    anchor.click()

    URL.revokeObjectURL(url)
}


export function getWorkshopDisplay() {
    const year = WORKSHOP.start.slice(0,4)
    const monthName = MONTH_NAMES[Number(WORKSHOP.start.slice(4, 6)) -1]
    const day = String(Number(WORKSHOP.start.slice(6,8)))

return {
    title: WORKSHOP.title,
    description: WORKSHOP.description, 
    location: WORKSHOP.location,
    month: monthName.slice(0, 9),
    day, 
    when: `${monthName} ${day}, ${year} at ${formatTime(WORKSHOP.start)} - ${formatTime(WORKSHOP.end)}`,
}
}