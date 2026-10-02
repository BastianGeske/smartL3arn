'use strict'

const fs = require('node:fs')
const path = require('node:path')

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function extractUsage(body) {
  const usage = body?.usage
  const inputTokens = count(usage?.prompt_tokens)
  const outputTokens = count(usage?.completion_tokens)
  return {
    inputTokens,
    outputTokens,
    totalTokens: count(usage?.total_tokens) ?? (
      inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
    ),
    cachedTokens: count(usage?.prompt_tokens_details?.cached_tokens),
    reasoningTokens: count(usage?.completion_tokens_details?.reasoning_tokens),
    costUsd: typeof usage?.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0
      ? usage.cost : null,
  }
}

function emptyTotals() {
  return {
    requests: 0, successes: 0, failures: 0,
    inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, reasoningTokens: 0,
    tokenRequests: 0, costRequests: 0, costUsd: 0,
  }
}

function summarizeUsage(entries) {
  const groups = new Map()
  for (const entry of entries) {
    // Group in the user's local calendar day, not UTC.
    const date = new Date(entry.timestamp)
    if (!Number.isFinite(date.getTime()) || typeof entry.model !== 'string') continue
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const key = JSON.stringify([day, entry.model])
    if (!groups.has(key)) groups.set(key, { day, model: entry.model, ...emptyTotals() })
    const group = groups.get(key)
    group.requests++
    if (entry.outcome === 'success') group.successes++
    else group.failures++
    for (const field of ['inputTokens', 'outputTokens', 'totalTokens', 'cachedTokens', 'reasoningTokens']) {
      group[field] += count(entry[field]) ?? 0
    }
    if (count(entry.inputTokens) !== null && count(entry.outputTokens) !== null) group.tokenRequests++
    if (typeof entry.costUsd === 'number' && Number.isFinite(entry.costUsd) && entry.costUsd >= 0) {
      group.costRequests++
      group.costUsd += entry.costUsd
    }
  }
  return [...groups.values()].sort((a, b) => b.day.localeCompare(a.day) || a.model.localeCompare(b.model))
}

function createUsageStore(filePath) {
  let writes = Promise.resolve()
  let persistenceError = false

  function record(entry) {
    const task = writes.then(async () => {
      // Deliberately whitelist metadata; card content and credentials never enter the journal.
      const record = {
        timestamp: new Date().toISOString(),
        model: entry.model,
        outcome: entry.outcome,
        ...extractUsage({ usage: entry.usage }),
      }
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      await fs.promises.appendFile(filePath, `${JSON.stringify(record)}\n`, { mode: 0o600 })
      persistenceError = false
    })
    writes = task.catch(() => { persistenceError = true })
    return task
  }

  async function report() {
    await writes
    let raw
    try {
      raw = await fs.promises.readFile(filePath, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      raw = ''
    }
    const entries = []
    let unreadableEntries = 0
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line)
        if (!entry || typeof entry.model !== 'string' || !Number.isFinite(Date.parse(entry.timestamp))) {
          unreadableEntries++
          continue
        }
        entries.push(entry)
      } catch {
        unreadableEntries++
      }
    }
    return { groups: summarizeUsage(entries), persistenceError, unreadableEntries }
  }

  return { record, report }
}

module.exports = { extractUsage, summarizeUsage, createUsageStore }
