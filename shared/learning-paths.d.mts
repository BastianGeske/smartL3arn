import type { TaskDefinition, StudyResponse } from '../src/domain/types'

export interface Criterion { id: string; description: string }
export interface WrittenCheck {
  practiceOnly?: boolean; question: string; reference: string; criteria: Criterion[]
  paraphrase: string; partial: string; misconception: string
}
export interface Activity {
  id: string; question: string; task: TaskDefinition; hint: string; solution: string; feedback: string
  written?: WrittenCheck
}
export interface Objective {
  id: string; goal: string; evidence: string; source: string; explanation: string; example: string
  practice: Activity; checks: Activity[]
}
export interface Chapter { id: string; title: string; objectives: Objective[] }
export interface ReviewCard { id: string; objectiveId: string; front: string; back: string }
export interface LearningPath {
  format: 'smartL3arn.learningPath'; schemaVersion: 1; id: string; version: number; title: string
  chapters: Chapter[]; reviewCards: ReviewCard[]
}
export interface Progress {
  passed: string[]; phase: 'lesson' | 'practice' | 'check'; variant: number; attempt: number
  help: 'none' | 'hint' | 'lesson' | 'solution'; outcome: 'open' | 'retry' | 'next'
  mode: 'local' | 'written'; prose: string; draft?: StudyResponse; feedback: string; transferred: string[]; practiceOnly: string[]
  orderingInput?: 'construct'
}
export interface SavedPath { content: LearningPath; progress: Progress }
export function missingSource(value: unknown): string[] | null
export function normalizePath(value: unknown): LearningPath
export function normalizePaths(value: unknown): SavedPath[]
export function normalizePathDraft(row: SavedPath, value: unknown): Required<Pick<Progress, 'prose' | 'draft'>>
export function freshProgress(): Progress
export function pathKey(path: Pick<LearningPath,'id'|'version'>): string
