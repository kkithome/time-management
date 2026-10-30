// Returns just the first name from a full name: "Jane Q. Smith" -> "Jane".
// Titles ("Dr. Jane Smith") and "Last, First" formats are not handled specially.
export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}
