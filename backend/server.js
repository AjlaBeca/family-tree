const express = require("express");
const { init, all, get, run } = require("./db");
const { applySecurity } = require("./middleware/security");
const {
  parseId,
  clampPercent,
  buildChildrenMap,
  hasPath,
  sanitizeRelationship,
  normalizeImportPersonRef,
  normalizeImportStatus,
  validateImportPayload,
} = require("./lib/server-utils");

const app = express();
const PORT = process.env.PORT || 5000;
const RELATIONSHIP_STATUSES = new Set([
  "partner",
  "married",
  "divorced",
  "separated",
  "widowed",
]);

applySecurity(app);

const sanitizePerson = (person) => {
  const cleaned = { ...person };
  cleaned.parent = cleaned.parent || 0;
  cleaned.parent2 = cleaned.parent2 || 0;
  cleaned.spouse = cleaned.spouse || 0;
  cleaned.divorced = cleaned.divorced ? 1 : 0;
  cleaned.isPinned = cleaned.isPinned ? 1 : 0;
  cleaned.pinColor = cleaned.pinColor || "#f59e0b";
  cleaned.birthPlace = String(cleaned.birthPlace || "").trim();
  cleaned.occupation = String(cleaned.occupation || "").trim();
  cleaned.burialPlace = String(cleaned.burialPlace || "").trim();
  if (cleaned.parent === cleaned.id) cleaned.parent = 0;
  if (cleaned.parent2 === cleaned.id) cleaned.parent2 = 0;
  if (cleaned.parent2 && cleaned.parent2 === cleaned.parent) cleaned.parent2 = 0;
  if (cleaned.spouse === cleaned.id) cleaned.spouse = 0;
  if (!cleaned.spouse) cleaned.divorced = 0;
  return cleaned;
};

