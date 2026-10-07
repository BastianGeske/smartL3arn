import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import ApiUsageView from './ApiUsageView.vue'
import { setLanguage } from '../i18n'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '../stores/ui'

const ai = vi.hoisted(() => ({ getApiUsage: vi.fn(), getAiStatus: vi.fn(), getAiDiagnostics: vi.fn() }))
const saveExport = vi.hoisted(() => vi.fn())
vi.mock('../services/ai', () => ({ getAiBridge: () => ai }))
vi.mock('../services/native', () => ({ saveExport }))

const report = { model: 'configured/model', persistenceError: false, unreadableEntries: 0, groups: [{
  day: '2026-10-04', model: 'actual/model', requests: 3, successes: 1, failures: 2,
  inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedTokens: 50, reasoningTokens: 10,
  tokenRequests: 1, costRequests: 2, costUsd: 0.003,
}] }
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  setLanguage('en')
  ai.getApiUsage.mockResolvedValue(report)
  ai.getAiStatus.mockResolvedValue({ available: true, configured: true, credentialSource: 'bundled' })
  ai.getAiDiagnostics.mockResolvedValue({ filename: 'logs.jsonl', content: '{"reason":"timeout"}\n', persistenceError: false })
  saveExport.mockResolvedValue(undefined)
})

describe('API usage through the shared native/desktop bridge', () => {
  it('does not report success or failure when sharing is cancelled', async () => {
    saveExport.mockResolvedValue('cancelled')
    const view = shallowMount(ApiUsageView)
    await flushPromises()
    await view.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(useUiStore().notifications).toHaveLength(0)
    expect(view.text()).not.toContain('Connection logs exported.')
    view.unmount()
  })
  it('reports log export failures as an action notification', async () => {
    saveExport.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR'))
    const view = shallowMount(ApiUsageView)
    await flushPromises()
    await view.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(useUiStore().notifications).toMatchObject([{ kind: 'error', key: 'usage.logsError' }])
    expect(view.text()).not.toContain('PRIVATE_PROVIDER_ERROR')
    view.unmount()
  })
  it('shows native usage, actual model, credential source and device-only scope', async () => {
    const view = shallowMount(ApiUsageView)
    await flushPromises()
    expect(ai.getApiUsage).toHaveBeenCalledOnce()
    expect(view.text()).toContain('configured/model')
    expect(view.text()).toContain('actual/model')
    expect(view.text()).toContain('key included with this app')
    expect(view.text()).toContain('not an account balance')
    expect(view.text()).toContain('2 failed')
    expect(view.findAll('tbody td')).toHaveLength(6)
    expect(view.find('tbody td').attributes('data-label')).toBe('Day')
    view.unmount()
  })
  it('exports native connection logs via the platform export service', async () => {
    const view = shallowMount(ApiUsageView)
    await flushPromises()
    await view.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(saveExport).toHaveBeenCalledWith('logs.jsonl', '{"reason":"timeout"}\n', 'application/x-ndjson')
    view.unmount()
  })
  it('shows persistence warnings and never substitutes unknown costs with zero', async () => {
    ai.getApiUsage.mockResolvedValue({ ...report, persistenceError: true, groups: [{ ...report.groups[0], costRequests: 0, costUsd: 0 }] })
    const view = shallowMount(ApiUsageView)
    await flushPromises()
    expect(view.text()).toContain('record is incomplete')
    expect(view.text()).toContain('No cost data yet')
    expect(view.findAll('tbody td')[5]!.text()).toContain('—')
    view.unmount()
  })
  it('shows retryable loading errors', async () => {
    ai.getApiUsage.mockRejectedValue(new Error('offline'))
    const view = shallowMount(ApiUsageView)
    await flushPromises()
    expect(view.text()).toContain('could not be loaded')
    ai.getApiUsage.mockResolvedValue(report)
    await view.findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(view.text()).toContain('actual/model')
    view.unmount()
  })
})
