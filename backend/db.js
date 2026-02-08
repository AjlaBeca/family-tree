const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "data", "family.db");
const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const columnExists = async (table, column) => {
  const rows = await all(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
};

const init = async () => {
  await run(
    `CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      gender TEXT DEFAULT 'M',
      birth_year TEXT DEFAULT '',
      death_year TEXT DEFAULT '',
      photo TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      parent INTEGER DEFAULT 0,
      parent2 INTEGER DEFAULT 0,
      spouse INTEGER DEFAULT 0,
      divorced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id)
    )`
  );

  if (!(await columnExists("people", "divorced"))) {
    await run("ALTER TABLE people ADD COLUMN divorced INTEGER DEFAULT 0");
  }

  const familyCount = await get("SELECT COUNT(*) as count FROM families");
  if (!familyCount || familyCount.count === 0) {
    const family = await run("INSERT INTO families (name, notes) VALUES (?, ?)", [
      "Doe Family",
      "Default sample family",
    ]);

    const familyId = family.lastID;
    const seed = [
      [familyId, "John Doe", "M", "1950", "", "", "", 0, 0, 2],
      [familyId, "Jane Doe", "F", "1952", "", "", "", 0, 0, 1],
      [familyId, "Mike Doe", "M", "1975", "", "", "", 1, 2, 4],
      [familyId, "Sarah Smith", "F", "1977", "", "", "", 0, 0, 3],
      [familyId, "Emma Doe", "F", "2000", "", "", "", 3, 4, 0],
      [familyId, "Lucas Doe", "M", "2002", "", "", "", 3, 4, 0],
    ];

    for (const row of seed) {
      await run(
        `INSERT INTO people
          (family_id, name, gender, birth_year, death_year, photo, bio, parent, parent2, spouse)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        , row
      );
    }
  }
};

module.exports = { db, run, all, get, init };
