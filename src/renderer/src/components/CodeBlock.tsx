import type { JSX } from 'react'

/**
 * Monospace block with a line-number gutter. Used for code samples and
 * structured text; it renders the sample verbatim — no diff highlighting.
 */
export function CodeBlock({
  text,
  startLine = 1
}: {
  readonly text: string
  readonly startLine?: number
}): JSX.Element {
  const lines = text.replace(/\n$/, '').split('\n')

  return (
    <pre className="min-w-max py-1 font-mono text-xs leading-5">
      <code className="block">
        {lines.map((line, index) => (
          <span key={index} className="flex">
            <span
              aria-hidden
              className="tabular sticky left-0 w-11 shrink-0 border-r border-line-subtle bg-surface-raised pr-2 text-right text-2xs leading-5 text-content-muted select-none"
            >
              {startLine + index}
            </span>
            <span className="pl-3 whitespace-pre text-content-secondary">
              {line.length > 0 ? line : '\u00a0'}
            </span>
          </span>
        ))}
      </code>
    </pre>
  )
}
