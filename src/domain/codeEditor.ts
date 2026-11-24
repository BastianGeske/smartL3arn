/** Source-preserving edits; callers enforce their input size limit. */
export function codeEdit(value: string, start: number, end: number, key: 'Tab' | 'Enter', shift = false) {
  const lineStart = start > 0 ? value.lastIndexOf('\n', start - 1) + 1 : 0
  if (key === 'Enter') {
    const indent = value.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? ''
    const insert = '\n' + indent
    return { value: value.slice(0, start) + insert + value.slice(end), start: start + insert.length, end: start + insert.length }
  }
  if (!shift && start === end) return { value: value.slice(0, start) + '  ' + value.slice(end), start: start + 2, end: start + 2 }
  const blockEnd = end > start && value[end - 1] === '\n' ? end - 1 : end
  const block = value.slice(lineStart, blockEnd)
  const lines = block.split('\n')
  const lengths = lines.map(line => shift ? -(line.match(/^(?:\t| {1,2})/)?.[0].length ?? 0) : 2)
  const changed = lines.map((line, i) => shift ? line.slice(-lengths[i]!) : '  ' + line).join('\n')
  return { value: value.slice(0, lineStart) + changed + value.slice(blockEnd),
    start: Math.max(lineStart, start + lengths[0]!), end: Math.max(lineStart, end + lengths.reduce((a, b) => a + b, 0)) }
}
