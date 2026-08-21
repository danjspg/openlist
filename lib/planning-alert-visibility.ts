export function shouldShowPlanningAlertControls(
  publicAlertsEnabled: boolean,
  isAuthenticated: boolean,
  isAuthResolved: boolean
) {
  return publicAlertsEnabled || (isAuthResolved && isAuthenticated)
}
