# 🧪 TestFlow — AI Test Management Platform

## Quick Start

### Step 1: Set your Anthropic API Key
```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

### Step 2: Start the Backend (Terminal 1)
```bash
cd backend
npm install
node server.js
# ✅ TestFlow API running on http://localhost:4000
```

### Step 3: Start the Frontend (Terminal 2)
```bash
cd frontend2
npm install
npm run dev
# ✅ Frontend running on http://localhost:5173
```

### Step 4: Open your browser
→ http://localhost:5173

---

## Features (Phase 1 & 2 Complete)
- ✅ **Project Management** — Create, view, delete projects
- ✅ **AI Scenarios** — Generate test scenarios from requirements
- ✅ **AI Test Cases** — Generate detailed test cases with steps
- ✅ **Bug Management** — Report & track bugs with severity/status
- ✅ **AI Test Plan** — Generate comprehensive test plan document
- ✅ **Execution** — Mark test cases Pass/Fail/Not Run
- ✅ **Stats Dashboard** — Pass rate, bug count, coverage stats

## Project Structure
```
testflow/
├── backend/
│   ├── server.js       # Express API (port 4000)
│   └── package.json
└── frontend2/
    ├── src/
    │   ├── App.jsx          # Router + Nav
    │   ├── App.css          # All styles
    │   └── pages/
    │       ├── Projects.jsx      # Project list
    │       ├── ProjectDetail.jsx # Dashboard + modules
    │       ├── Scenarios.jsx     # AI scenario generator
    │       ├── TestCases.jsx     # AI test case generator + execution
    │       ├── Bugs.jsx          # Bug tracker
    │       └── TestPlan.jsx      # AI test plan generator
    └── package.json
```
