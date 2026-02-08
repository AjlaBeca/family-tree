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

  await run(
    `CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS people_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(person_id, tag_id),
      FOREIGN KEY (family_id) REFERENCES families(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      person1_id INTEGER NOT NULL,
      person2_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'partner',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_current INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id)
    )`
  );

  await run(
    "CREATE INDEX IF NOT EXISTS idx_relationships_family ON relationships(family_id)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_relationships_person1 ON relationships(person1_id)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_relationships_person2 ON relationships(person2_id)"
  );

  await run(
    `CREATE TABLE IF NOT EXISTS family_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL UNIQUE,
      hereditary_conditions TEXT DEFAULT '',
      risk_factors TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS person_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL UNIQUE,
      hereditary_conditions TEXT DEFAULT '',
      risk_factors TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS gallery_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      src TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS gallery_photo_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      x REAL NOT NULL DEFAULT 50,
      y REAL NOT NULL DEFAULT 50,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (photo_id) REFERENCES gallery_photos(id)
    )`
  );

  await run(
    "CREATE INDEX IF NOT EXISTS idx_gallery_photos_family ON gallery_photos(family_id)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_gallery_photo_tags_photo ON gallery_photo_tags(photo_id)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_gallery_photo_tags_person ON gallery_photo_tags(person_id)"
  );

  await run(
    "CREATE INDEX IF NOT EXISTS idx_person_health_family ON person_health(family_id)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_person_health_person ON person_health(person_id)"
  );

  if (!(await columnExists("people", "divorced"))) {
    await run("ALTER TABLE people ADD COLUMN divorced INTEGER DEFAULT 0");
  }
  if (!(await columnExists("people", "is_pinned"))) {
    await run("ALTER TABLE people ADD COLUMN is_pinned INTEGER DEFAULT 0");
  }
  if (!(await columnExists("people", "pin_color"))) {
    await run("ALTER TABLE people ADD COLUMN pin_color TEXT DEFAULT '#f59e0b'");
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
