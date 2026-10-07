'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')

function replaceRequired(text, pattern, replacement, count, label) {
  if ([...text.matchAll(pattern)].length !== count) throw new Error(`Unexpected ${label}; no files changed.`)
  return text.replace(pattern, replacement)
}

async function syncVersions({ root = process.cwd(), prepare = false } = {}) {
  const names = ['package.json', 'package-lock.json', 'android/app/build.gradle', 'ios/App/App.xcodeproj/project.pbxproj']
  const originals = await Promise.all(names.map(name => fs.readFile(path.join(root, name), 'utf8')))
  const pkg = JSON.parse(originals[0])
  const lock = JSON.parse(originals[1])
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(pkg.version)
  if (!match || match.slice(1).some(value => !Number.isSafeInteger(Number(value)))) {
    throw new Error('App version must be a stable major.minor.patch version.')
  }
  if (!Number.isSafeInteger(pkg.nativeBuildNumber) || pkg.nativeBuildNumber < 1 || pkg.nativeBuildNumber > 9999) {
    throw new Error('nativeBuildNumber must be an integer between 1 and 9999.')
  }
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error('package.json and package-lock.json versions differ; no files changed.')
  }
  if (prepare) {
    if (pkg.nativeBuildNumber === 9999 || Number(match[3]) === Number.MAX_SAFE_INTEGER) {
      throw new Error('Release version or native build number is exhausted; no files changed.')
    }
    pkg.version = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
    pkg.nativeBuildNumber += 1
    lock.version = pkg.version
    lock.packages[''].version = pkg.version
  }
  const { version, nativeBuildNumber } = pkg
  let android = replaceRequired(originals[2], /\bversionCode\s+\d+/g, `versionCode ${nativeBuildNumber}`, 1, 'Android versionCode')
  android = replaceRequired(android, /\bversionName\s+"[^"]+"/g, `versionName "${version}"`, 1, 'Android versionName')
  let ios = replaceRequired(originals[3], /\bMARKETING_VERSION\s*=\s*[^;]+;/g, `MARKETING_VERSION = ${version};`, 2, 'iOS marketing versions')
  ios = replaceRequired(ios, /\bCURRENT_PROJECT_VERSION\s*=\s*[^;]+;/g, `CURRENT_PROJECT_VERSION = ${nativeBuildNumber};`, 2, 'iOS build numbers')
  const updates = [prepare ? JSON.stringify(pkg, null, 2) + '\n' : originals[0],
    prepare ? JSON.stringify(lock, null, 2) + '\n' : originals[1], android, ios]
  const changed = []
  try {
    for (let index = 0; index < names.length; index += 1) {
      if (updates[index] === originals[index]) continue
      // Include the current file in rollback even if a write is interrupted.
      changed.push(index)
      await fs.writeFile(path.join(root, names[index]), updates[index])
    }
  } catch (error) {
    const rollback = await Promise.allSettled(changed.map(index => fs.writeFile(path.join(root, names[index]), originals[index])))
    if (rollback.some(result => result.status === 'rejected')) throw new Error('Version update failed; restoring some files also failed.')
    throw error
  }
  return { version, nativeBuildNumber, changed: changed.map(index => names[index]) }
}

module.exports = { syncVersions }

if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--prepare') || args.length > 1) {
    console.error('Usage: sync-versions.cjs [--prepare]')
    process.exitCode = 1
  } else {
    syncVersions({ prepare: args.includes('--prepare') }).then(result => {
      console.log(`All platforms: ${result.version}, native build ${result.nativeBuildNumber}.`)
    }).catch(error => { console.error(error.message); process.exitCode = 1 })
  }
}
