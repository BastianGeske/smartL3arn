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
  answerFormat?: 'text' | 'code' | 'formula'
  codeLanguage?: string
  referenceAnswer: string
  userAnswer: string
  evaluationScope?: 'answer' | 'working' | 'answer_and_working'
  referenceWorking?: string
  userWorking?: string
}

interface AiEvaluationResult extends AiOperationResult {
  result?: {
    verdict: AnswerVerdict
    feedback: string
    model?: string
    working?: { verdict: AnswerVerdict; feedback: string }
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
      testOpenRouterConnection: () => Promise<AiOperationResult>
      saveOpenRouterKey: (apiKey: string) => Promise<AiOperationResult>
      removeOpenRouterKey: () => Promise<AiOperationResult>
      evaluateCriteria?: (input: AiEvaluationInput & { criteria: import('../shared/learning-paths.mjs').Criterion[] }) =>
        Promise<AiOperationResult & { result?: { criteria: import('../shared/rubric.mjs').CriterionResult[] } }>
      evaluateAnswer: (input: AiEvaluationInput) => Promise<AiEvaluationResult>
    }
  }
}

export {}
