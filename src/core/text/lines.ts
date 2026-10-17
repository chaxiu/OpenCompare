/**
 * Split text into logical lines for diffing.
 *
 * CRLF is folded to LF. A trailing newline yields a trailing empty entry so
 * callers can preserve "file ends with newline" without extra bookkeeping.
 */
export function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}
