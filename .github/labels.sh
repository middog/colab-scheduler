#!/bin/bash
# =============================================================================
# SDCoLab Scheduler - GitHub Labels Setup
# Run: chmod +x .github/labels.sh && ./.github/labels.sh
# =============================================================================

set -e

echo "🏷️  Setting up GitHub labels..."
echo ""

# Fire Triangle
gh label create "fire:fuel" --color "F0E68C" --description "🟡 Infrastructure, tools, resources" --force
gh label create "fire:oxygen" --color "87CEEB" --description "🔵 Process, governance, docs" --force
gh label create "fire:heat" --color "FFB6C1" --description "🔴 Community, events, engagement" --force

# Type
gh label create "type:bug" --color "d73a4a" --description "Something isn't working" --force
gh label create "type:feature" --color "a2eeef" --description "New feature or request" --force
gh label create "type:maintenance" --color "f9d0c4" --description "Equipment/facility maintenance" --force
gh label create "type:access" --color "c5def5" --description "Certification/access request" --force
gh label create "type:docs" --color "0075ca" --description "Documentation improvements" --force
gh label create "type:chore" --color "fef2c0" --description "Maintenance and cleanup" --force

# Status
gh label create "status:triage" --color "ededed" --description "Needs initial review" --force
gh label create "status:ready" --color "0e8a16" --description "Ready to work on" --force
gh label create "status:in-progress" --color "fbca04" --description "Currently being worked on" --force
gh label create "status:blocked" --color "b60205" --description "Blocked by dependency" --force
gh label create "status:review" --color "6f42c1" --description "Needs review/approval" --force
gh label create "status:done" --color "1d76db" --description "Completed" --force

# Priority
gh label create "p1:critical" --color "b60205" --description "Drop everything" --force
gh label create "p2:high" --color "d93f0b" --description "Important, do soon" --force
gh label create "p3:medium" --color "fbca04" --description "Normal priority" --force
gh label create "p4:low" --color "c2e0c6" --description "Nice to have" --force

# Equipment Status
gh label create "equip:out-of-service" --color "b60205" --description "⛔ Do not use" --force
gh label create "equip:limited-use" --color "fbca04" --description "⚠️ Works with restrictions" --force
gh label create "equip:operational" --color "0e8a16" --description "✅ Fully functional" --force

echo ""
echo "✅ Labels configured!"
