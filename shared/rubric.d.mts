import type { Criterion } from './learning-paths.mjs'
export interface CriterionResult { id: string; status: 'satisfied' | 'missing' | 'unclear'; reason: string }
export function validCriteria(value: unknown): value is Criterion[]
export function criterionResults(value: unknown, expected: Criterion[]): CriterionResult[] | null
