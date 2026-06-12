#!/bin/bash
set -e
echo "=== RamboFlow Branch Cleanup (40 Branches) ==="
read -p "Fortfahren? (y/N) " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && exit 0

BRANCHES=(
  docs/branch-convention docs/epic-6-complete
  feature/blue-cleanup-phase-2 feature/dark-gray-to-tokens
  feature/entries-customer-search-filters feature/epic-6-ui-polish
  feature/epic1-security-optimizations feature/epic10-roadmap-update
  feature/epic11-claude-md-update feature/epic2-3-performance-db-consistency
  feature/epic4-1-completion feature/epic4-1-manual-entry-duration-input
  feature/epic4-1-prevent-overlapping-timers feature/epic4-1-quick-repeat
  feature/epic7-theme-consistency feature/epic8-ramboflow-purple-theme
  feature/epic9-invoice-pdf-fix feature/global-timer-widget
  feature/paginated-time-entries-list feature/quick-wins-theme-cleanup
  feature/ramboeck-theme-default feature/refresh-token-mechanism
  feature/roadmap-update-june12 feature/router-pass-4b
  feature/soft-delete-activation feature/zod-validation-tickets-ai-contracts
  fix/manual-entry-timezone-today fix/refresh-tokens-text-id-mismatch
  claude/view-commits-branches-FfhaZ feature/claude-md-next-steps
  feature/claude-md-status-update-may18 feature/entries-timeframes-endpoint
  feature/remove-dead-code feature/router-pass-4a
  feature/router-pass-4b-extension feature/router-pass-4c
  feature/tanstack-query-pilot feature/ticket-detail-tanstack-query
  feature/tickets-tanstack-query fix/prefs-race-condition
)

for b in "${BRANCHES[@]}"; do
  git push origin --delete "$b" 2>/dev/null && echo "✅ $b" || echo "⏭️ $b"
done

echo ""
echo "Fertig! Verbleibende Branches:"
git fetch --prune 2>/dev/null
git branch -r | grep -v HEAD
