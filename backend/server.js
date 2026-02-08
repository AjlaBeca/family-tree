const express = require("express");
const cors = require("cors");
const { init, all, get, run } = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
const RELATIONSHIP_STATUSES = new Set([
  "partner",
  "married",
  "divorced",
  "separated",
  "widowed",
]);

app.use(cors());
app.use(express.json({ limit: "80mb" }));
app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Upload je prevelik. Smanji veličinu ili broj slika u galeriji.",
    });
  }
  return next(err);
});

const sanitizePerson = (person) => {
  const cleaned = { ...person };
  cleaned.parent = cleaned.parent || 0;
  cleaned.parent2 = cleaned.parent2 || 0;
  cleaned.spouse = cleaned.spouse || 0;
  cleaned.divorced = cleaned.divorced ? 1 : 0;
  cleaned.isPinned = cleaned.isPinned ? 1 : 0;
  cleaned.pinColor = cleaned.pinColor || "#f59e0b";
  if (cleaned.parent === cleaned.id) cleaned.parent = 0;
  if (cleaned.parent2 === cleaned.id) cleaned.parent2 = 0;
  if (cleaned.parent2 && cleaned.parent2 === cleaned.parent) cleaned.parent2 = 0;
  if (cleaned.spouse === cleaned.id) cleaned.spouse = 0;
  if (!cleaned.spouse) cleaned.divorced = 0;
  return cleaned;
};

const parseId = (value) => {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const clampPercent = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(100, parsed));
};

const buildChildrenMap = (rows, overrides = new Map()) => {
  const map = new Map();
  const addChild = (parentId, childId) => {
    if (!parentId || !childId) return;
    const list = map.get(parentId) || [];
    list.push(childId);
    map.set(parentId, list);
  };

  rows.forEach((row) => {
    const override = overrides.get(row.id);
    const parent = override ? override.parent : parseId(row.parent);
    const parent2 = override ? override.parent2 : parseId(row.parent2);
    addChild(parent, row.id);
    addChild(parent2, row.id);
  });

  return map;
};

const hasPath = (childrenMap, startId, targetId) => {
  if (!startId || !targetId) return false;
  const queue = [startId];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const children = childrenMap.get(current) || [];
    children.forEach((childId) => {
      if (!visited.has(childId)) queue.push(childId);
    });
  }

  return false;
};

const validatePersonPayload = async ({ id = 0, familyId, parent = 0, parent2 = 0, spouse = 0 }) => {
  const personId = parseId(id);
  const p1 = parseId(parent);
  const p2 = parseId(parent2);
  const spouseId = parseId(spouse);

  if (personId && p1 === personId) return "Roditelj 1 ne može biti ista osoba.";
  if (personId && p2 === personId) return "Roditelj 2 ne može biti ista osoba.";
  if (p1 && p2 && p1 === p2) return "Roditelj 1 i Roditelj 2 moraju biti različite osobe.";
  if (personId && spouseId === personId) return "Supružnik ne može biti ista osoba.";

  const people = await all("SELECT id, parent, parent2 FROM people WHERE family_id = ?", [familyId]);
  const idSet = new Set(people.map((row) => row.id));

  if (p1 && !idSet.has(p1)) return "Roditelj 1 ne postoji u aktivnoj porodici.";
  if (p2 && !idSet.has(p2)) return "Roditelj 2 ne postoji u aktivnoj porodici.";
  if (spouseId && !idSet.has(spouseId)) return "Supružnik ne postoji u aktivnoj porodici.";

  if (!personId || !idSet.has(personId)) return null;

  const overrides = new Map([[personId, { parent: p1, parent2: p2 }]]);
  const childrenMap = buildChildrenMap(people, overrides);

  if (p1 && hasPath(childrenMap, personId, p1)) {
    return "Neispravna veza: Roditelj 1 je potomak ove osobe (ciklus).";
  }
  if (p2 && hasPath(childrenMap, personId, p2)) {
    return "Neispravna veza: Roditelj 2 je potomak ove osobe (ciklus).";
  }

  return null;
};

