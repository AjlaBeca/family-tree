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

const normalizeImportPersonRef = (value) => parseId(value);

const normalizeImportStatus = (value, relationshipStatuses = new Set()) => {
  const status = String(value || "partner").trim().toLowerCase();
  return relationshipStatuses.has(status) ? status : "";
};

const validateImportPayload = (payload, relationshipStatuses = new Set()) => {
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
    if (!normalizeImportStatus(row?.status, relationshipStatuses)) {
      return `relationships[${rowIndex}] ima neispravan status.`;
    }
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

module.exports = {
  parseId,
  clampPercent,
  buildChildrenMap,
  hasPath,
  sanitizeRelationship,
  normalizeImportPersonRef,
  normalizeImportStatus,
  validateImportPayload,
};
