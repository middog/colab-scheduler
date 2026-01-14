# =============================================================================
# SDCoLab Scheduler - GitHub Labels
# =============================================================================
# Apply these labels to your repo using the GitHub CLI:
#   gh label create "fire:fuel" --color "F0E68C" --description "🟡 Infrastructure, tools, resources"
#   gh label create "fire:oxygen" --color "87CEEB" --description "🔵 Process, governance, docs"
#   gh label create "fire:heat" --color "FFB6C1" --description "🔴 Community, events, engagement"
#
# Or run this script:
#   chmod +x .github/labels.sh && ./.github/labels.sh
# =============================================================================

# --- Fire Triangle ---
# Core classification system
fire:fuel         # 🟡 F0E68C - Infrastructure, tools, resources
fire:oxygen       # 🔵 87CEEB - Process, governance, docs
fire:heat         # 🔴 FFB6C1 - Community, events, engagement

# --- Type ---
type:bug          # d73a4a - Something isn't working
type:feature      # a2eeef - New feature or request
type:maintenance  # f9d0c4 - Equipment/facility maintenance
type:access       # c5def5 - Certification/access request
type:docs         # 0075ca - Documentation improvements
type:chore        # fef2c0 - Maintenance and cleanup

# --- Status ---
status:triage     # ededed - Needs review
status:ready      # 0e8a16 - Ready to work on
status:in-progress # fbca04 - Currently being worked on
status:blocked    # b60205 - Blocked by dependency
status:review     # 6f42c1 - Needs review/approval
status:done       # 1d76db - Completed

# --- Priority ---
p1:critical       # b60205 - Drop everything
p2:high           # d93f0b - Important, do soon
p3:medium         # fbca04 - Normal priority
p4:low            # c2e0c6 - Nice to have

# --- Equipment Status ---
equip:out-of-service  # b60205 - Do not use
equip:limited-use     # fbca04 - Works with restrictions
equip:operational     # 0e8a16 - Fully functional
