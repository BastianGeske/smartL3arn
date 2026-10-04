/// <reference types="vite/client" />

import type { AnswerVerdict, AppData } from './domain/types'
import type { ApiUsageReport } from './domain/apiUsage'

interface AiOperationResult {
  ok: boolean
  reason?: string
}

interface AiEvaluationInput {
  deckName: string
  question: string
  language?: 'en' | 'de'
  referenceAnswer: string
  userAnswer: string
}

interface AiEvaluationResult extends AiOperationResult {
  result?: {
    verdict: AnswerVerdict
    feedback: string
    model?: string
  }
}

declare global {
  interface Window {
    smartL3arn?: {
      loadData: () => Promise<AppData>
      getApiUsage: () => Promise<ApiUsageReport>
      getAiDiagnostics: () => Promise<{
        filename: string
        content: string
        persistenceError: boolean
      }>
      saveData: (data: AppData) => Promise<void>
      getAiStatus: () => Promise<{
        available: boolean
        configured: boolean
        credentialSource: 'environment' | 'bundled' | 'stored' | null
        model?: string
      }>
      saveOpenRouterKey: (apiKey: string) => Promise<AiOperationResult>
      removeOpenRouterKey: () => Promise<AiOperationResult>
      evaluateAnswer: (input: AiEvaluationInput) => Promise<AiEvaluationResult>
    }
  }
}

export {}
