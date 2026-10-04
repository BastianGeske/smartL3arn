'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')

const EVENTS = new Set([
  'configuration', 'request-start', 'response-headers', 'response-body',
  'request-success', 'request-failure', 'evaluation-skipped', 'credential-failure',
])
const REASONS = new Set([
  'auth', 'forbidden', 'credits', 'rate-limit', 'timeout', 'invalid-response',
  'invalid-input', 'unavailable', 'model-unavailable', 'not-configured', 'secure-storage-unavailable',
])
const API_ERROR_TYPES = new Set([
  'authentication', 'permission_denied', 'payment_required', 'rate_limit_exceeded',
  'provider_overloaded', 'provider_unavailable', 'timeout', 'server', 'unmapped',
  'context_length_exceeded', 'max_tokens_exceeded', 'token_limit_exceeded', 'string_too_long',
  'invalid_request', 'invalid_prompt', 'not_found', 'precondition_failed',
  'payload_too_large', 'unprocessable', 'content_policy_violation', 'refusal',
])
const NETWORK_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'UND_ERR_ABORTED', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])

function safeIdentifier(value, pattern) {
  return typeof value === 'string' && pattern.test(value) && !/sk-|bearer/i.test(value)
}

// Whitelist fields and values. Never persist arbitrary errors, headers, or response bodies.
function sanitizeDiagnostic(entry = {}) {
  const result = {}
  const enumerations = {
    event: EVENTS,
    reason: REASONS,
    operation: new Set(['validate-key', 'evaluate']),
    method: new Set(['GET', 'POST']),
    phase: new Set(['connect', 'read-body', 'parse-evaluation']),
    credentialSource: new Set(['environment', 'bundled', 'stored', 'provided', null]),
    apiErrorType: API_ERROR_TYPES,
    networkCode: NETWORK_CODES,
    finishReason: new Set(['stop', 'length', 'content_filter', 'error', 'tool_calls']),
    endpoint: new Set([
      'https://openrouter.ai/api/v1/key',
      'https://openrouter.ai/api/v1/chat/completions',
    ]),
  }
  for (const [field, allowed] of Object.entries(enumerations)) {
    if (allowed.has(entry[field])) result[field] = entry[field]
  }
  for (const field of ['durationMs', 'timeoutMs', 'retryAfterMs']) {
    if (Number.isSafeInteger(entry[field]) && entry[field] >= 0) result[field] = entry[field]
  }
  for (const field of ['status', 'apiErrorCode']) {
    if (Number.isInteger(entry[field]) && entry[field] >= 100 && entry[field] <= 599) {
      result[field] = entry[field]
    }
  }
  if (typeof entry.configured === 'boolean') result.configured = entry.configured
  if (safeIdentifier(entry.model, /^[a-zA-Z0-9~._:-]+\/[a-zA-Z0-9~./:_-]{1,180}$/)) {
    result.model = entry.model
  }
  if (safeIdentifier(entry.appVersion, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]{1,40})?$/)) {
    result.appVersion = entry.appVersion
  }
  if (safeIdentifier(entry.requestId, /^[a-f0-9-]{36}$/)) result.requestId = entry.requestId
  if (safeIdentifier(entry.generationId, /^gen-[a-zA-Z0-9_-]{1,120}$/)) {
    result.generationId = entry.generationId
  }
  return result
}

function createDiagnosticStore(filePath, { appVersion, maxBytes = 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024) throw new Error('Invalid log size.')
  const previousPath = `${filePath}.1`
  let writes = Promise.resolve()
  let persistenceError = false

  function record(entry) {
    const safeEntry = {
      timestamp: new Date().toISOString(),
      ...sanitizeDiagnostic({ ...entry, appVersion }),
    }
    const line = `${JSON.stringify(safeEntry)}\n`
    const task = writes.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      let size = 0
      try {
        size = (await fs.stat(filePath)).size
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (size && size + Buffer.byteLength(line) > maxBytes) {
        await fs.unlink(previousPath).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
        await fs.rename(filePath, previousPath)
      }
      await fs.appendFile(filePath, line, { mode: 0o600 })
      persistenceError = false
    })
    writes = task.catch(() => { persistenceError = true })
    return task
  }

  function snapshot() {
    // Queue the read too, so rotation cannot race with an export.
    const task = writes.then(async () => {
      const records = []
      for (const target of [previousPath, filePath]) {
        let raw
        try {
          raw = await fs.readFile(target, 'utf8')
        } catch (error) {
          if (error.code === 'ENOENT') continue
          throw error
        }
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue
          try {
            const entry = JSON.parse(line)
            if (!entry || !Number.isFinite(Date.parse(entry.timestamp))) continue
            // Apply the whitelist again when exporting an existing file.
            records.push(JSON.stringify({
              timestamp: new Date(entry.timestamp).toISOString(),
              ...sanitizeDiagnostic(entry),
            }))
          } catch { /* Ignore incomplete or malformed lines after an interrupted write. */ }
        }
      }
      return {
        filename: `smartL3arn-openrouter-${new Date().toISOString().slice(0, 10)}.jsonl`,
        content: records.length ? `${records.join('\n')}\n` : '',
        persistenceError,
      }
    })
    writes = task.catch(() => {})
    return task
  }

  return { record, snapshot, flush: () => writes }
}

module.exports = { createDiagnosticStore, sanitizeDiagnostic }
