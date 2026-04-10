const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const OPENROUTER_API_KEY = "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";

const app = express();
app.use(cors());
app.use(express.json());

// ─── JSON Database ────────────────────────────────────────────────────────────
const dbPath = path.join(__dirname, "data", "db.json");

const createInitialDB = () => ({
  users: [{ id: "user-1", email: "demo@testflow.ai", plan: "pro" }],
  projects: [],
  spaces: [],
  testPlans: [],
  scenarios: [],
  testCases: [],
  bugs: [],
  executions: [],
});

const readDB = () => {
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const initialData = createInitialDB();
    fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2), "utf-8");
    return initialData;
  }

  const raw = fs.readFileSync(dbPath, "utf-8");
  return JSON.parse(raw);
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
};

let db = readDB();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const find = (col, id) => db[col].find((x) => x.id === id);

const openRouterHeaders = {
  Authorization: `Bearer ${OPENROUTER_API_KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "http://localhost:3000",
  "X-Title": "TestFlow",
};

const parseAIJsonArray = (rawText, res) => {
  const raw = rawText.trim().replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("JSON PARSE FAILED:", raw);
    res.status(500).json({ error: "Invalid AI response format" });
    return null;
  }

  if (!Array.isArray(parsed)) {
    console.error("AI RESPONSE IS NOT ARRAY:", parsed);
    res.status(500).json({ error: "Invalid AI response format" });
    return null;
  }

  return parsed;
};

const getAIContent = (response, res) => {
  if (!response.data || !response.data.choices || !response.data.choices.length) {
    console.error("INVALID RESPONSE:", response.data);
    res.status(500).json({ error: "Invalid AI response" });
    return null;
  }

  return response.data.choices[0].message.content;
};

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
app.get("/api/projects", (req, res) => {
  db = readDB();
  res.json(db.projects);
});

app.post("/api/projects", (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name required" });
  }

  db = readDB();

  const project = {
    id: uuidv4(),
    name,
    description: description || "",
    createdAt: now(),
  };

  db.projects.push(project);
  writeDB(db);

  res.status(201).json(project);
});

app.put("/api/projects/:id", (req, res) => {
  db = readDB();

  const project = find("projects", req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Not found" });
  }

  Object.assign(project, req.body, { updatedAt: now() });
  writeDB(db);

  res.json(project);
});

app.delete("/api/projects/:id", (req, res) => {
  db = readDB();

  const idx = db.projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  db.projects.splice(idx, 1);

  const deletedProjectId = req.params.id;
  const deletedSpaceIds = db.spaces
    .filter((space) => space.projectId === deletedProjectId)
    .map((space) => space.id);

  db.spaces = db.spaces.filter((space) => space.projectId !== deletedProjectId);
  db.testPlans = db.testPlans.filter((p) => p.projectId !== deletedProjectId);
  db.scenarios = db.scenarios.filter(
    (s) =>
      s.projectId !== deletedProjectId &&
      !deletedSpaceIds.includes(s.spaceId)
  );
  db.testCases = db.testCases.filter(
    (t) =>
      t.projectId !== deletedProjectId &&
      !deletedSpaceIds.includes(t.spaceId)
  );
  db.bugs = db.bugs.filter(
    (b) =>
      b.projectId !== deletedProjectId &&
      !deletedSpaceIds.includes(b.spaceId)
  );
  db.executions = db.executions.filter((e) => e.projectId !== deletedProjectId);

  writeDB(db);

  res.json({ ok: true });
});

// ─── SPACES ───────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/spaces", (req, res) => {
  db = readDB();

  const spaces = db.spaces.filter((space) => space.projectId === req.params.id);
  res.json(spaces);
});

app.post("/api/projects/:id/spaces", (req, res) => {
  const { name, type } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Space name required" });
  }

  db = readDB();

  const project = find("projects", req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const space = {
    id: uuidv4(),
    projectId: req.params.id,
    name,
    type: type || "Module",
    createdAt: now(),
  };

  db.spaces.push(space);
  writeDB(db);

  res.status(201).json(space);
});

app.put("/api/spaces/:id", (req, res) => {
  db = readDB();

  const space = find("spaces", req.params.id);
  if (!space) {
    return res.status(404).json({ error: "Space not found" });
  }

  Object.assign(space, req.body, { updatedAt: now() });
  writeDB(db);

  res.json(space);
});

app.delete("/api/spaces/:id", (req, res) => {
  db = readDB();

  const idx = db.spaces.findIndex((space) => space.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: "Space not found" });
  }

  const deletedSpace = db.spaces[idx];
  db.spaces.splice(idx, 1);

  db.scenarios = db.scenarios.filter((s) => s.spaceId !== deletedSpace.id);
  db.testCases = db.testCases.filter((t) => t.spaceId !== deletedSpace.id);
  db.bugs = db.bugs.filter((b) => b.spaceId !== deletedSpace.id);

  writeDB(db);

  res.json({ ok: true });
});

// ─── PROJECT-LEVEL SCENARIOS ──────────────────────────────────────────────────
app.get("/api/projects/:id/scenarios", (req, res) => {
  db = readDB();
  res.json(db.scenarios.filter((s) => s.projectId === req.params.id && !s.spaceId));
});

app.post("/api/projects/:id/scenarios/generate", async (req, res) => {
  db = readDB();

  const project = find("projects", req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const { requirement } = req.body;
  if (!requirement) {
    return res.status(400).json({ error: "Requirement text required" });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
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
      { headers: openRouterHeaders }
    );

    const content = getAIContent(response, res);
    if (!content) return;

    const parsed = parseAIJsonArray(content, res);
    if (!parsed) return;

    const scenarios = parsed.map((s) => ({
      id: uuidv4(),
      projectId: req.params.id,
      ...s,
      requirement,
      createdAt: now(),
    }));

    db.scenarios.push(...scenarios);
    writeDB(db);

    res.json(scenarios);
  } catch (err) {
    console.error("ERROR FULL:", err);
    console.error("ERROR RESPONSE:", err.response?.data);

    res.status(500).json({
      error: "AI generation failed",
      detail: err.response?.data || err.message,
    });
  }
});

app.delete("/api/scenarios/:id", (req, res) => {
  db = readDB();

  const idx = db.scenarios.findIndex((s) => s.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  db.scenarios.splice(idx, 1);
  writeDB(db);

  res.json({ ok: true });
});

// ─── SPACE-LEVEL SCENARIOS ────────────────────────────────────────────────────
app.get("/api/projects/:id/spaces/:spaceId/scenarios", (req, res) => {
  db = readDB();

  const scenarios = db.scenarios.filter(
    (s) => s.projectId === req.params.id && s.spaceId === req.params.spaceId
  );

  res.json(scenarios);
});

app.post("/api/projects/:id/spaces/:spaceId/scenarios/generate", async (req, res) => {
  db = readDB();

  const project = find("projects", req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const space = find("spaces", req.params.spaceId);
  if (!space) {
    return res.status(404).json({ error: "Space not found" });
  }

  const { requirement } = req.body;
  if (!requirement) {
    return res.status(400).json({ error: "Requirement text required" });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "user",
            content: `You are a QA expert. Generate 5 detailed test scenarios for the following requirement.

Project: ${project.name}
Space: ${space.name}
Requirement: ${requirement}

Respond ONLY with a JSON array like:
[
  { "title": "...", "description": "...", "priority": "High" },
  { "title": "...", "description": "...", "priority": "Medium" }
]`,
          },
        ],
      },
      { headers: openRouterHeaders }
    );

    const content = getAIContent(response, res);
    if (!content) return;

    const parsed = parseAIJsonArray(content, res);
    if (!parsed) return;

    const scenarios = parsed.map((s) => ({
      id: uuidv4(),
      projectId: req.params.id,
      spaceId: req.params.spaceId,
      ...s,
      requirement,
      createdAt: now(),
    }));

    db.scenarios.push(...scenarios);
    writeDB(db);

    res.json(scenarios);
  } catch (err) {
    console.error("ERROR FULL:", err);
    console.error("ERROR RESPONSE:", err.response?.data);

    res.status(500).json({
      error: "AI generation failed",
      detail: err.response?.data || err.message,
    });
  }
});

// ─── PROJECT-LEVEL TEST CASES ────────────────────────────────────────────────
app.get("/api/projects/:id/testcases", (req, res) => {
  db = readDB();
  res.json(db.testCases.filter((tc) => tc.projectId === req.params.id && !tc.spaceId));
});

app.post("/api/projects/:id/testcases/generate", async (req, res) => {
  db = readDB();

  const project = find("projects", req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const { scenarioTitle, scenarioDescription } = req.body;
  if (!scenarioTitle) {
    return res.status(400).json({ error: "Scenario required" });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
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
      { headers: openRouterHeaders }
    );

    const content = getAIContent(response, res);
    if (!content) return;

    const parsed = parseAIJsonArray(content, res);
    if (!parsed) return;

    const testCases = parsed.map((tc) => ({
      id: uuidv4(),
      projectId: req.params.id,
      ...tc,
      status: "Not Run",
      scenarioTitle,
      createdAt: now(),
    }));

    db.testCases.push(...testCases);
    writeDB(db);

    res.json(testCases);
  } catch (err) {
    console.error("ERROR FULL:", err);
    console.error("ERROR RESPONSE:", err.response?.data);

    res.status(500).json({
      error: "AI generation failed",
      detail: err.response?.data || err.message,
    });
  }
});

app.put("/api/testcases/:id/status", (req, res) => {
  db = readDB();

  const tc = find("testCases", req.params.id);
  if (!tc) {
    return res.status(404).json({ error: "Not found" });
  }

  tc.status = req.body.status;
  tc.updatedAt = now();
  writeDB(db);

  res.json(tc);
});

app.delete("/api/testcases/:id", (req, res) => {
  db = readDB();

  const idx = db.testCases.findIndex((t) => t.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  db.testCases.splice(idx, 1);
  writeDB(db);

  res.json({ ok: true });
});

// ─── SPACE-LEVEL TEST CASES ───────────────────────────────────────────────────
app.get("/api/projects/:id/spaces/:spaceId/testcases", (req, res) => {
  db = readDB();

  const testCases = db.testCases.filter(
    (tc) => tc.projectId === req.params.id && tc.spaceId === req.params.spaceId
  );

  res.json(testCases);
});

app.post("/api/projects/:id/spaces/:spaceId/testcases/generate", async (req, res) => {
  db = readDB();

  const project = find("projects", req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const space = find("spaces", req.params.spaceId);
  if (!space) {
    return res.status(404).json({ error: "Space not found" });
  }

  const { scenarioTitle, scenarioDescription } = req.body;
  if (!scenarioTitle) {
    return res.status(400).json({ error: "Scenario required" });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "user",
            content: `You are a QA engineer. Generate detailed test cases for this scenario.

Project: ${project.name}
Space: ${space.name}
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
      { headers: openRouterHeaders }
    );

    const content = getAIContent(response, res);
    if (!content) return;

    const parsed = parseAIJsonArray(content, res);
    if (!parsed) return;

    const testCases = parsed.map((tc) => ({
      id: uuidv4(),
      projectId: req.params.id,
      spaceId: req.params.spaceId,
      ...tc,
      status: "Not Run",
      scenarioTitle,
      createdAt: now(),
    }));

    db.testCases.push(...testCases);
    writeDB(db);

    res.json(testCases);
  } catch (err) {
    console.error("ERROR FULL:", err);
    console.error("ERROR RESPONSE:", err.response?.data);

    res.status(500).json({
      error: "AI generation failed",
      detail: err.response?.data || err.message,
    });
  }
});

