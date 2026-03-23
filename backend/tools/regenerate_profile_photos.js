/* eslint-disable no-console */
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "..", "data", "family.db");
const db = new sqlite3.Database(dbPath);

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const forceAll = args.has("--force-all");
const familyArg = process.argv.find((arg) => arg.startsWith("--family="));
const familyId = familyArg ? Number(familyArg.split("=")[1] || 0) : 0;

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const normalizeSource = (value) => String(value || "").trim();

const getDataUrlMeta = (src) => {
  const value = normalizeSource(src);
  if (!value.startsWith("data:")) return null;
  const commaIndex = value.indexOf(",");
  if (commaIndex <= 0) return null;
  const header = value.slice(0, commaIndex).toLowerCase();
  const payload = value.slice(commaIndex + 1);
  return { header, payload };
};

const getPngSize = (buffer) => {
  if (!buffer || buffer.length < 24) return null;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  if (!isPng) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const getJpegSize = (buffer) => {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (!segmentLength || segmentLength < 2) break;

    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && offset + 8 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
};

const getImageArea = (src) => {
  const meta = getDataUrlMeta(src);
  if (!meta) return 0;
  try {
    const buf = Buffer.from(meta.payload, "base64");
    const png = getPngSize(buf);
    if (png?.width && png?.height) return png.width * png.height;
    const jpg = getJpegSize(buf);
    if (jpg?.width && jpg?.height) return jpg.width * jpg.height;
  } catch {
    return 0;
  }
  return 0;
};

const isLikelyTinySource = (src) => {
  const area = getImageArea(src);
  if (!area) return false;
  return area < 120000; // roughly below ~346x346
};

const main = async () => {
  const peopleParams = [];
  const familyFilterSql = familyId > 0 ? "WHERE family_id = ?" : "";
  if (familyId > 0) peopleParams.push(familyId);

  const people = await all(
    `SELECT id, family_id as familyId, name, photo FROM people ${familyFilterSql} ORDER BY id ASC`,
    peopleParams
  );
  if (people.length === 0) {
    console.log("Nema osoba za obradu.");
    return;
  }

  const taggedParams = [];
  const taggedFamilySql = familyId > 0 ? "WHERE gp.family_id = ?" : "";
  if (familyId > 0) taggedParams.push(familyId);

  const taggedRows = await all(
    `SELECT gt.person_id as personId, gp.id as photoId, gp.src
     FROM gallery_photo_tags gt
     INNER JOIN gallery_photos gp ON gp.id = gt.photo_id
     ${taggedFamilySql}
     ORDER BY gp.id DESC, gt.id DESC`,
    taggedParams
  );

  const taggedByPerson = new Map();
  taggedRows.forEach((row) => {
    const personId = Number(row.personId || 0);
    const src = normalizeSource(row.src);
    if (!personId || !src) return;
    const list = taggedByPerson.get(personId) || [];
    if (!list.includes(src)) list.push(src);
    taggedByPerson.set(personId, list);
  });

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const person of people) {
    const current = normalizeSource(person.photo);
    const candidates = taggedByPerson.get(Number(person.id)) || [];
    if (candidates.length === 0) {
      skipped += 1;
      continue;
    }

    const bestFromGallery = [...candidates].sort((a, b) => getImageArea(b) - getImageArea(a))[0] || "";
    if (!bestFromGallery) {
      skipped += 1;
      continue;
    }

    const currentArea = getImageArea(current);
    const nextArea = getImageArea(bestFromGallery);
    const shouldReplace =
      forceAll ||
      !current ||
      isLikelyTinySource(current) ||
      (nextArea > 0 && currentArea > 0 && nextArea > currentArea);

    if (!shouldReplace) {
      unchanged += 1;
      continue;
    }

    if (!isDryRun) {
      await run("UPDATE people SET photo = ? WHERE id = ?", [bestFromGallery, Number(person.id)]);
    }
    updated += 1;
  }

  console.log(`DB: ${dbPath}`);
  console.log(`Obradjeno osoba: ${people.length}`);
  console.log(`Azurirano profilnih: ${updated}${isDryRun ? " (dry-run)" : ""}`);
  console.log(`Preskoceno (bez gallery taga): ${skipped}`);
  console.log(`Bez promjene (vec dovoljno dobro): ${unchanged}`);
};

main()
  .catch((err) => {
    console.error("Greska:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });

