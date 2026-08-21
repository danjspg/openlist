export function shouldShowMyViewings(
  isAuthenticated: boolean,
  hasViewings: boolean
) {
  return isAuthenticated && hasViewings
}
