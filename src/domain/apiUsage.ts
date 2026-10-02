export interface ApiUsageTotals {
  requests: number
  successes: number
  failures: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedTokens: number
  reasoningTokens: number
  tokenRequests: number
  costRequests: number
  costUsd: number
}

export interface ApiUsageGroup extends ApiUsageTotals {
  day: string
  model: string
}

export interface ApiUsageReport {
  model: string
  groups: ApiUsageGroup[]
  persistenceError: boolean
  unreadableEntries: number
}

export function sumApiUsage(groups: ApiUsageGroup[]): ApiUsageTotals {
  const result: ApiUsageTotals = {
    requests: 0, successes: 0, failures: 0,
    inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, reasoningTokens: 0,
    tokenRequests: 0, costRequests: 0, costUsd: 0,
  }
  for (const group of groups) {
    for (const key of Object.keys(result) as (keyof ApiUsageTotals)[]) result[key] += group[key]
  }
  return result
}
