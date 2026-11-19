import { beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
