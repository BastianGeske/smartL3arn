import type { DeckCoverId } from '../../shared/deck-covers.mjs'
import type { TaskDefinition, WorkingStep } from '../../shared/tasks.mjs'
export type { TaskDefinition, TaskKind, CalculationAnswer, WorkingStep, TaskItem } from '../../shared/tasks.mjs'
export type StudyResponse =
  | { kind: 'text'; value: string }
  | { kind: 'fraction'; numerator: string; denominator: string }
  | { kind: 'quantity'; value: string; unit: string }
  | { kind: 'selection'; ids: string[] }
  | { kind: 'boolean'; value: boolean | null }
  | { kind: 'fields'; values: Record<string, string> }
  | { kind: 'order'; ids: string[] }
export interface ResponsePart { label: string; correct: boolean; expected: string; actual: string }
export type Rating = 0 | 1 | 2 | 3
export type RatingKey = 'again' | 'hard' | 'good' | 'easy'
export type ConfidenceLevel = 'low' | 'medium' | 'high'
export type AnswerVerdict = 'correct' | 'mostly_correct' | 'partially_correct' | 'incorrect'
export type EvaluationMode = 'local' | 'openrouter'

export interface AnswerEvaluation {
  source: 'openrouter' | 'local'
  verdict: AnswerVerdict
  feedback: string
  model?: string
  fallbackReason?: string
  localSimilarity?: number
  parts?: ResponsePart[]
}

export interface SessionStats {
  reviewed: number
  again: number
  hard: number
  good: number
  easy: number
}

export interface StudySession extends SessionStats {
  date: string
  smart?: boolean
}

export interface Elaboration {
  date: string
  text: string
}

export interface CardStats {
  reviews: number
  again: number
  hard: number
  elaborations?: Elaboration[]
  smartNeedsPractice?: boolean
  smartLastGrade?: RatingKey
  smartLastReviewedSession?: number
  smartBlockedUntil?: number
  smartSkipUntilSession?: number
}

export interface Card {
  id: string
  front: string
  back: string
  task?: TaskDefinition
  interval: number
  repetitions: number
  easeFactor: number
  dueDate: string
  stability?: number
  difficulty?: number
  lastReview?: string
}

export interface Deck {
  id: string
  name: string
  coverId?: DeckCoverId
  cards: Card[]
  sessions?: StudySession[]
  cardStats?: Record<string, CardStats>
  smartSessionSeq?: number
}

export interface AppData {
  decks: Deck[]
}

export interface SmartTechniques {
  typeRecall: boolean
  confidenceCheck: boolean
  whyPrompt: boolean
  interleaving: boolean
}

export interface SmartConfig {
  deckIds: string[]
  techniques: SmartTechniques
  duration: number
  evaluationMode: EvaluationMode
}

export interface SmartQueueItem {
  deckId: string
  cardId: string
}

export type SmartMode = 'core' | 'practice'

export interface SmartSessionState {
  queue: SmartQueueItem[]
  mode: SmartMode
  index: number
  phase: 'asking' | 'reviewing' | 'break'
  typedAnswer: string
  response: StudyResponse | null
  working: WorkingStep[]
  workingEvaluation: AnswerEvaluation | null
  selfAssessment: boolean
  evaluation: AnswerEvaluation | null
  isEvaluating: boolean
  confidenceLevel: ConfidenceLevel | null
  elaboration: string
  startTime: number
  durationMs: number
  timeUp: boolean
  sessionStats: SessionStats
  perDeck: Record<string, SessionStats>
  requeues: Record<string, number>
  sessionSaved: boolean
  breakStartTime?: number
  breakDurationMs?: number
  breakDone?: boolean
}

export function emptySessionStats(): SessionStats {
  return { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 }
}

export function ratingKey(rating: Rating): RatingKey {
  return (['again', 'hard', 'good', 'easy'] as const)[rating]
}
