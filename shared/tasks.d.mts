export interface WorkingStep { kind: 'text' | 'math'; value: string }
export interface TaskItem { id: string; text: string }
export type CalculationAnswer =
  | { kind: 'number'; value: string; tolerance?: string }
  | { kind: 'fraction'; numerator: string; denominator: string }
  | { kind: 'quantity'; pairs: { value: string; unit: string }[]; tolerance?: string }
  | { kind: 'formula'; value: string }
type TaskBase = { explanation?: string }
export type TaskDefinition = TaskBase & (
  | { kind: 'short_text' }
  | { kind: 'long_text' }
  | { kind: 'calculation'; answer: CalculationAnswer; solutionSteps?: WorkingStep[] }
  | { kind: 'single_choice'; options: TaskItem[]; correctIds: string[] }
  | { kind: 'multiple_choice'; options: TaskItem[]; correctIds: string[] }
  | { kind: 'true_false'; correct: boolean }
  | { kind: 'cloze'; gaps: { id: string; kind: 'text' | 'number'; answer: string; alternatives?: string[] }[] }
  | { kind: 'matching'; pairs: { id: string; left: string; right: string }[] }
  | { kind: 'ordering'; items: TaskItem[]; correctOrder: string[] }
)
export type TaskKind = TaskDefinition['kind']
export class TaskValidationError extends Error { code: 'invalid' | 'unknownType' | 'invalidMath' | 'missingGaps' }
export function normalizeTask(value: unknown, front: string): TaskDefinition
export function taskSolution(task: TaskDefinition, front: string): string | null
export function parseNumeric(value: string): { numerator: bigint; denominator: bigint } | null
export function numericEqual(left: string, right: string, tolerance?: string): boolean
export function fractionValue(numerator: string, denominator: string): string | null
