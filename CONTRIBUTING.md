# 🐕 Contributing to SDCoLab Scheduler

**We want your input!** Pick your path:

---

## 🌱 Level 1: Just Tell Us

Don't want to code? No problem!

- **GitHub:** [Open an issue](../../issues/new)
- **Slack:** Post in #colab-tech
- **Fire Party:** Tuesdays 6pm PT
- **Hotline:** Text 858-2-MIDDOG

---

## 🌿 Level 2: Edit in Browser

1. Navigate to the file you want to edit
2. Click the pencil icon ✏️
3. Make changes
4. Click "Propose changes"

That's it! We'll review and merge.

---

## 🌳 Level 3: Full Workflow

### Setup

```bash
git clone https://github.com/YOUR-USERNAME/colab-scheduler.git
cd colab-scheduler
git remote add upstream https://github.com/middog/colab-scheduler.git
```

### For Each Contribution

```bash
# Sync
git fetch upstream && git checkout main && git merge upstream/main

# Branch
git checkout -b feature/SDCAP-XXX-description

# Commit (use bark types!)
git commit -m "🔥 ignite: add awesome feature"

# Push & PR
git push origin feature/SDCAP-XXX-description
```

---

## 🐕 Bark Types (Commit Prefixes)

| Bark | Meaning |
|------|---------|
| 🔥 `ignite:` | New feature |
| 🦴 `fetch:` | Add dependency |
| 🐾 `track:` | Refactor |
| 🩹 `mend:` | Bug fix |
| 📜 `howl:` | Documentation |
| 🧹 `groom:` | Cleanup |

---

## 🔥 Fire Triangle Labels

| Label | Color | Meaning |
|-------|-------|---------|
| `fire:fuel` | 🟡 | Physical resources |
| `fire:oxygen` | 🔵 | Process/governance |
| `fire:heat` | 🔴 | Community |

---

## 📋 Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend  
cd frontend && npm install && npm run dev
```

---

**Questions?** Ask in #colab-tech or at Fire Party! 🔥
