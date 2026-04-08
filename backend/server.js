const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");

const OPENROUTER_API_KEY = "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";

const app = express();
app.use(cors());
app.use(express.json());

// ─── In-Memory Database ───────────────────────────────────────────────────────
const db = {
  users: [{ id: "user-1", email: "demo@testflow.ai", plan: "pro" }],
  projects: [],
  testPlans: [],
  scenarios: [],
  testCases: [],
  bugs: [],
  executions: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const find = (col, id) => db[col].find((x) => x.id === id);

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
app.get("/api/projects", (req, res) => {
  res.json(db.projects);
});

app.post("/api/projects", (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const project = {
    id: uuidv4(),
    name,
    description: description || "",
    createdAt: now(),
  };

  db.projects.push(project);
  res.status(201).json(project);
});

app.put("/api/projects/:id", (req, res) => {
  const project = find("projects", req.params.id);
  if (!project) return res.status(404).json({ error: "Not found" });

  Object.assign(project, req.body, { updatedAt: now() });
  res.json(project);
});

app.delete("/api/projects/:id", (req, res) => {
  const idx = db.projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  db.projects.splice(idx, 1);
  res.json({ ok: true });
});

// ─── SCENARIOS ────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/scenarios", (req, res) => {
  res.json(db.scenarios.filter((s) => s.projectId === req.params.id));
});

app.post("/api/projects/:id/scenarios/generate", async (req, res) => {
  const project = find("projects", req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { requirement } = req.body;
  if (!requirement) {
    return res.status(400).json({ error: "Requirement text required" });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `You are a QA expert. Generate 5 detailed test scenarios for the following requirement.

Project: ${project.name}
Requirement: ${requirement}

Respond ONLY with a JSON array like:
[
  { "title": "...", "description": "...", "priority": "High" },
  { "title": "...", "description": "...", "priority": "Medium" }
]`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.choices[0].message.content
      .trim()
      .replace(/```json|```/g, "")
      .trim();

    const scenarios = JSON.parse(raw).map((s) => ({
      id: uuidv4(),
      projectId: req.params.id,
      ...s,
      requirement,
      createdAt: now(),
    }));

    db.scenarios.push(...scenarios);
    res.json(scenarios);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res
      .status(500)
      .json({ error: "AI generation failed", detail: err.message });
  }
});

app.delete("/api/scenarios/:id", (req, res) => {
  const idx = db.scenarios.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  db.scenarios.splice(idx, 1);
  res.json({ ok: true });
});

// ─── TEST CASES ───────────────────────────────────────────────────────────────
app.get("/api/projects/:id/testcases", (req, res) => {
  res.json(db.testCases.filter((tc) => tc.projectId === req.params.id));
});

app.post("/api/projects/:id/testcases/generate", async (req, res) => {
  const project = find("projects", req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { scenarioTitle, scenarioDescription } = req.body;
  if (!scenarioTitle) {
    return res.status(400).json({ error: "Scenario required" });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `You are a QA engineer. Generate detailed test cases for this scenario.

Project: ${project.name}
Scenario: ${scenarioTitle}
Description: ${scenarioDescription || ""}

Respond ONLY with a JSON array like:
[
  {
    "title": "...",
    "preconditions": "...",
    "steps": ["step 1", "step 2"],
    "expectedResult": "...",
    "priority": "High",
    "type": "Functional"
  }
]

Generate 4 to 6 test cases.`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.choices[0].message.content
      .trim()
      .replace(/```json|```/g, "")
      .trim();

    const testCases = JSON.parse(raw).map((tc) => ({
      id: uuidv4(),
      projectId: req.params.id,
      ...tc,
      status: "Not Run",
      scenarioTitle,
      createdAt: now(),
    }));

    db.testCases.push(...testCases);
    res.json(testCases);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res
      .status(500)
      .json({ error: "AI generation failed", detail: err.message });
  }
});

app.put("/api/testcases/:id/status", (req, res) => {
  const tc = find("testCases", req.params.id);
  if (!tc) return res.status(404).json({ error: "Not found" });

  tc.status = req.body.status;
  tc.updatedAt = now();
  res.json(tc);
});

app.delete("/api/testcases/:id", (req, res) => {
  const idx = db.testCases.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  db.testCases.splice(idx, 1);
  res.json({ ok: true });
});

// ─── BUGS ─────────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/bugs", (req, res) => {
  res.json(db.bugs.filter((b) => b.projectId === req.params.id));
});

app.post("/api/projects/:id/bugs", (req, res) => {
  const { title, description, severity } = req.body;
  if (!title) return res.status(400).json({ error: "Title required" });

  const bug = {
    id: uuidv4(),
    projectId: req.params.id,
    title,
    description: description || "",
    severity: severity || "Medium",
    status: "Open",
    createdAt: now(),
  };

  db.bugs.push(bug);
  res.status(201).json(bug);
});

app.put("/api/bugs/:id", (req, res) => {
  const bug = find("bugs", req.params.id);
  if (!bug) return res.status(404).json({ error: "Not found" });

  Object.assign(bug, req.body, { updatedAt: now() });
  res.json(bug);
});

app.delete("/api/bugs/:id", (req, res) => {
  const idx = db.bugs.findIndex((b) => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  db.bugs.splice(idx, 1);
  res.json({ ok: true });
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/stats", (req, res) => {
  const pid = req.params.id;
  const tcs = db.testCases.filter((t) => t.projectId === pid);

  res.json({
    scenarios: db.scenarios.filter((s) => s.projectId === pid).length,
    testCases: tcs.length,
    passed: tcs.filter((t) => t.status === "Pass").length,
    failed: tcs.filter((t) => t.status === "Fail").length,
    notRun: tcs.filter((t) => t.status === "Not Run").length,
    bugs: db.bugs.filter((b) => b.projectId === pid).length,
    openBugs: db.bugs.filter(
      (b) => b.projectId === pid && b.status === "Open"
    ).length,
  });
});

// ─── TEST PLAN (AI) ───────────────────────────────────────────────────────────
app.get("/api/projects/:id/testplan", (req, res) => {
  const plan = db.testPlans.find((p) => p.projectId === req.params.id);
  res.json(plan || null);
});

app.post("/api/projects/:id/testplan/generate", async (req, res) => {
  const project = find("projects", req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const scenarios = db.scenarios.filter((s) => s.projectId === req.params.id);
  const testCases = db.testCases.filter((t) => t.projectId === req.params.id);

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Generate a professional test plan document for this project.

Project: ${project.name}
Description: ${project.description}
Scenarios count: ${scenarios.length}
Test cases count: ${testCases.length}

Include:
- Objective
- Scope
- Approach
- Entry Criteria
- Exit Criteria
- Risks
- Timeline

Return clean formatted text.`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const content = response.data.choices[0].message.content;

    const plan = {
      id: uuidv4(),
      projectId: req.params.id,
      content,
      generatedAt: now(),
    };

    const existing = db.testPlans.findIndex(
      (p) => p.projectId === req.params.id
    );
    if (existing >= 0) db.testPlans[existing] = plan;
    else db.testPlans.push(plan);

    res.json(plan);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res
      .status(500)
      .json({ error: "AI generation failed", detail: err.message });
  }
});

// ─── ROOT ROUTE ───────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("TestFlow API running...");
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = 4000;
app.listen(PORT, () =>
  console.log(`✅ TestFlow API running on http://localhost:${PORT}`)
);