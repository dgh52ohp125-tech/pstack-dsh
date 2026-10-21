// Small assertion helpers shared by every test file. No dependencies.

export const results = []

export function check(name, ok, detail) {
  results.push({ name, ok: ok === true, detail: detail === undefined ? '' : String(detail) })
  return ok === true
}

// A third outcome, alongside pass and fail.
//
// Some checks need something the repo deliberately does not vendor — an upstream
// tree, a network, a profile. Recording those as failures makes a fresh clone
// open with a red suite, which trains a reader to ignore red. Recording them as
// passes hides a guard that never ran. So they are counted separately and the
// run still exits 0.
export function skip(name, reason) {
  results.push({ name, ok: true, skipped: true, detail: String(reason) })
  return true
}

export function equal(name, actual, expected, detail) {
  const base = `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  return check(name, actual === expected, detail === undefined || actual === expected ? base : `${base} — ${detail}`)
}

export function deepEqual(name, actual, expected) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  return check(name, a === b, `expected ${b}, got ${a}`)
}

export function includes(name, haystack, needle) {
  const text = Array.isArray(haystack) ? haystack.join(',') : String(haystack)
  return check(name, text.includes(needle), `${JSON.stringify(needle)} not in ${JSON.stringify(text)}`)
}

export async function rejects(name, run) {
  try {
    await run()
    return check(name, false, 'expected a rejection, but it resolved')
  } catch (error) {
    return check(name, true, String(error && error.message || error).split('\n')[0])
  }
}

export function summary(label) {
  const failed = results.filter(entry => !entry.ok)
  const skipped = results.filter(entry => entry.skipped === true)
  return {
    label,
    total: results.length,
    passed: results.length - failed.length - skipped.length,
    failed: failed.length,
    skipped: skipped.length,
    skipReasons: skipped.map(entry => `${entry.name}: ${entry.detail}`),
    failures: failed,
  }
}
