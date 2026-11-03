// Shared by every persistence adapter, including Electron. No expression evaluation.
export class TaskValidationError extends Error {
  constructor(code = 'invalid') { super(`Invalid task: ${code}`); this.code = code }
}
const fail = (code) => { throw new TaskValidationError(code) }
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v, max = 4000) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail()
  return v.trim()
}
const id = v => {
  const result = text(v, 128)
  if (!/^[\w-]+$/.test(result) || ['__proto__', 'prototype', 'constructor'].includes(result)) fail()
  return result
}
const list = (v, min = 1, max = 50) => {
  if (!Array.isArray(v) || v.length < min || v.length > max) fail()
  return v
}
const unique = values => { if (new Set(values).size !== values.length) fail(); return values }
function numberValue(value) {
  const result = text(value, 2048)
  if (!parseNumeric(result)) fail('invalidMath')
  return result
}
function tolerance(value) {
  if (value === undefined) return {}
  const result = numberValue(value)
  if (parseNumeric(result).numerator < 0n) fail('invalidMath')
  return { tolerance: result }
}
export function normalizeTask(value, front) {
  if (!record(value)) fail()
  const task = { kind: value.kind }
  if (value.explanation !== undefined) {
    if (typeof value.explanation !== 'string' || value.explanation.length > 4000) fail()
    if (value.explanation.trim()) task.explanation = value.explanation.trim()
  }
  switch (task.kind) {
    case 'short_text': case 'long_text': break
    case 'calculation': {
      const a = value.answer
      if (!record(a)) fail()
      switch (a.kind) {
        case 'number': task.answer = { kind: a.kind, value: numberValue(a.value), ...tolerance(a.tolerance) }; break
        case 'fraction': {
          const numerator = text(a.numerator, 2048), denominator = text(a.denominator, 2048)
          if (fractionValue(numerator, denominator) === null) fail('invalidMath')
          task.answer = { kind: a.kind, numerator, denominator }; break
        }
        case 'quantity': task.answer = { kind: a.kind, pairs: list(a.pairs).map(p => {
          if (!record(p)) fail()
          return { value: numberValue(p.value), unit: text(p.unit, 120) }
        }), ...tolerance(a.tolerance) }; break
        case 'formula': task.answer = { kind: a.kind, value: text(a.value) }; break
        default: fail()
      }
      if (value.solutionSteps !== undefined) task.solutionSteps = list(value.solutionSteps, 0).map(s => {
        if (!record(s) || !['text', 'math'].includes(s.kind)) fail()
        if (typeof s.value !== 'string' || s.value.length > 4000) fail()
        return { kind: s.kind, value: s.value.trim() }
      }).filter(s => s.value)
      break
    }
    case 'single_choice': case 'multiple_choice': {
      task.options = list(value.options, 2).map(o => {
        if (!record(o)) fail()
        return { id: id(o.id), text: text(o.text) }
      })
      const ids = unique(task.options.map(o => o.id))
      unique(task.options.map(o => o.text.normalize('NFKC')))
      task.correctIds = unique(list(value.correctIds).map(id))
      if (task.correctIds.some(v => !ids.includes(v)) || (task.kind === 'single_choice' && task.correctIds.length !== 1)) fail()
      break
    }
    case 'true_false':
      if (typeof value.correct !== 'boolean') fail()
      task.correct = value.correct; break
    case 'cloze': {
      task.gaps = list(value.gaps).map(g => {
        if (!record(g) || !['text', 'number'].includes(g.kind)) fail()
        const gap = { id: id(g.id), kind: g.kind, answer: g.kind === 'number' ? numberValue(g.answer) : text(g.answer) }
        if (g.alternatives !== undefined) gap.alternatives = list(g.alternatives, 0).map(v => typeof v === 'string' && !v.trim() ? null : g.kind === 'number' ? numberValue(v) : text(v)).filter(v => v !== null)
        return gap
      })
      const ids = unique(task.gaps.map(g => g.id))
      const tokens = [...front.matchAll(/\{\{([\w-]+)\}\}/g)].map(m => m[1])
      if (!ids.every(v => tokens.includes(v)) || tokens.some(v => !ids.includes(v))) fail('missingGaps')
      break
    }
    case 'matching':
      task.pairs = list(value.pairs, 2).map(p => {
        if (!record(p)) fail()
        return { id: id(p.id), left: text(p.left), right: text(p.right) }
      })
      unique(task.pairs.map(p => p.id)); unique(task.pairs.map(p => p.left.normalize('NFKC'))); unique(task.pairs.map(p => p.right.normalize('NFKC'))); break
    case 'ordering': {
      task.items = list(value.items, 2).map(o => {
        if (!record(o)) fail()
        return { id: id(o.id), text: text(o.text) }
      })
      const ids = unique(task.items.map(o => o.id))
      unique(task.items.map(o => o.text.normalize('NFKC')))
      task.correctOrder = unique(list(value.correctOrder, 2).map(id))
      if (task.correctOrder.length !== ids.length || task.correctOrder.some(v => !ids.includes(v))) fail()
      break
    }
    default: fail('unknownType')
  }
  const solution = taskSolution(task, front)
  if (solution !== null && solution.length > 20_000) fail()
  return task
}
export function taskSolution(task, front) {
  let result
  switch (task.kind) {
    case 'short_text': case 'long_text': return null
    case 'calculation': {
      const a = task.answer
      result = a.kind === 'fraction' ? `\\(\\frac{${a.numerator}}{${a.denominator}}\\)`
        : a.kind === 'quantity' ? task.answer.pairs.map(p => `${p.value} ${p.unit}`).join(' / ')
        : a.kind === 'formula' ? `\\(${a.value}\\)` : a.value
      if (task.solutionSteps?.length) result += '\n\n' + task.solutionSteps.map(s => s.kind === 'math' ? `\\[${s.value}\\]` : s.value).join('\n')
      break
    }
    case 'single_choice': case 'multiple_choice': result = task.options.filter(o => task.correctIds.includes(o.id)).map(o => o.text).join('\n'); break
    case 'true_false': result = task.correct ? '✓' : '✗'; break
    case 'cloze': result = front.replace(/\{\{([\w-]+)\}\}/g, (_, id) => task.gaps.find(g => g.id === id)?.answer ?? '___'); break
    case 'matching': result = task.pairs.map(p => `${p.left} → ${p.right}`).join('\n'); break
    case 'ordering': result = task.correctOrder.map((id, i) => `${i + 1}. ${task.items.find(o => o.id === id).text}`).join('\n'); break
  }
  return result + (task.explanation ? '\n\n' + task.explanation : '')
}
export function fractionValue(numerator, denominator) {
  const n = numerator.trim().replace(/−/g, '-'), d = denominator.trim().replace(/−/g, '-')
  if (n.length > 2048 || d.length > 2048 || !/^[+-]?\d+$/.test(n) || !/^[+-]?\d+$/.test(d) || BigInt(d) === 0n) return null
  return `${n}/${d}`
}
export function parseNumeric(value) {
  if (typeof value !== 'string' || value.length > 4097) return null
  const source = value.trim().replace(/−/g, '-')
  const fraction = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(source)
  if (fraction) {
    if (fractionValue(fraction[1], fraction[2]) === null) return null
    let numerator = BigInt(fraction[1]), denominator = BigInt(fraction[2])
    if (denominator < 0n) { numerator = -numerator; denominator = -denominator }
    return { numerator, denominator }
  }
  const match = /^([+-]?)(\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE]([+-]?\d{1,4}))?$/.exec(source)
  if (!match || match[2].length > 2048) return null
  const exponent = Number(match[3] || 0)
  if (Math.abs(exponent) > 1000) return null
  const [whole, decimals = ''] = match[2].replace(',', '.').split('.')
  let numerator = BigInt((whole || '0') + decimals) * (match[1] === '-' ? -1n : 1n)
  const scale = decimals.length - exponent
  if (scale < 0) numerator *= 10n ** BigInt(-scale)
  return { numerator, denominator: scale > 0 ? 10n ** BigInt(scale) : 1n }
}
export function numericEqual(left, right, tolerance = '0') {
  const a = parseNumeric(left), b = parseNumeric(right), t = parseNumeric(tolerance)
  if (!a || !b || !t || t.numerator < 0n) return false
  const difference = a.numerator * b.denominator - b.numerator * a.denominator
  return (difference < 0n ? -difference : difference) * t.denominator <= t.numerator * a.denominator * b.denominator
}
