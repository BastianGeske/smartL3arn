import type { TaskDefinition, StudyResponse } from '../src/domain/types'

export interface Criterion { id: string; description: string }
export interface WrittenCheck {
  input?: 'text' | 'code' | 'formula'; language?: string
  practiceOnly?: boolean; question: string; reference: string; criteria: Criterion[]
  paraphrase: string; partial: string; misconception: string
}
export interface Activity {
  id: string; question: string; task: TaskDefinition; hint: string; solution: string; feedback: string
  skillGroup?: string
  written?: WrittenCheck
}
export interface Objective {
  id: string; goal: string; evidence: string; source: string; explanation: string; example: string
  opening?: { question: string; answer: string }; reviewChecks?: Activity[]
  requiredEvidence?: 'code'; contrastGroup?: string
  practice: Activity; checks: Activity[]
  practiceExtras?: Activity[]
  selfCheckSize?: number
}
export interface Chapter { id: string; title: string; objectives: Objective[] }
export interface ReviewCard { id: string; objectiveId: string; front: string; back: string }
export interface LearningPath {
  format: 'smartL3arn.learningPath'; schemaVersion: 1; id: string; version: number; title: string
  chapters: Chapter[]; reviewCards: ReviewCard[]
}
export interface ObjectiveReview {
  objectiveId: string; dueDate: string; seen: string[]; exposureKnown?: boolean; learnedOn?: string
  lastReview?: string; stability?: number; difficulty?: number; repetitions?: number
  lastResult?: 'independent' | 'missed' | 'assisted'; gapDays?: number
  lastCase?: 'new' | 'repeat' | 'lesson'
  retention?: 'confirmed' | 'reinforce'; confirmedOn?: string
}
export interface ReviewSession {
  queue: string[]; activityId: string; draft: StudyResponse
  hintRevealed?: boolean
  caseType: 'new' | 'repeat' | 'lesson'; assisted: boolean; retry: boolean
  outcome: 'open' | 'correct' | 'incorrect'
  revealed?: true
}
export interface PathAnswerResult {
  activityId: string
  verdict: 'correct' | 'partial' | 'incorrect' | 'revealed'
  assisted: boolean
  response?: StudyResponse
  prose?: string
  criteria?: { id: string; status: 'satisfied' | 'missing' | 'unclear'; reason: string }[]
}
export interface SelfCheckRound {
  queue: string[]
  repeated: string[]
  answers: PathAnswerResult[]
}
export interface ObjectiveStep { phase: 'lesson' | 'practice' | 'check'; variant: number
  help: 'none' | 'hint' | 'lesson' | 'solution'; outcome: 'open' | 'retry' | 'next'
  mode: 'local' | 'written'; prose: string; draft?: StudyResponse; feedback: string; seenChecks?: string[]
  orderingInput?: 'construct'
  result?: PathAnswerResult
  selfCheck?: SelfCheckRound
  practiceAnswers?: PathAnswerResult[]
}
export interface Progress extends ObjectiveStep {
  contacts?: { objectiveId: string; at: number; day: string; kind: 'lesson' | 'solution' | 'practice' | 'feedback' }[]
  attempts?: { objectiveId: string; at: number; day: string; phase: 'practice' | 'check' | 'review'; attempt: number; result: PathAnswerResult }[]
  roundHistory?: { objectiveId: string; round: SelfCheckRound }[]
  gaps?: { objectiveId: string; group: string }[]
  codeValidations?: { activityId: string; model: string; fingerprint: string }[]
  passed: string[]; attempt: number; transferred: string[]; practiceOnly: string[]
  reviews?: ObjectiveReview[]; reviewSession?: ReviewSession
  activeObjectiveId?: string
  pausedObjectives?: { objectiveId: string; step: ObjectiveStep }[]
  practiceDrafts?: { activityId: string; draft: StudyResponse }[]
  lastPass?: { objectiveId: string; feedback: string; result?: PathAnswerResult }
  completedChecks?: { objectiveId: string; round: SelfCheckRound }[]
}
export interface SavedPath { content: LearningPath; progress: Progress }
export function missingSource(value: unknown): string[] | null
export function normalizePath(value: unknown): LearningPath
export function normalizePaths(value: unknown): SavedPath[]
export function normalizePathDraft(row: SavedPath, value: unknown): Required<Pick<Progress, 'prose' | 'draft'>>
export function freshProgress(): Progress
export function pathKey(path: Pick<LearningPath,'id'|'version'>): string
export function normalizeReviewDraft(row: SavedPath, value: unknown): StudyResponse
export function freshStep(): ObjectiveStep
export function currentObjective(goals: Objective[], progress: Pick<Progress, 'passed' | 'activeObjectiveId'>): Objective | undefined
export function normalizePracticeDraft(row: SavedPath, activityId: string, value: unknown): StudyResponse
export function practiceCases(goal: Objective): Activity[]
export function stepActivity(goal: Objective | undefined, phase: ObjectiveStep['phase'], variant: number): Activity | undefined
export function selfCheckRequired(size: number): number
export function selfCheckScore(round: SelfCheckRound): number