const validatePersonPayload = async ({ id = 0, familyId, parent = 0, parent2 = 0, spouse = 0 }) => {
  const personId = parseId(id);
  const p1 = parseId(parent);
  const p2 = parseId(parent2);
  const spouseId = parseId(spouse);

  if (personId && p1 === personId) return "Otac ne može biti ista osoba.";
  if (personId && p2 === personId) return "Majka ne može biti ista osoba.";
  if (p1 && p2 && p1 === p2) return "Otac i majka moraju biti različite osobe.";
  if (personId && spouseId === personId) return "Supružnik ne može biti ista osoba.";

  const people = await all("SELECT id, parent, parent2 FROM people WHERE family_id = ?", [familyId]);
  const idSet = new Set(people.map((row) => row.id));

  if (p1 && !idSet.has(p1)) return "Otac ne postoji u aktivnoj porodici.";
  if (p2 && !idSet.has(p2)) return "Majka ne postoji u aktivnoj porodici.";
  if (spouseId && !idSet.has(spouseId)) return "Supružnik ne postoji u aktivnoj porodici.";

  if (!personId || !idSet.has(personId)) return null;

  const overrides = new Map([[personId, { parent: p1, parent2: p2 }]]);
  const childrenMap = buildChildrenMap(people, overrides);

  if (p1 && hasPath(childrenMap, personId, p1)) {
    return "Neispravna veza: Otac je potomak ove osobe (ciklus).";
  }
  if (p2 && hasPath(childrenMap, personId, p2)) {
    return "Neispravna veza: Majka je potomak ove osobe (ciklus).";
  }

  return null;
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
      "SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear, birth_place as birthPlace, occupation, burial_place as burialPlace, photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor FROM people";

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
      birthPlace = "",
      occupation = "",
      burialPlace = "",
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
        (family_id, name, gender, birth_year, death_year, birth_place, occupation, burial_place, photo, bio, parent, parent2, spouse, divorced, is_pinned, pin_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , [
        familyId,
        name,
        gender,
        birthYear,
        deathYear,
        birthPlace,
        occupation,
        burialPlace,
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
        birth_place as birthPlace, occupation, burial_place as burialPlace, photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor
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
      birthPlace = "",
      occupation = "",
      burialPlace = "",
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
        SET family_id = ?, name = ?, gender = ?, birth_year = ?, death_year = ?, birth_place = ?, occupation = ?, burial_place = ?, photo = ?, bio = ?, parent = ?, parent2 = ?, spouse = ?, divorced = ?, is_pinned = ?, pin_color = ?
        WHERE id = ?`,
      [
        familyId,
        name,
        gender,
        birthYear,
        deathYear,
        birthPlace,
        occupation,
        burialPlace,
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
        birth_place as birthPlace, occupation, burial_place as burialPlace, photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor
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
      "SELECT id, family_id as familyId, src, description, location, created_at as createdAt FROM gallery_photos WHERE family_id = ? ORDER BY id DESC",
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
        description: String(photo.description || ""),
        location: String(photo.location || ""),
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
    const description = String(rawPhoto?.description || "").trim();
    const location = String(rawPhoto?.location || "").trim();
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
      await run("UPDATE gallery_photos SET src = ?, description = ?, location = ? WHERE id = ?", [src, description, location, photoId]);
      await run("DELETE FROM gallery_photo_tags WHERE photo_id = ?", [photoId]);
    } else {
      const insertResult = await run(
        "INSERT INTO gallery_photos (family_id, src, description, location) VALUES (?, ?, ?, ?)",
        [familyId, src, description, location]
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
      "SELECT id, family_id as familyId, src, description, location, created_at as createdAt FROM gallery_photos WHERE id = ?",
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
      description: String(photo.description || ""),
      location: String(photo.location || ""),
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
      const description = String(rawPhoto?.description || "").trim();
      const location = String(rawPhoto?.location || "").trim();
      if (!src) continue;
      const photoResult = await run(
        "INSERT INTO gallery_photos (family_id, src, description, location) VALUES (?, ?, ?, ?)",
        [familyId, src, description, location]
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
      "SELECT id, family_id as familyId, src, description, location, created_at as createdAt FROM gallery_photos WHERE family_id = ? ORDER BY id DESC",
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
        description: String(photo.description || ""),
        location: String(photo.location || ""),
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
      "SELECT id, family_id as familyId, src, description, location, created_at as createdAt FROM gallery_photos WHERE family_id = ? ORDER BY id DESC",
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
        description: String(photo.description || ""),
        location: String(photo.location || ""),
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
      const description = String(rawPhoto?.description || "").trim();
      const location = String(rawPhoto?.location || "").trim();
      if (!src) continue;
      const photoResult = await run(
        "INSERT INTO gallery_photos (family_id, src, description, location) VALUES (?, ?, ?, ?)",
        [familyId, src, description, location]
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
      "SELECT id, family_id as familyId, src, description, location, created_at as createdAt FROM gallery_photos WHERE family_id = ? ORDER BY id DESC",
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
        description: String(photo.description || ""),
        location: String(photo.location || ""),
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
          (family_id, name, gender, birth_year, death_year, birth_place, occupation, burial_place, photo, bio, parent, parent2, spouse, divorced, is_pinned, pin_color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        , [
          familyId,
          person.name,
          person.gender || "M",
          person.birthYear || "",
          person.deathYear || "",
          person.birthPlace || "",
          person.occupation || "",
          person.burialPlace || "",
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
        birth_place as birthPlace, occupation, burial_place as burialPlace, photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor
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
      "SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear, birth_place as birthPlace, occupation, burial_place as burialPlace, photo, bio, parent, parent2, spouse, divorced, is_pinned as isPinned, pin_color as pinColor, created_at as createdAt FROM people WHERE family_id = ? ORDER BY id ASC",
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

  const validationError = validateImportPayload(payload, RELATIONSHIP_STATUSES);
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
          (family_id, name, gender, birth_year, death_year, birth_place, occupation, burial_place, photo, bio, parent, parent2, spouse, divorced, is_pinned, pin_color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
        [
          familyId,
          row.name,
          row.gender || "M",
          row.birthYear || "",
          row.deathYear || "",
          row.birthPlace || "",
          row.occupation || "",
          row.burialPlace || "",
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
          normalizeImportStatus(row.status, RELATIONSHIP_STATUSES) || "partner",
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