const sanitizeRelationship = (row) => ({
  id: row.id,
  familyId: row.familyId,
  person1Id: row.person1Id,
  person2Id: row.person2Id,
  status: row.status,
  startDate: row.startDate || "",
  endDate: row.endDate || "",
  notes: row.notes || "",
  isCurrent: row.isCurrent ? 1 : 0,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const normalizeImportPersonRef = (value) => {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeImportStatus = (value) => {
  const status = String(value || "partner").trim().toLowerCase();
  return RELATIONSHIP_STATUSES.has(status) ? status : "";
};

const validateImportPayload = (payload) => {
  if (!payload || typeof payload !== "object") return "Import payload mora biti objekat.";
  const schemaVersion = String(payload.schemaVersion || "");
  if (!schemaVersion.startsWith("2")) return "Podrzana je samo schemaVersion 2.x.";
  if (!Array.isArray(payload.people)) return "`people` mora biti niz.";
  if (!Array.isArray(payload.tags || [])) return "`tags` mora biti niz.";
  if (!Array.isArray(payload.tagLinks || [])) return "`tagLinks` mora biti niz.";
  if (!Array.isArray(payload.relationships || [])) return "`relationships` mora biti niz.";
  if (payload.familyHealth && typeof payload.familyHealth !== "object") {
    return "`familyHealth` mora biti objekat.";
  }
  if (!Array.isArray(payload.personHealth || [])) return "`personHealth` mora biti niz.";

  const people = payload.people;
  const personIds = new Set();
  for (let i = 0; i < people.length; i += 1) {
    const row = people[i];
    const rowIndex = i + 1;
    const personId = normalizeImportPersonRef(row?.id);
    if (!personId) return `people[${rowIndex}] mora imati validan numericki id.`;
    if (personIds.has(personId)) return `Duplirani person id u people: ${personId}.`;
    if (!String(row?.name || "").trim()) return `people[${rowIndex}] nema ime.`;
    personIds.add(personId);
  }

  const childrenByParent = new Map();
  const addChild = (parentId, childId) => {
    if (!parentId || !childId) return;
    const list = childrenByParent.get(parentId) || [];
    list.push(childId);
    childrenByParent.set(parentId, list);
  };

  for (let i = 0; i < people.length; i += 1) {
    const row = people[i];
    const personId = normalizeImportPersonRef(row.id);
    const parent = normalizeImportPersonRef(row.parent);
    const parent2 = normalizeImportPersonRef(row.parent2);
    const spouse = normalizeImportPersonRef(row.spouse);
    const rowIndex = i + 1;

    if (parent && !personIds.has(parent)) return `people[${rowIndex}] ima nepostojeci parent id (${parent}).`;
    if (parent2 && !personIds.has(parent2)) return `people[${rowIndex}] ima nepostojeci parent2 id (${parent2}).`;
    if (spouse && !personIds.has(spouse)) return `people[${rowIndex}] ima nepostojeci spouse id (${spouse}).`;
    if (parent && parent === personId) return `people[${rowIndex}] ima self-parent gresku.`;
    if (parent2 && parent2 === personId) return `people[${rowIndex}] ima self-parent2 gresku.`;
    if (parent && parent2 && parent === parent2) return `people[${rowIndex}] ima duplog roditelja.`;
    addChild(parent, personId);
    addChild(parent2, personId);
  }

  for (const personId of personIds) {
    const directChildren = childrenByParent.get(personId) || [];
    for (const childId of directChildren) {
      if (hasPath(childrenByParent, childId, personId)) {
        return `Otkriven ciklus u roditeljskim vezama za osobu ${personId}.`;
      }
    }
  }

  const tags = payload.tags || [];
  const tagIds = new Set();
  for (let i = 0; i < tags.length; i += 1) {
    const row = tags[i];
    const rowIndex = i + 1;
    const tagId = normalizeImportPersonRef(row?.id);
    if (!tagId) return `tags[${rowIndex}] mora imati validan numericki id.`;
    if (tagIds.has(tagId)) return `Duplirani tag id u tags: ${tagId}.`;
    if (!String(row?.name || "").trim()) return `tags[${rowIndex}] nema naziv.`;
    tagIds.add(tagId);
  }

  const tagLinks = payload.tagLinks || [];
  for (let i = 0; i < tagLinks.length; i += 1) {
    const row = tagLinks[i];
    const rowIndex = i + 1;
    const personId = normalizeImportPersonRef(row?.personId);
    const tagId = normalizeImportPersonRef(row?.tagId);
    if (!personIds.has(personId)) return `tagLinks[${rowIndex}] ima nepostojeci personId (${personId}).`;
    if (!tagIds.has(tagId)) return `tagLinks[${rowIndex}] ima nepostojeci tagId (${tagId}).`;
  }

  const relationships = payload.relationships || [];
  for (let i = 0; i < relationships.length; i += 1) {
    const row = relationships[i];
    const rowIndex = i + 1;
    const p1 = normalizeImportPersonRef(row?.person1Id);
    const p2 = normalizeImportPersonRef(row?.person2Id);
    if (!personIds.has(p1)) return `relationships[${rowIndex}] ima nepostojeci person1Id (${p1}).`;
    if (!personIds.has(p2)) return `relationships[${rowIndex}] ima nepostojeci person2Id (${p2}).`;
    if (p1 === p2) return `relationships[${rowIndex}] mora imati dvije razlicite osobe.`;
    if (!normalizeImportStatus(row?.status)) return `relationships[${rowIndex}] ima neispravan status.`;
  }

  const personHealth = payload.personHealth || [];
  const personHealthIds = new Set();
  for (let i = 0; i < personHealth.length; i += 1) {
    const row = personHealth[i];
    const rowIndex = i + 1;
    const personId = normalizeImportPersonRef(row?.personId);
    if (!personIds.has(personId)) {
      return `personHealth[${rowIndex}] ima nepostojeci personId (${personId}).`;
    }
    if (personHealthIds.has(personId)) {
      return `personHealth[${rowIndex}] duplira personId (${personId}).`;
    }
    personHealthIds.add(personId);
  }

  return "";
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/families", async (req, res) => {
  try {
    const families = await all(
      "SELECT id, name, notes, created_at as createdAt FROM families ORDER BY id DESC"
    );
    res.json(families);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/families", async (req, res) => {
  try {
    const { name, notes = "" } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const result = await run("INSERT INTO families (name, notes) VALUES (?, ?)", [
      name,
      notes,
    ]);
    const family = await get(
      "SELECT id, name, notes, created_at as createdAt FROM families WHERE id = ?",
      [result.lastID]
    );
    res.status(201).json(family);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/families/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await run(
      "DELETE FROM gallery_photo_tags WHERE photo_id IN (SELECT id FROM gallery_photos WHERE family_id = ?)",
      [id]
    );
    await run("DELETE FROM gallery_photos WHERE family_id = ?", [id]);
    await run("DELETE FROM person_health WHERE family_id = ?", [id]);
    await run("DELETE FROM family_health WHERE family_id = ?", [id]);
    await run("DELETE FROM relationships WHERE family_id = ?", [id]);
    await run("DELETE FROM people_tags WHERE family_id = ?", [id]);
    await run("DELETE FROM tags WHERE family_id = ?", [id]);
    await run("DELETE FROM people WHERE family_id = ?", [id]);
    await run("DELETE FROM families WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/people", async (req, res) => {
  try {
    const { familyId } = req.query;
    const params = [];
    let sql =
      "SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear, photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor FROM people";

    if (familyId) {
      sql += " WHERE family_id = ?";
      params.push(familyId);
    }

    sql += " ORDER BY id ASC";

    const people = await all(sql, params);
    res.json(people.map(sanitizePerson));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/people", async (req, res) => {
  try {
    const {
      familyId,
      name,
      gender = "M",
      birthYear = "",
      deathYear = "",
      photo = "",
      bio = "",
      parent = 0,
      parent2 = 0,
      spouse = 0,
      divorced = 0,
      isPinned = 0,
      pinColor = "#f59e0b",
    } = req.body;
    const parentId = parseId(parent);
    const parent2Id = parseId(parent2);
    const spouseId = parseId(spouse);

    if (!familyId || !name) {
      return res.status(400).json({ error: "familyId and name are required" });
    }
    const validationError = await validatePersonPayload({
      familyId,
      parent: parentId,
      parent2: parent2Id,
      spouse: spouseId,
    });
    if (validationError) return res.status(400).json({ error: validationError });

    const result = await run(
      `INSERT INTO people
        (family_id, name, gender, birth_year, death_year, photo, bio, parent, parent2, spouse, divorced, is_pinned, pin_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , [
        familyId,
        name,
        gender,
        birthYear,
        deathYear,
        photo,
        bio,
        parentId,
        parent2Id,
        spouseId,
        divorced,
        isPinned ? 1 : 0,
        String(pinColor || "#f59e0b"),
      ]
    );

    const person = await get(
      `SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear,
        photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor
        FROM people WHERE id = ?`,
      [result.lastID]
    );

    res.status(201).json(sanitizePerson(person));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/people/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      familyId,
      name,
      gender = "M",
      birthYear = "",
      deathYear = "",
      photo = "",
      bio = "",
      parent = 0,
      parent2 = 0,
      spouse = 0,
      divorced = 0,
      isPinned = 0,
      pinColor = "#f59e0b",
    } = req.body;
    const personId = parseId(id);
    const parentId = parseId(parent);
    const parent2Id = parseId(parent2);
    const spouseId = parseId(spouse);

    if (!familyId || !name) {
      return res.status(400).json({ error: "familyId and name are required" });
    }
    const validationError = await validatePersonPayload({
      id: personId,
      familyId,
      parent: parentId,
      parent2: parent2Id,
      spouse: spouseId,
    });
    if (validationError) return res.status(400).json({ error: validationError });

    await run(
      `UPDATE people
        SET family_id = ?, name = ?, gender = ?, birth_year = ?, death_year = ?, photo = ?, bio = ?, parent = ?, parent2 = ?, spouse = ?, divorced = ?, is_pinned = ?, pin_color = ?
        WHERE id = ?`,
      [
        familyId,
        name,
        gender,
        birthYear,
        deathYear,
        photo,
        bio,
        parentId,
        parent2Id,
        spouseId,
        divorced,
        isPinned ? 1 : 0,
        String(pinColor || "#f59e0b"),
        personId,
      ]
    );

    const person = await get(
      `SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear,
        photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor
        FROM people WHERE id = ?`,
      [id]
    );

    res.json(sanitizePerson(person));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/people/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await run(
      `UPDATE people
        SET parent = CASE WHEN parent = ? THEN 0 ELSE parent END,
            parent2 = CASE WHEN parent2 = ? THEN 0 ELSE parent2 END,
            spouse = CASE WHEN spouse = ? THEN 0 ELSE spouse END`,
      [id, id, id]
    );

    await run("DELETE FROM relationships WHERE person1_id = ? OR person2_id = ?", [id, id]);
    await run("DELETE FROM people_tags WHERE person_id = ?", [id]);
    await run("DELETE FROM gallery_photo_tags WHERE person_id = ?", [id]);
    await run("DELETE FROM person_health WHERE person_id = ?", [id]);
    await run("DELETE FROM people WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/family-health", async (req, res) => {
  try {
    const familyId = parseId(req.query.familyId);
    if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });
    const row = await get(
      "SELECT family_id as familyId, hereditary_conditions as hereditaryConditions, risk_factors as riskFactors, notes, updated_at as updatedAt FROM family_health WHERE family_id = ?",
      [familyId]
    );
    res.json(
      row || {
        familyId,
        hereditaryConditions: "",
        riskFactors: "",
        notes: "",
        updatedAt: "",
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/family-health", async (req, res) => {
  try {
    const {
      familyId,
      hereditaryConditions = "",
      riskFactors = "",
      notes = "",
    } = req.body;
    const id = parseId(familyId);
    if (!id) return res.status(400).json({ error: "familyId je obavezan." });

    await run(
      `INSERT INTO family_health (family_id, hereditary_conditions, risk_factors, notes, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(family_id) DO UPDATE SET
         hereditary_conditions = excluded.hereditary_conditions,
         risk_factors = excluded.risk_factors,
         notes = excluded.notes,
         updated_at = datetime('now')`,
      [id, hereditaryConditions, riskFactors, notes]
    );

    const row = await get(
      "SELECT family_id as familyId, hereditary_conditions as hereditaryConditions, risk_factors as riskFactors, notes, updated_at as updatedAt FROM family_health WHERE family_id = ?",
      [id]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/person-health", async (req, res) => {
  try {
    const familyId = parseId(req.query.familyId);
    if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });
    const rows = await all(
      "SELECT person_id as personId, family_id as familyId, hereditary_conditions as hereditaryConditions, risk_factors as riskFactors, notes, updated_at as updatedAt FROM person_health WHERE family_id = ? ORDER BY person_id ASC",
      [familyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/people/:id/health", async (req, res) => {
  try {
    const personId = parseId(req.params.id);
    const {
      familyId,
      hereditaryConditions = "",
      riskFactors = "",
      notes = "",
    } = req.body;
    const id = parseId(familyId);
    if (!personId || !id) return res.status(400).json({ error: "familyId i personId su obavezni." });

    const exists = await get("SELECT id FROM people WHERE id = ? AND family_id = ?", [personId, id]);
    if (!exists) return res.status(404).json({ error: "Osoba nije pronađena u porodici." });

    await run(
      `INSERT INTO person_health (family_id, person_id, hereditary_conditions, risk_factors, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(person_id) DO UPDATE SET
         family_id = excluded.family_id,
         hereditary_conditions = excluded.hereditary_conditions,
         risk_factors = excluded.risk_factors,
         notes = excluded.notes,
         updated_at = datetime('now')`,
      [id, personId, hereditaryConditions, riskFactors, notes]
    );

    const row = await get(
      "SELECT person_id as personId, family_id as familyId, hereditary_conditions as hereditaryConditions, risk_factors as riskFactors, notes, updated_at as updatedAt FROM person_health WHERE person_id = ?",
      [personId]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/relationships", async (req, res) => {
  try {
    const { familyId } = req.query;
    const params = [];
    let sql =
      "SELECT id, family_id as familyId, person1_id as person1Id, person2_id as person2Id, status, start_date as startDate, end_date as endDate, notes, is_current as isCurrent, created_at as createdAt, updated_at as updatedAt FROM relationships";

    if (familyId) {
      sql += " WHERE family_id = ?";
      params.push(familyId);
    }
    sql += " ORDER BY updated_at DESC, id DESC";

    const rows = await all(sql, params);
    res.json(rows.map(sanitizeRelationship));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/relationships", async (req, res) => {
  try {
    const {
      familyId,
      person1Id,
      person2Id,
      status = "partner",
      startDate = "",
      endDate = "",
      notes = "",
      isCurrent = 1,
    } = req.body;

    const p1 = parseId(person1Id);
    const p2 = parseId(person2Id);
    if (!familyId || !p1 || !p2) {
      return res.status(400).json({ error: "familyId, person1Id i person2Id su obavezni." });
    }
    if (p1 === p2) {
      return res.status(400).json({ error: "Veza mora sadržavati dvije različite osobe." });
    }
    if (!RELATIONSHIP_STATUSES.has(status)) {
      return res.status(400).json({ error: "Neispravan status veze." });
    }

    const personRows = await all("SELECT id FROM people WHERE family_id = ? AND id IN (?, ?)", [
      familyId,
      p1,
      p2,
    ]);
    if (personRows.length !== 2) {
      return res.status(400).json({ error: "Obje osobe moraju postojati u istoj porodici." });
    }

    const firstId = Math.min(p1, p2);
    const secondId = Math.max(p1, p2);
    const result = await run(
      `INSERT INTO relationships
        (family_id, person1_id, person2_id, status, start_date, end_date, notes, is_current, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [familyId, firstId, secondId, status, startDate, endDate, notes, isCurrent ? 1 : 0]
    );

    const row = await get(
      "SELECT id, family_id as familyId, person1_id as person1Id, person2_id as person2Id, status, start_date as startDate, end_date as endDate, notes, is_current as isCurrent, created_at as createdAt, updated_at as updatedAt FROM relationships WHERE id = ?",
      [result.lastID]
    );
    res.status(201).json(sanitizeRelationship(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/relationships/:id", async (req, res) => {
  try {
    const relationshipId = parseId(req.params.id);
    const {
      familyId,
      person1Id,
      person2Id,
      status = "partner",
      startDate = "",
      endDate = "",
      notes = "",
      isCurrent = 1,
    } = req.body;

    const p1 = parseId(person1Id);
    const p2 = parseId(person2Id);
    if (!relationshipId || !familyId || !p1 || !p2) {
      return res.status(400).json({ error: "id, familyId, person1Id i person2Id su obavezni." });
    }
    if (p1 === p2) {
      return res.status(400).json({ error: "Veza mora sadržavati dvije različite osobe." });
    }
    if (!RELATIONSHIP_STATUSES.has(status)) {
      return res.status(400).json({ error: "Neispravan status veze." });
    }

    const personRows = await all("SELECT id FROM people WHERE family_id = ? AND id IN (?, ?)", [
      familyId,
      p1,
      p2,
    ]);
    if (personRows.length !== 2) {
      return res.status(400).json({ error: "Obje osobe moraju postojati u istoj porodici." });
    }

    const firstId = Math.min(p1, p2);
    const secondId = Math.max(p1, p2);
    await run(
      `UPDATE relationships
        SET family_id = ?, person1_id = ?, person2_id = ?, status = ?, start_date = ?, end_date = ?, notes = ?, is_current = ?, updated_at = datetime('now')
        WHERE id = ?`,
      [familyId, firstId, secondId, status, startDate, endDate, notes, isCurrent ? 1 : 0, relationshipId]
    );

    const row = await get(
      "SELECT id, family_id as familyId, person1_id as person1Id, person2_id as person2Id, status, start_date as startDate, end_date as endDate, notes, is_current as isCurrent, created_at as createdAt, updated_at as updatedAt FROM relationships WHERE id = ?",
      [relationshipId]
    );
    if (!row) return res.status(404).json({ error: "Veza nije pronađena." });
    res.json(sanitizeRelationship(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/relationships/:id", async (req, res) => {
  try {
    const relationshipId = parseId(req.params.id);
    if (!relationshipId) return res.status(400).json({ error: "Neispravan id veze." });
    await run("DELETE FROM relationships WHERE id = ?", [relationshipId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tags", async (req, res) => {
  try {
    const { familyId } = req.query;
    const params = [];
    let sql = "SELECT id, family_id as familyId, name, created_at as createdAt FROM tags";
    if (familyId) {
      sql += " WHERE family_id = ?";
      params.push(familyId);
    }
    sql += " ORDER BY name COLLATE NOCASE ASC";
    const tags = await all(sql, params);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tags", async (req, res) => {
  try {
    const { familyId, name } = req.body;
    if (!familyId || !name) {
      return res.status(400).json({ error: "familyId and name are required" });
    }
    const existing = await get(
      "SELECT id, family_id as familyId, name FROM tags WHERE family_id = ? AND name = ?",
      [familyId, name.trim()]
    );
    if (existing) return res.status(200).json(existing);

    const result = await run("INSERT INTO tags (family_id, name) VALUES (?, ?)", [
      familyId,
      name.trim(),
    ]);
    const tag = await get(
      "SELECT id, family_id as familyId, name, created_at as createdAt FROM tags WHERE id = ?",
      [result.lastID]
    );
    res.status(201).json(tag);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/tags/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await run("DELETE FROM people_tags WHERE tag_id = ?", [id]);
    await run("DELETE FROM tags WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tag-links", async (req, res) => {
  try {
    const { familyId } = req.query;
    const params = [];
    let sql = "SELECT person_id as personId, tag_id as tagId FROM people_tags";
    if (familyId) {
      sql += " WHERE family_id = ?";
      params.push(familyId);
    }
    const links = await all(sql, params);
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/people/:id/tags", async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId, tagIds } = req.body;
    if (!familyId || !Array.isArray(tagIds)) {
      return res.status(400).json({ error: "familyId and tagIds are required" });
    }

    await run("DELETE FROM people_tags WHERE person_id = ?", [id]);
    for (const tagId of tagIds) {
      if (!tagId) continue;
      await run(
        "INSERT OR IGNORE INTO people_tags (family_id, person_id, tag_id) VALUES (?, ?, ?)",
        [familyId, id, tagId]
      );
    }

    const links = await all(
      "SELECT person_id as personId, tag_id as tagId FROM people_tags WHERE person_id = ?",
      [id]
    );
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/gallery/photos", async (req, res) => {
  try {
    const familyId = parseId(req.query.familyId);
    if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });

    const photos = await all(
      "SELECT id, family_id as familyId, src, created_at as createdAt FROM gallery_photos WHERE family_id = ? ORDER BY id DESC",
      [familyId]
    );
    if (photos.length === 0) return res.json([]);

    const photoIds = photos.map((row) => row.id);
    const placeholders = photoIds.map(() => "?").join(",");
    const tags = await all(
      `SELECT id, photo_id as photoId, person_id as personId, x, y, created_at as createdAt
       FROM gallery_photo_tags WHERE photo_id IN (${placeholders}) ORDER BY id ASC`,
      photoIds
    );

    const tagsByPhoto = new Map();
    tags.forEach((tag) => {
      const list = tagsByPhoto.get(tag.photoId) || [];
      list.push({
        id: tag.id,
        personId: tag.personId,
        x: clampPercent(tag.x),
        y: clampPercent(tag.y),
        createdAt: tag.createdAt,
      });
      tagsByPhoto.set(tag.photoId, list);
    });

    res.json(
      photos.map((photo) => ({
        id: photo.id,
        familyId: photo.familyId,
        src: photo.src,
        createdAt: photo.createdAt,
        tags: tagsByPhoto.get(photo.id) || [],
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/gallery/photo", async (req, res) => {
  try {
    const familyId = parseId(req.body?.familyId);
    const rawPhoto = req.body?.photo || {};
    const incomingPhotoId = parseId(rawPhoto?.id);
    const src = String(rawPhoto?.src || "").trim();
    const tags = Array.isArray(rawPhoto?.tags) ? rawPhoto.tags : [];

    if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });
    if (!src || src.toLowerCase() === "null" || src.toLowerCase() === "undefined") {
      return res.status(400).json({ error: "src je obavezan." });
    }

    const familyExists = await get("SELECT id FROM families WHERE id = ?", [familyId]);
    if (!familyExists) return res.status(404).json({ error: "Porodica nije pronađena." });

    const personRows = await all("SELECT id FROM people WHERE family_id = ?", [familyId]);
    const personIds = new Set(personRows.map((row) => Number(row.id)));

    let photoId = incomingPhotoId;
    if (photoId) {
      const existing = await get(
        "SELECT id FROM gallery_photos WHERE id = ? AND family_id = ?",
        [photoId, familyId]
      );
      if (!existing) {
        return res.status(404).json({ error: "Fotografija nije pronađena u porodici." });
      }
      await run("UPDATE gallery_photos SET src = ? WHERE id = ?", [src, photoId]);
      await run("DELETE FROM gallery_photo_tags WHERE photo_id = ?", [photoId]);
    } else {
      const insertResult = await run(
        "INSERT INTO gallery_photos (family_id, src) VALUES (?, ?)",
        [familyId, src]
      );
      photoId = insertResult.lastID;
    }

    for (const rawTag of tags) {
      const personId = parseId(rawTag?.personId);
      if (!personIds.has(personId)) continue;
      await run(
        "INSERT INTO gallery_photo_tags (photo_id, person_id, x, y) VALUES (?, ?, ?, ?)",
        [photoId, personId, clampPercent(rawTag?.x), clampPercent(rawTag?.y)]
      );
    }

    const photo = await get(
      "SELECT id, family_id as familyId, src, created_at as createdAt FROM gallery_photos WHERE id = ?",
      [photoId]
    );
    const photoTags = await all(
      `SELECT id, photo_id as photoId, person_id as personId, x, y, created_at as createdAt
       FROM gallery_photo_tags WHERE photo_id = ? ORDER BY id ASC`,
      [photoId]
    );

    res.json({
      id: photo.id,
      familyId: photo.familyId,
      src: photo.src,
      createdAt: photo.createdAt,
      tags: photoTags.map((tag) => ({
        id: tag.id,
        personId: tag.personId,
        x: clampPercent(tag.x),
        y: clampPercent(tag.y),
        createdAt: tag.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/gallery/photos", async (req, res) => {
  const familyId = parseId(req.body?.familyId);
  const photos = Array.isArray(req.body?.photos) ? req.body.photos : null;
  if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });
  if (!Array.isArray(photos)) return res.status(400).json({ error: "photos mora biti niz." });

  try {
    const familyExists = await get("SELECT id FROM families WHERE id = ?", [familyId]);
    if (!familyExists) return res.status(404).json({ error: "Porodica nije pronađena." });

    const personRows = await all("SELECT id FROM people WHERE family_id = ?", [familyId]);
    const personIds = new Set(personRows.map((row) => Number(row.id)));

    await run("BEGIN TRANSACTION");
    await run(
      "DELETE FROM gallery_photo_tags WHERE photo_id IN (SELECT id FROM gallery_photos WHERE family_id = ?)",
      [familyId]
    );
    await run("DELETE FROM gallery_photos WHERE family_id = ?", [familyId]);

    for (const rawPhoto of photos) {
      const src = String(rawPhoto?.src || "").trim();
      if (!src) continue;
      const photoResult = await run(
        "INSERT INTO gallery_photos (family_id, src) VALUES (?, ?)",
        [familyId, src]
      );
      const photoId = photoResult.lastID;
      const tags = Array.isArray(rawPhoto?.tags) ? rawPhoto.tags : [];
      for (const rawTag of tags) {
        const personId = parseId(rawTag?.personId);
        if (!personIds.has(personId)) continue;
        await run(
          "INSERT INTO gallery_photo_tags (photo_id, person_id, x, y) VALUES (?, ?, ?, ?)",
          [photoId, personId, clampPercent(rawTag?.x), clampPercent(rawTag?.y)]
        );
      }
    }
    await run("COMMIT");

    const savedPhotos = await all(
      "SELECT id, family_id as familyId, src, created_at as createdAt FROM gallery_photos WHERE family_id = ? ORDER BY id DESC",
      [familyId]
    );
    if (savedPhotos.length === 0) return res.json([]);

    const savedPhotoIds = savedPhotos.map((row) => row.id);
    const placeholders = savedPhotoIds.map(() => "?").join(",");
    const savedTags = await all(
      `SELECT id, photo_id as photoId, person_id as personId, x, y, created_at as createdAt
       FROM gallery_photo_tags WHERE photo_id IN (${placeholders}) ORDER BY id ASC`,
      savedPhotoIds
    );
    const tagsByPhoto = new Map();
    savedTags.forEach((tag) => {
      const list = tagsByPhoto.get(tag.photoId) || [];
      list.push({
        id: tag.id,
        personId: tag.personId,
        x: clampPercent(tag.x),
        y: clampPercent(tag.y),
        createdAt: tag.createdAt,
      });
      tagsByPhoto.set(tag.photoId, list);
    });

    res.json(
      savedPhotos.map((photo) => ({
        id: photo.id,
        familyId: photo.familyId,
        src: photo.src,
        createdAt: photo.createdAt,
        tags: tagsByPhoto.get(photo.id) || [],
      }))
    );
  } catch (err) {
    try {
      await run("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/gallery/photos/:photoId", async (req, res) => {
  try {
    const photoId = parseId(req.params.photoId);
    const familyId = parseId(req.query.familyId || req.body?.familyId);
    if (!photoId || !familyId) {
      return res.status(400).json({ error: "photoId i familyId su obavezni." });
    }

    const existing = await get(
      "SELECT id FROM gallery_photos WHERE id = ? AND family_id = ?",
      [photoId, familyId]
    );
    if (!existing) return res.status(404).json({ error: "Fotografija nije pronađena." });

    await run("DELETE FROM gallery_photo_tags WHERE photo_id = ?", [photoId]);
    await run("DELETE FROM gallery_photos WHERE id = ?", [photoId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/families/:familyId/gallery", async (req, res) => {
  try {
    const familyId = parseId(req.params.familyId);
    if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });

    const photos = await all(
      "SELECT id, family_id as familyId, src, created_at as createdAt FROM gallery_photos WHERE family_id = ? ORDER BY id DESC",
      [familyId]
    );
    if (photos.length === 0) return res.json([]);

    const photoIds = photos.map((row) => row.id);
    const placeholders = photoIds.map(() => "?").join(",");
    const tags = await all(
      `SELECT id, photo_id as photoId, person_id as personId, x, y, created_at as createdAt
       FROM gallery_photo_tags WHERE photo_id IN (${placeholders}) ORDER BY id ASC`,
      photoIds
    );

    const tagsByPhoto = new Map();
    tags.forEach((tag) => {
      const list = tagsByPhoto.get(tag.photoId) || [];
      list.push({
        id: tag.id,
        personId: tag.personId,
        x: clampPercent(tag.x),
        y: clampPercent(tag.y),
        createdAt: tag.createdAt,
      });
      tagsByPhoto.set(tag.photoId, list);
    });

    res.json(
      photos.map((photo) => ({
        id: photo.id,
        familyId: photo.familyId,
        src: photo.src,
        createdAt: photo.createdAt,
        tags: tagsByPhoto.get(photo.id) || [],
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/families/:familyId/gallery", async (req, res) => {
  const familyId = parseId(req.params.familyId);
  const photos = Array.isArray(req.body?.photos) ? req.body.photos : null;
  if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });
  if (!Array.isArray(photos)) return res.status(400).json({ error: "photos mora biti niz." });

  try {
    const familyExists = await get("SELECT id FROM families WHERE id = ?", [familyId]);
    if (!familyExists) return res.status(404).json({ error: "Porodica nije pronađena." });

    const personRows = await all("SELECT id FROM people WHERE family_id = ?", [familyId]);
    const personIds = new Set(personRows.map((row) => Number(row.id)));

    await run("BEGIN TRANSACTION");
    await run(
      "DELETE FROM gallery_photo_tags WHERE photo_id IN (SELECT id FROM gallery_photos WHERE family_id = ?)",
      [familyId]
    );
    await run("DELETE FROM gallery_photos WHERE family_id = ?", [familyId]);

    for (const rawPhoto of photos) {
      const src = String(rawPhoto?.src || "").trim();
      if (!src) continue;
      const photoResult = await run(
        "INSERT INTO gallery_photos (family_id, src) VALUES (?, ?)",
        [familyId, src]
      );
      const photoId = photoResult.lastID;
      const tags = Array.isArray(rawPhoto?.tags) ? rawPhoto.tags : [];
      for (const rawTag of tags) {
        const personId = parseId(rawTag?.personId);
        if (!personIds.has(personId)) continue;
        await run(
          "INSERT INTO gallery_photo_tags (photo_id, person_id, x, y) VALUES (?, ?, ?, ?)",
          [photoId, personId, clampPercent(rawTag?.x), clampPercent(rawTag?.y)]
        );
      }
    }
    await run("COMMIT");

    const savedPhotos = await all(
      "SELECT id, family_id as familyId, src, created_at as createdAt FROM gallery_photos WHERE family_id = ? ORDER BY id DESC",
      [familyId]
    );
    if (savedPhotos.length === 0) return res.json([]);

    const savedPhotoIds = savedPhotos.map((row) => row.id);
    const placeholders = savedPhotoIds.map(() => "?").join(",");
    const savedTags = await all(
      `SELECT id, photo_id as photoId, person_id as personId, x, y, created_at as createdAt
       FROM gallery_photo_tags WHERE photo_id IN (${placeholders}) ORDER BY id ASC`,
      savedPhotoIds
    );
    const tagsByPhoto = new Map();
    savedTags.forEach((tag) => {
      const list = tagsByPhoto.get(tag.photoId) || [];
      list.push({
        id: tag.id,
        personId: tag.personId,
        x: clampPercent(tag.x),
        y: clampPercent(tag.y),
        createdAt: tag.createdAt,
      });
      tagsByPhoto.set(tag.photoId, list);
    });

    res.json(
      savedPhotos.map((photo) => ({
        id: photo.id,
        familyId: photo.familyId,
        src: photo.src,
        createdAt: photo.createdAt,
        tags: tagsByPhoto.get(photo.id) || [],
      }))
    );
  } catch (err) {
    try {
      await run("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/people/import", async (req, res) => {
  try {
    const { familyId, people } = req.body;
    if (!familyId || !Array.isArray(people)) {
      return res.status(400).json({ error: "familyId and people array are required" });
    }

    const inserted = [];
    for (const person of people) {
      if (!person.name) continue;
      const result = await run(
        `INSERT INTO people
          (family_id, name, gender, birth_year, death_year, photo, bio, parent, parent2, spouse, divorced, is_pinned, pin_color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        , [
          familyId,
          person.name,
          person.gender || "M",
          person.birthYear || "",
          person.deathYear || "",
          person.photo || "",
          person.bio || "",
          person.parent || 0,
          person.parent2 || 0,
          person.spouse || 0,
          person.divorced || 0,
          person.isPinned ? 1 : 0,
          person.pinColor || "#f59e0b",
        ]
      );
      inserted.push(result.lastID);
    }

    const rows = await all(
      `SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear,
        photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor
        FROM people WHERE family_id = ? ORDER BY id ASC`,
      [familyId]
    );

    res.json({ inserted: inserted.length, people: rows.map(sanitizePerson) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/export", async (req, res) => {
  try {
    const familyId = parseId(req.query.familyId);
    if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });

    const family = await get(
      "SELECT id, name, notes, created_at as createdAt FROM families WHERE id = ?",
      [familyId]
    );
    if (!family) return res.status(404).json({ error: "Porodica nije pronađena." });

    const people = await all(
      "SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear, photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor, created_at as createdAt FROM people WHERE family_id = ? ORDER BY id ASC",
      [familyId]
    );
    const tags = await all(
      "SELECT id, family_id as familyId, name, created_at as createdAt FROM tags WHERE family_id = ? ORDER BY id ASC",
      [familyId]
    );
    const tagLinks = await all(
      "SELECT person_id as personId, tag_id as tagId FROM people_tags WHERE family_id = ?",
      [familyId]
    );
    const relationships = await all(
      "SELECT id, family_id as familyId, person1_id as person1Id, person2_id as person2Id, status, start_date as startDate, end_date as endDate, notes, is_current as isCurrent, created_at as createdAt, updated_at as updatedAt FROM relationships WHERE family_id = ? ORDER BY id ASC",
      [familyId]
    );
    const familyHealth =
      (await get(
        "SELECT family_id as familyId, hereditary_conditions as hereditaryConditions, risk_factors as riskFactors, notes, updated_at as updatedAt FROM family_health WHERE family_id = ?",
        [familyId]
      )) || null;
    const personHealth = await all(
      "SELECT person_id as personId, family_id as familyId, hereditary_conditions as hereditaryConditions, risk_factors as riskFactors, notes, updated_at as updatedAt FROM person_health WHERE family_id = ? ORDER BY person_id ASC",
      [familyId]
    );

    res.json({
      schemaVersion: "2.0",
      exportedAt: new Date().toISOString(),
      family,
      people: people.map(sanitizePerson),
      tags,
      tagLinks,
      relationships: relationships.map(sanitizeRelationship),
      familyHealth,
      personHealth,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/import/v2", async (req, res) => {
  const familyId = parseId(req.body?.familyId);
  const payload = req.body?.payload;
  if (!familyId) return res.status(400).json({ error: "familyId je obavezan." });

  const validationError = validateImportPayload(payload);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const familyExists = await get("SELECT id FROM families WHERE id = ?", [familyId]);
    if (!familyExists) return res.status(404).json({ error: "Porodica nije pronađena." });

    await run("BEGIN TRANSACTION");
    const people = payload.people || [];
    const tags = payload.tags || [];
    const tagLinks = payload.tagLinks || [];
    const relationships = payload.relationships || [];
    const familyHealth = payload.familyHealth || null;
    const personHealth = payload.personHealth || [];

    const personIdMap = new Map();
    for (const row of people) {
      const result = await run(
        `INSERT INTO people
          (family_id, name, gender, birth_year, death_year, photo, bio, parent, parent2, spouse, divorced, is_pinned, pin_color)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
        [
          familyId,
          row.name,
          row.gender || "M",
          row.birthYear || "",
          row.deathYear || "",
          row.photo || "",
          row.bio || "",
          row.divorced ? 1 : 0,
          row.isPinned ? 1 : 0,
          row.pinColor || "#f59e0b",
        ]
      );
      personIdMap.set(normalizeImportPersonRef(row.id), result.lastID);
    }

    for (const row of people) {
      const newPersonId = personIdMap.get(normalizeImportPersonRef(row.id));
      await run(
        "UPDATE people SET parent = ?, parent2 = ?, spouse = ? WHERE id = ?",
        [
          personIdMap.get(normalizeImportPersonRef(row.parent)) || 0,
          personIdMap.get(normalizeImportPersonRef(row.parent2)) || 0,
          personIdMap.get(normalizeImportPersonRef(row.spouse)) || 0,
          newPersonId,
        ]
      );
    }

    const tagIdMap = new Map();
    for (const row of tags) {
      const result = await run("INSERT INTO tags (family_id, name) VALUES (?, ?)", [
        familyId,
        String(row.name || "").trim(),
      ]);
      tagIdMap.set(normalizeImportPersonRef(row.id), result.lastID);
    }

    for (const row of tagLinks) {
      const personId = personIdMap.get(normalizeImportPersonRef(row.personId));
      const tagId = tagIdMap.get(normalizeImportPersonRef(row.tagId));
      if (!personId || !tagId) continue;
      await run(
        "INSERT OR IGNORE INTO people_tags (family_id, person_id, tag_id) VALUES (?, ?, ?)",
        [familyId, personId, tagId]
      );
    }

    for (const row of relationships) {
      const p1 = personIdMap.get(normalizeImportPersonRef(row.person1Id));
      const p2 = personIdMap.get(normalizeImportPersonRef(row.person2Id));
      if (!p1 || !p2) continue;
      const firstId = Math.min(p1, p2);
      const secondId = Math.max(p1, p2);
      await run(
        `INSERT INTO relationships
          (family_id, person1_id, person2_id, status, start_date, end_date, notes, is_current, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          familyId,
          firstId,
          secondId,
          normalizeImportStatus(row.status) || "partner",
          row.startDate || "",
          row.endDate || "",
          row.notes || "",
          row.isCurrent ? 1 : 0,
        ]
      );
    }

    if (familyHealth) {
      await run(
        `INSERT INTO family_health (family_id, hereditary_conditions, risk_factors, notes, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(family_id) DO UPDATE SET
           hereditary_conditions = excluded.hereditary_conditions,
           risk_factors = excluded.risk_factors,
           notes = excluded.notes,
           updated_at = datetime('now')`,
        [
          familyId,
          familyHealth.hereditaryConditions || "",
          familyHealth.riskFactors || "",
          familyHealth.notes || "",
        ]
      );
    }

    for (const row of personHealth) {
      const personId = personIdMap.get(normalizeImportPersonRef(row.personId));
      if (!personId) continue;
      await run(
        `INSERT INTO person_health (family_id, person_id, hereditary_conditions, risk_factors, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(person_id) DO UPDATE SET
           family_id = excluded.family_id,
           hereditary_conditions = excluded.hereditary_conditions,
           risk_factors = excluded.risk_factors,
           notes = excluded.notes,
           updated_at = datetime('now')`,
        [familyId, personId, row.hereditaryConditions || "", row.riskFactors || "", row.notes || ""]
      );
    }

    await run("COMMIT");
    res.json({
      ok: true,
      inserted: {
        people: people.length,
        tags: tags.length,
        tagLinks: tagLinks.length,
        relationships: relationships.length,
        personHealth: personHealth.length,
      },
    });
  } catch (err) {
    try {
      await run("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: err.message });
  }
});

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to init DB", err);
    process.exit(1);
  });
