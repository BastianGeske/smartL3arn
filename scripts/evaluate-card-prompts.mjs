// Explicit, resumable benchmark. Uses only the synthetic source texts in cases.json.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeDeck } from '../shared/data-validation.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(root, process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length) || process.env.PROMPT_EVAL_OUTPUT || 'design-evidence/prompt-quality')
const requestedVariant = process.argv.find(arg => arg.startsWith('--variant='))?.split('=')[1]
if (requestedVariant && !['baseline', 'revised'].includes(requestedVariant)) throw new Error('Invalid variant')
const cases = JSON.parse(await fs.readFile(path.join(root, 'docs/prompt-quality/cases.json'), 'utf8'))
if (!process.argv.includes('--run')) { console.log('Use --run to send the six synthetic cases, three times per prompt, through the configured OpenRouter model.'); process.exit(0) }
const model = process.env.OPENROUTER_MODEL
if (!model || !process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_MODEL and OPENROUTER_API_KEY must be configured.')
await fs.mkdir(output, { recursive: true })
const snapshots = {}
for (const variant of ['baseline', 'revised']) {
 const snapshot = path.join(output, `${variant}.md`)
 try { snapshots[variant] = await fs.readFile(snapshot, 'utf8') }
 catch { throw new Error(`Create the frozen ${variant}.md prompt snapshot in ${output} first.`) }
}
let failed = false
for (const sample of cases) for (const variant of requestedVariant ? [requestedVariant] : ['baseline', 'revised']) for (let run = 1; run <= 3; run++) {
 const filename = path.join(output, `${sample.id}-${variant}-${run}.json`)
 try { await fs.access(filename); continue } catch {}
 const match = snapshots[variant].match(/```text\n([\s\S]*?)\n```/)
 let prompt = match?.[1] || snapshots[variant]
 const fields = { DECKNAME: sample.id, LERNSTOFF: sample.source, 'ZIELGRUPPE UND LERNZIEL': sample.goal, ANZAHL: String(sample.count), SPRACHE: 'Deutsch', BEWERTUNG: 'Lokal', SCHWERPUNKT: sample.goal }
 for (const [key, value] of Object.entries(fields)) prompt = prompt.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`)
 const start = Date.now()
 let response
 try {
  response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
   method: 'POST', signal: AbortSignal.timeout(120000),
   headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
   body: JSON.stringify({ model, temperature: 0.2, max_tokens: 3500, messages: [{ role: 'user', content: prompt }] }),
  })
 } catch { console.error('Network/timeout failure. Completed cases remain resumable.'); process.exit(2) }
 if (!response.ok) { console.error(`Provider rejected the request (HTTP ${response.status}); no further requests sent.`); process.exit(3) }
 const body = await response.json()
 if (body.error) { console.error('Provider returned an error; no further requests sent.'); process.exit(3) }
 const content = body.choices?.[0]?.message?.content || ''
 let schemaError = null, cards = null
 try { const deck = normalizeDeck(JSON.parse(content), { today: '2026-11-13' }); cards = deck.cards.length; if (!cards || cards > sample.count) throw new Error('Card count outside requested bounds') }
 catch (error) { schemaError = error.message; failed = true }
 await fs.writeFile(filename, JSON.stringify({ case: sample.id, variant, run, requestedModel: model, returnedModel: body.model, temperature: 0.2, maxTokens: 3500, date: new Date().toISOString(), elapsedMs: Date.now() - start, usage: body.usage, finishReason: body.choices?.[0]?.finish_reason, cards, schemaError, content }, null, 2))
 console.log(`${sample.id}/${variant}/${run}: ${schemaError ? 'schema/count failed' : `${cards} cards, schema passed`}`)
}
process.exitCode = failed ? 1 : 0
