// upstream.mjs — where the prose comes from, and how to tell if it moved.
//
// No network here on purpose. This module is imported by the test suite, so it
// must be pure: nothing but string and number handling. The fetching lives in
// `check-upstream.mjs`.

// The prose we mirror. `cursor/plugins` is the source of truth; the `open-pstack`
// release layer is a translation of it that lags behind (1.15.0 still carries
// 0.15.25), so watching the translation would have us miss releases.
export const UPSTREAM_REPO = 'cursor/plugins'
export const UPSTREAM_PATH = 'pstack'
export const UPSTREAM_REF = 'main'
export const VERSION_URL =
  `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${UPSTREAM_REF}/${UPSTREAM_PATH}/plugin.json`

// Parse `1.2.3` into [1, 2, 3]. Anything else is a throw, because a version we
// cannot read is a version we cannot compare, and silently treating it as equal
// is how a fork rots without anyone noticing.
export function parseVersion(value) {
  const text = String(value).trim().replace(/^v/, '')
  if (!/^\d+(\.\d+)*$/.test(text)) {
    throw new Error(`not a dotted numeric version: ${JSON.stringify(value)}`)
  }
  return text.split('.').map(part => Number(part))
}

// -1 when `a` is older, 0 when equal, 1 when `a` is newer. A shorter version is
// padded with zeros, so `1.2` and `1.2.0` are the same release.
export function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l !== r) return l < r ? -1 : 1
  }
  return 0
}

// The report the CLI prints and the workflow reads. Kept separate so the shape
// is testable without running a process.
export function describeDrift(pinned, live) {
  const order = compareVersions(live, pinned)
  if (order === 0) {
    return { status: 'current', pinned, live, message: `upstream is at ${pinned}; already synced` }
  }
  if (order < 0) {
    return {
      status: 'ahead',
      pinned,
      live,
      message: `pinned ${pinned} is newer than upstream ${live}; the pin is wrong or upstream reverted`,
    }
  }
  return {
    status: 'behind',
    pinned,
    live,
    message: `upstream moved to ${live}; this fork is synced to ${pinned}`,
  }
}
