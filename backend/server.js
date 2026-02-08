const express = require("express");
const cors = require("cors");
const { init, all, get, run } = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "12mb" }));

const sanitizePerson = (person) => {
  const cleaned = { ...person };
  cleaned.parent = cleaned.parent || 0;
  cleaned.parent2 = cleaned.parent2 || 0;
  cleaned.spouse = cleaned.spouse || 0;
  cleaned.divorced = cleaned.divorced ? 1 : 0;
  if (cleaned.parent === cleaned.id) cleaned.parent = 0;
  if (cleaned.parent2 === cleaned.id) cleaned.parent2 = 0;
  if (cleaned.parent2 && cleaned.parent2 === cleaned.parent) cleaned.parent2 = 0;
  if (cleaned.spouse === cleaned.id) cleaned.spouse = 0;
  if (!cleaned.spouse) cleaned.divorced = 0;
  return cleaned;
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
      "SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear, photo, bio, parent, parent2, spouse, divorced FROM people";

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
    } = req.body;

    if (!familyId || !name) {
      return res.status(400).json({ error: "familyId and name are required" });
    }

    const result = await run(
      `INSERT INTO people
        (family_id, name, gender, birth_year, death_year, photo, bio, parent, parent2, spouse, divorced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , [
        familyId,
        name,
        gender,
        birthYear,
        deathYear,
        photo,
        bio,
        parent,
        parent2,
        spouse,
        divorced,
      ]
    );

    const person = await get(
      `SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear,
        photo, bio, parent, parent2, spouse, divorced
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
    } = req.body;

    if (!familyId || !name) {
      return res.status(400).json({ error: "familyId and name are required" });
    }

    await run(
      `UPDATE people
        SET family_id = ?, name = ?, gender = ?, birth_year = ?, death_year = ?, photo = ?, bio = ?, parent = ?, parent2 = ?, spouse = ?, divorced = ?
        WHERE id = ?`,
      [familyId, name, gender, birthYear, deathYear, photo, bio, parent, parent2, spouse, divorced, id]
    );

    const person = await get(
      `SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear,
        photo, bio, parent, parent2, spouse, divorced
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

    await run("DELETE FROM people WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
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
          (family_id, name, gender, birth_year, death_year, photo, bio, parent, parent2, spouse, divorced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        ]
      );
      inserted.push(result.lastID);
    }

    const rows = await all(
      `SELECT id, family_id as familyId, name, gender, birth_year as birthYear, death_year as deathYear,
        photo, bio, parent, parent2, spouse, divorced
        FROM people WHERE family_id = ? ORDER BY id ASC`,
      [familyId]
    );

    res.json({ inserted: inserted.length, people: rows.map(sanitizePerson) });
  } catch (err) {
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
