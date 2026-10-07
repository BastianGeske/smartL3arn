'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { syncVersions } = require('../scripts/sync-versions.cjs')

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartl3arn-version-test-'))
  context.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'android/app'), { recursive: true })
  await fs.mkdir(path.join(root, 'ios/App/App.xcodeproj'), { recursive: true })
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.3', nativeBuildNumber: 2 }))
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ version: '1.0.3', packages: { '': { version: '1.0.3' } } }))
  await fs.writeFile(path.join(root, 'android/app/build.gradle'), 'versionCode 1\nversionName "1.0"\n')
  await fs.writeFile(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'MARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\nMARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\n')
  return root
}
test('sync is idempotent and copies shared metadata without a version bump', async context => {
  const root = await fixture(context)
  assert.deepEqual((await syncVersions({ root })).changed, ['android/app/build.gradle', 'ios/App/App.xcodeproj/project.pbxproj'])
  assert.deepEqual((await syncVersions({ root })).changed, [])
  assert.equal((JSON.parse(await fs.readFile(path.join(root, 'package.json')))).version, '1.0.3')
  assert.match(await fs.readFile(path.join(root, 'android/app/build.gradle'), 'utf8'), /versionCode 2\nversionName "1.0.3"/)
  assert.equal((await fs.readFile(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).match(/CURRENT_PROJECT_VERSION = 2;/g).length, 2)
})
test('release preparation increments once and updates the lockfile and both native configurations', async context => {
  const root = await fixture(context)
  const result = await syncVersions({ root, prepare: true })
  assert.equal(result.version, '1.0.4'); assert.equal(result.nativeBuildNumber, 3)
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json')))
  assert.equal(lock.version, '1.0.4'); assert.equal(lock.packages[''].version, '1.0.4')
  assert.deepEqual((await syncVersions({ root })).changed, [])
  assert.match(await fs.readFile(path.join(root, 'android/app/build.gradle'), 'utf8'), /versionCode 3\nversionName "1.0.4"/)
  assert.equal((await fs.readFile(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).match(/MARKETING_VERSION = 1.0.4;/g).length, 2)
})
test('bad native input aborts preparation before any metadata changes', async context => {
  const root = await fixture(context)
  await fs.writeFile(path.join(root, 'android/app/build.gradle'), 'missing version fields')
  const original = await fs.readFile(path.join(root, 'package.json'), 'utf8')
  await assert.rejects(syncVersions({ root, prepare: true }), /Unexpected Android/)
  assert.equal(await fs.readFile(path.join(root, 'package.json'), 'utf8'), original)
})
test('an interrupted write restores all metadata to the previous release', async context => {
  const root = await fixture(context)
  const names = ['package.json', 'package-lock.json', 'android/app/build.gradle', 'ios/App/App.xcodeproj/project.pbxproj']
  const before = await Promise.all(names.map(name => fs.readFile(path.join(root, name), 'utf8')))
  const write = fs.writeFile
  let interrupted = false
  context.mock.method(fs, 'writeFile', async (target, content, ...args) => {
    if (!interrupted && target === path.join(root, 'package-lock.json')) {
      interrupted = true
      await write(target, '{partial')
      throw new Error('Interrupted write')
    }
    return write(target, content, ...args)
  })
  await assert.rejects(syncVersions({ root, prepare: true }), /Interrupted write/)
  assert.deepEqual(await Promise.all(names.map(name => fs.readFile(path.join(root, name), 'utf8'))), before)
})
test('invalid counters and mismatched lockfiles are rejected without changing the native project', async context => {
  const root = await fixture(context)
  const android = await fs.readFile(path.join(root, 'android/app/build.gradle'), 'utf8')
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.3', nativeBuildNumber: 9999 }))
  await assert.rejects(syncVersions({ root, prepare: true }), /exhausted/)
  await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ version: '1.0.2' }))
  await assert.rejects(syncVersions({ root }), /versions differ/)
  assert.equal(await fs.readFile(path.join(root, 'android/app/build.gradle'), 'utf8'), android)
})
test('build:all lifecycle prepares the version once for all targets', async context => {
  const root = await fixture(context)
  const current = JSON.parse(await fs.readFile(path.join(__dirname, '../package.json')))
  const pkg = { version: '1.0.3', nativeBuildNumber: 2, scripts: {
    'prebuild:all': current.scripts['prebuild:all'],
    'release:prepare': current.scripts['release:prepare'],
    'build:all': 'node -e "process.exit(0)"',
  } }
  await fs.mkdir(path.join(root, 'scripts'))
  await fs.copyFile(path.join(__dirname, '../scripts/sync-versions.cjs'), path.join(root, 'scripts/sync-versions.cjs'))
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg))
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:all'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, npm_config_cache: path.join(root, '.npm-cache') },
  })
  assert.equal(result.status, 0, result.stderr)
  const updated = JSON.parse(await fs.readFile(path.join(root, 'package.json')))
  assert.equal(updated.version, '1.0.4'); assert.equal(updated.nativeBuildNumber, 3)
})