// ─── PROJECT-LEVEL BUGS ───────────────────────────────────────────────────────
app.get("/api/projects/:id/bugs", (req, res) => {
  db = readDB();
  res.json(db.bugs.filter((b) => b.projectId === req.params.id && !b.spaceId));
});

app.post("/api/projects/:id/bugs", (req, res) => {
  const { title, description, severity } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title required" });
  }

  db = readDB();

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
  writeDB(db);

  res.status(201).json(bug);
});

app.put("/api/bugs/:id", (req, res) => {
  db = readDB();

  const bug = find("bugs", req.params.id);
  if (!bug) {
    return res.status(404).json({ error: "Not found" });
  }

  Object.assign(bug, req.body, { updatedAt: now() });
  writeDB(db);

  res.json(bug);
});

app.delete("/api/bugs/:id", (req, res) => {
  db = readDB();

  const idx = db.bugs.findIndex((b) => b.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  db.bugs.splice(idx, 1);
  writeDB(db);

  res.json({ ok: true });
});

// ─── SPACE-LEVEL BUGS ─────────────────────────────────────────────────────────
app.get("/api/projects/:id/spaces/:spaceId/bugs", (req, res) => {
  db = readDB();

  const bugs = db.bugs.filter(
    (b) => b.projectId === req.params.id && b.spaceId === req.params.spaceId
  );

  res.json(bugs);
});

app.post("/api/projects/:id/spaces/:spaceId/bugs", (req, res) => {
  const { title, description, severity } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title required" });
  }

  db = readDB();

  const project = find("projects", req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const space = find("spaces", req.params.spaceId);
  if (!space) {
    return res.status(404).json({ error: "Space not found" });
  }

  const bug = {
    id: uuidv4(),
    projectId: req.params.id,
    spaceId: req.params.spaceId,
    title,
    description: description || "",
    severity: severity || "Medium",
    status: "Open",
    createdAt: now(),
  };

  db.bugs.push(bug);
  writeDB(db);

  res.status(201).json(bug);
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/stats", (req, res) => {
  db = readDB();

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
  db = readDB();
  const plan = db.testPlans.find((p) => p.projectId === req.params.id);
  res.json(plan || null);
});

app.post("/api/projects/:id/testplan/generate", async (req, res) => {
  db = readDB();

  const project = find("projects", req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const scenarios = db.scenarios.filter((s) => s.projectId === req.params.id);
  const testCases = db.testCases.filter((t) => t.projectId === req.params.id);

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
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
      { headers: openRouterHeaders }
    );

    const content = getAIContent(response, res);
    if (!content) return;

    const plan = {
      id: uuidv4(),
      projectId: req.params.id,
      content,
      generatedAt: now(),
    };

    const existing = db.testPlans.findIndex(
      (p) => p.projectId === req.params.id
    );

    if (existing >= 0) {
      db.testPlans[existing] = plan;
    } else {
      db.testPlans.push(plan);
    }

    writeDB(db);
    res.json(plan);
  } catch (err) {
    console.error("ERROR FULL:", err);
    console.error("ERROR RESPONSE:", err.response?.data);

    res.status(500).json({
      error: "AI generation failed",
      detail: err.response?.data || err.message,
    });
  }
});

// ─── ROOT ROUTE ───────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("TestFlow API running...");
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ TestFlow API running on http://localhost:${PORT}`);
});