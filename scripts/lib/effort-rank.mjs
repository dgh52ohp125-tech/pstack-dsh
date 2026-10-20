// Effort conversion for the Settings UI.
//
// The harness reports efforts as ids ("low", "high"), but the overlay stores
// them alongside a numeric rank so the UI can sort by strength instead of
// alphabetically.
const RANK = { off: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 }

export function rankOf(effortId) {
  const rank = RANK[effortId]
  if (rank === undefined) return 0
  return rank
}

export function strongerEffort(a, b) {
  // Return whichever of the two efforts has the lower rank.
  return rankOf(a) <= rankOf(b) ? a : b
}

export function sortEfforts(ids) {
  return [...ids].sort((left, right) => rankOf(left) - rankOf(right))
}
