// Optional provider check with synthetic material and the worked percentage example.
import { readFile } from 'node:fs/promises'
import { missingSource, normalizePath } from '../shared/learning-paths.mjs'
import openRouter from '../electron/openrouter.cjs'

const prompt = await readFile(new URL('../docs/learning-path-prompt.md', import.meta.url), 'utf8')
const sample = normalizePath(JSON.parse(await readFile(new URL('../docs/learning-path.example.json', import.meta.url), 'utf8')))
const baseline = await readFile(new URL('../docs/prompt-quality/learning-path-baseline.md', import.meta.url), 'utf8')
const cases = [
  { name: 'Signalbuch', source: 'Im fiktiven Hafenhandbuch steht Karo für eine Tiefenmessung und Ring für eine Temperaturmessung. Das Zeichen bezeichnet die Art der Messung unabhängig vom Zahlenwert. Im Journal werden Zeichen und Wert gemeinsam eingetragen.' },
  { name: 'Prozentrechnung', source: 'Ein Prozent ist ein Hundertstel des Grundwerts. Prozentwert = Grundwert × Prozentsatz / 100. Bei einer Änderung ist der jeweilige Ausgangswert der Grundwert. Ein Preis fällt von 80 auf 60 Euro und steigt zurück auf 80 Euro.' },
  { name: 'Fakten und Werturteile', source: 'Eine Tatsachenbehauptung lässt sich anhand von Beobachtungen überprüfen, auch wenn sie falsch ist. Ein Werturteil bewertet etwas anhand eines Maßstabs. „Die Halle hat 300 Plätze“ ist überprüfbar. „Die Halle ist gemütlich“ drückt eine Bewertung aus.' },
  { name: 'Fehlendes Material', source: 'Lerne Kapitel vier aus meinem Skript. Das Skript und das Thema fehlen.', insufficient: true },
]
if (!process.argv.includes('--run')) {
  console.log('Local sample validated. Use --run to compare baseline and revised generations on four synthetic sources, then check their quality and the sample written rubric.')
  process.exit(0)
}
const { OPENROUTER_MODEL: model, OPENROUTER_API_KEY: apiKey } = process.env
if (!model || !apiKey) throw new Error('Configure OPENROUTER_MODEL and OPENROUTER_API_KEY for the live check.')
async function generate(message, maxTokens) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({model, reasoning: {effort: 'low'}, temperature: 0.2, max_tokens: maxTokens, response_format: {type:'json_object'},
      messages: [{role:'user', content:message}]}),
  })
  if (!response.ok) throw new Error('Provider request failed: HTTP ' + response.status)
  const body = await response.json()
  const choice = body.choices?.[0]
  if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) {
    throw new Error('Provider returned no JSON (' + (choice?.finish_reason ?? 'unknown finish reason') + ').')
  }
  return JSON.parse(choice.message.content)
}
const criteria = ['sourceFidelity', 'answerAccuracy', 'scaffolding', 'noAnswerLeakage', 'freshTransfer']
const onlyCase = process.argv.find(arg => arg.startsWith('--case='))?.slice(7)
if (onlyCase && !cases.some(item => item.name === onlyCase)) throw new Error('Unknown evaluation case.')
async function evaluateCase(item) {
  for (const [label, authoring] of [['baseline', baseline], ['revised', prompt]]) {
    if (label === 'baseline' && process.argv.includes('--revised-only')) continue
    try {
      const output = await generate(authoring.replace('[Hier Material einfügen]', item.source), 14000)
      if (item.insufficient) {
        if (!missingSource(output)) throw new Error('Expected a request for missing material.')
      } else {
        const path = normalizePath(output)
        const assessment = await generate(
          'Evaluate this generated path against its source. Independently solve the tasks and inspect the answers. '
          + 'Check that all claims follow from the source, all answers are correct, scaffolding fits the skill, and prompts do not leak the answer. '
          + 'For freshTransfer require a self-contained reserved review case for each objective that changes the application or reasoning beyond superficial rewording. '
          + 'Return JSON with boolean fields ' + criteria.join(', ') + ' and a short reason for any failure. '
          + JSON.stringify({source:item.source, path}), 4000)
        if (!path.chapters.every(c => c.objectives.every(o => o.reviewChecks?.length))) assessment.freshTransfer = false
        console.log(item.name, label, JSON.stringify(assessment))
        if (criteria.some(k => assessment[k] !== true)) throw new Error('Quality criteria incomplete.')
      }
      console.log(item.name, label, 'passed')
    } catch (error) {
      console.error(item.name, label, error.message)
      if (label === 'revised') process.exitCode = 1
    }
  }
}
await Promise.all(cases.filter(item => !onlyCase || item.name === onlyCase).map(evaluateCase))
if (onlyCase) process.exit(process.exitCode ?? 0)
const client = openRouter.createOpenRouterClient({model})
const check = sample.chapters[1].objectives[0].checks[0].written
for (const [kind, accepted] of [['paraphrase',true],['partial',false],['misconception',false]]) {
  const response = await client.evaluate(apiKey, {deckName:sample.title, question:check.question,
    referenceAnswer:check.reference, criteria:check.criteria, userAnswer:check[kind], evaluationScope:'criteria', language:'de'})
  const passed = response.criteria.every(c => c.status === 'satisfied')
  console.log(kind, response.criteria.map(c => c.id + '=' + c.status).join(', '))
  if (passed !== accepted) {
    console.error('Rubric disagrees with the expected evidence. Mark this written variant practiceOnly until revised.')
    process.exitCode = 1
  }
}
