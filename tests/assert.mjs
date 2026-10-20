// Small assertion helpers shared by every test file. No dependencies.

export const results = []

export function check(name, ok, detail) {
  results.push({ name, ok: ok === true, detail: detail === undefined ? '' : String(detail) })
  return ok === true
}

export function equal(name, actual, expected) {
  return check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
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
  return { label, total: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed }
}
