import { addDaysToIsoDate, daysBetweenIsoDates, todayStr } from '../dates'
import type { Card, Rating } from '../types'

const FSRS_W = [
  0.40255, 1.18385, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.06164,
  1.4654, 0.1649, 1.031, 1.9395, 0.11505, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
]
const FSRS_DECAY = -0.5
const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1
const DESIRED_RETENTION = 0.9

export function fsrsInterval(stability: number): number {
  return Math.max(
    1,
    Math.round(
      stability / FSRS_FACTOR
      * (Math.pow(DESIRED_RETENTION, 1 / FSRS_DECAY) - 1),
    ),
  )
}

export function fsrsRetrievability(daysSince: number, stability: number): number {
  if (!stability || daysSince <= 0) return 1
  return Math.pow(1 + FSRS_FACTOR * daysSince / stability, FSRS_DECAY)
}

export function fsrsInitDifficulty(grade: number): number {
  return Math.min(10, Math.max(1, FSRS_W[4] - Math.exp(FSRS_W[5] * (grade - 1)) + 1))
}

export function fsrsNextDifficulty(difficulty: number, grade: number): number {
  const nextDifficulty = difficulty - FSRS_W[6] * (grade - 3)
  const initialEasyDifficulty = fsrsInitDifficulty(4)
  return Math.min(
    10,
    Math.max(1, FSRS_W[7] * initialEasyDifficulty + (1 - FSRS_W[7]) * nextDifficulty),
  )
}

export function fsrsNextStabilityRecall(
  difficulty: number,
  stability: number,
  retrievability: number,
  grade: number,
): number {
  const hardPenalty = grade === 2 ? FSRS_W[15] : 1
  const easyBonus = grade === 4 ? FSRS_W[16] : 1
  return stability
    * Math.exp(FSRS_W[8])
    * (11 - difficulty)
    * Math.pow(stability, -FSRS_W[9])
    * (Math.exp((1 - retrievability) * FSRS_W[10]) - 1)
    * hardPenalty
    * easyBonus
    + stability
}

export function fsrsNextStabilityForget(
  difficulty: number,
  stability: number,
  retrievability: number,
): number {
  return FSRS_W[11]
    * Math.pow(difficulty, -FSRS_W[12])
    * (Math.pow(stability + 1, FSRS_W[13]) - 1)
    * Math.exp((1 - retrievability) * FSRS_W[14])
}

export function scheduleCard(card: Card, rating: Rating, today = todayStr()): Card {
  const grade = rating + 1
  const daysSince = card.lastReview
    ? Math.max(0, daysBetweenIsoDates(card.lastReview, today))
    : 0
  const retrievability = card.stability
    ? fsrsRetrievability(daysSince, card.stability)
    : 1

  let stability: number
  let difficulty: number
  if (!card.stability) {
    stability = FSRS_W[grade - 1]
    difficulty = fsrsInitDifficulty(grade)
  } else {
    difficulty = fsrsNextDifficulty(card.difficulty ?? 5, grade)
    stability = grade === 1
      ? fsrsNextStabilityForget(card.difficulty ?? 5, card.stability, retrievability)
      : fsrsNextStabilityRecall(card.difficulty ?? 5, card.stability, retrievability, grade)
  }

  stability = Math.max(0.1, stability)
  const interval = grade === 1 ? 1 : fsrsInterval(stability)
  return {
    ...card,
    stability: Number(stability.toFixed(4)),
    difficulty: Number(difficulty.toFixed(4)),
    interval,
    dueDate: addDaysToIsoDate(today, interval),
    lastReview: today,
    repetitions: grade === 1 ? 0 : (card.repetitions || 0) + 1,
    easeFactor: card.easeFactor || 2.5,
  }
}

export function previewIntervals(card: Card, today = todayStr()): string[] {
  const daysSince = card.lastReview
    ? Math.max(0, daysBetweenIsoDates(card.lastReview, today))
    : 0
  const retrievability = card.stability
    ? fsrsRetrievability(daysSince, card.stability)
    : 1

  if (!card.stability) return ['1d', '1d', '1d', '4d']

  return [1, 2, 3, 4].map((grade) => {
    if (grade === 1) return '1d'
    const stability = Math.max(
      0.1,
      fsrsNextStabilityRecall(
        card.difficulty ?? 5,
        card.stability as number,
        retrievability,
        grade,
      ),
    )
    return formatInterval(fsrsInterval(stability))
  })
}

function formatInterval(days: number): string {
  if (days < 30) return `${days}d`
  return `${Math.round(days / 30)}mo`
}
