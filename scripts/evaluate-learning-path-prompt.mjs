// Optional provider check with synthetic material and the worked percentage example.
import { readFile } from 'node:fs/promises'
import { missingSource, normalizePath } from '../shared/learning-paths.mjs'
import openRouter from '../electron/openrouter.cjs'

const prompt = await readFile(new URL('../docs/learning-path-prompt.md', import.meta.url), 'utf8')
const sample = normalizePath(JSON.parse(await readFile(new URL('../docs/learning-path.example.json', import.meta.url), 'utf8')))
const cases = [
  { name: 'Prozentrechnung', source: 'Ein Prozent ist ein Hundertstel des Grundwerts. Prozentwert = Grundwert × Prozentsatz / 100. Bei einer Änderung ist der jeweilige Ausgangswert der Grundwert. Ein Preis fällt von 80 auf 60 Euro und steigt zurück auf 80 Euro.' },
  { name: 'Fakten und Werturteile', source: 'Eine Tatsachenbehauptung lässt sich anhand von Beobachtungen überprüfen, auch wenn sie falsch ist. Ein Werturteil bewertet etwas anhand eines Maßstabs. „Die Halle hat 300 Plätze“ ist überprüfbar. „Die Halle ist gemütlich“ drückt eine Bewertung aus.' },
  { name: 'Fehlendes Material', source: 'Lerne Kapitel vier aus meinem Skript. Das Skript und das Thema fehlen.', insufficient: true },
]
if (!process.argv.includes('--run')) {
  console.log('Local sample validated. Use --run for three generation requests and three rubric evaluations using synthetic data.')
  process.exit(0)
}
const { OPENROUTER_MODEL: model, OPENROUTER_API_KEY: apiKey } = process.env
if (!model || !apiKey) throw new Error('Configure OPENROUTER_MODEL and OPENROUTER_API_KEY for the live check.')
for (const item of cases) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({model, temperature: 0.2, max_tokens: 10000,
      messages: [{role: 'user', content: prompt.replace('[Hier Material einfügen]', item.source)}]}),
  })
  if (!response.ok) throw new Error('Provider request failed: HTTP ' + response.status)
  const body = await response.json()
  const output = JSON.parse(body.choices?.[0]?.message?.content)
  if (item.insufficient) {
    if (!missingSource(output)) throw new Error('Missing material produced an unsupported path.')
  } else normalizePath(output)
  console.log(item.name + ' passed the expected import contract.')
}
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
