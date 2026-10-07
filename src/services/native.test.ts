import { beforeEach, expect, test, vi } from 'vitest'
import { saveExport } from './native'

const native = vi.hoisted(() => ({ writeFile: vi.fn(), getUri: vi.fn(), share: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' }, Filesystem: native }))
vi.mock('@capacitor/share', () => ({ Share: native }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: {}, Style: {} }))
beforeEach(() => {
  vi.resetAllMocks()
  native.writeFile.mockResolvedValue(undefined)
  native.getUri.mockResolvedValue({ uri: 'file:///temporary/export.json' })
  native.share.mockResolvedValue({})
})
test('a completed native export reports completion', async () => {
  await expect(saveExport('backup.json', '{}', 'application/json')).resolves.toBe('exported')
  expect(native.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'backup.json', data: '{}' }))
})
test('cancelling the native share sheet is distinct from an export failure', async () => {
  native.share.mockRejectedValue(new Error('User cancelled sharing'))
  await expect(saveExport('backup.json', '{}', 'application/json')).resolves.toBe('cancelled')
})
test('file system and sharing failures are propagated to the action handler', async () => {
  native.writeFile.mockRejectedValue(new Error('Disk full'))
  await expect(saveExport('backup.json', '{}', 'application/json')).rejects.toThrow('Disk full')
  expect(native.share).not.toHaveBeenCalled()
  native.writeFile.mockResolvedValue(undefined)
  native.share.mockRejectedValue(new Error('Sharing unavailable'))
  await expect(saveExport('backup.json', '{}', 'application/json')).rejects.toThrow('Sharing unavailable')
})
