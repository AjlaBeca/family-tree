export const getVisiblePeople = (people, focusPersonId, expandMode, maxDepth) => {
  if (people.length === 0) return people;
  if (expandMode === "all") return people;
  if (!focusPersonId) return people;

  const toId = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const byId = new Map(people.map((p) => [toId(p.id), p]));
  const childrenByParent = new Map();
  people.forEach((p) => {
    const personId = toId(p.id);
    const parent1 = toId(p.parent);
    const parent2 = toId(p.parent2);
    if (parent1) {
      if (!childrenByParent.has(parent1)) childrenByParent.set(parent1, []);
      childrenByParent.get(parent1).push(personId);
    }
    if (parent2) {
      if (!childrenByParent.has(parent2)) childrenByParent.set(parent2, []);
      childrenByParent.get(parent2).push(personId);
    }
  });

  const included = new Set();
  included.add(toId(focusPersonId));

  const walkAncestors = (id, depth, limit = maxDepth) => {
    if (Number.isFinite(limit) && depth >= limit) return;
    const person = byId.get(toId(id));
    if (!person) return;
    const parents = [toId(person.parent), toId(person.parent2)].filter(Boolean);
    parents.forEach((parentId) => {
      if (!included.has(parentId)) {
        included.add(parentId);
        walkAncestors(parentId, depth + 1, limit);
      }
    });
  };

  const walkDescendants = (id, depth) => {
    if (depth >= maxDepth) return;
    const children = childrenByParent.get(toId(id)) || [];
    children.forEach((childId) => {
      if (!included.has(childId)) {
        included.add(childId);
        walkDescendants(childId, depth + 1);
      }
    });
  };

  const includeSiblings = (id) => {
    const person = byId.get(toId(id));
    if (!person) return;
    const parentIds = [toId(person.parent), toId(person.parent2)].filter(Boolean);
    if (parentIds.length === 0) return;
    people.forEach((candidate) => {
      if (!candidate || toId(candidate.id) === toId(id)) return;
      const sharesParent = parentIds.some(
        (pid) => toId(candidate.parent) === pid || toId(candidate.parent2) === pid
      );
      if (sharesParent) included.add(toId(candidate.id));
    });
  };

  if (expandMode === "both") {
    walkAncestors(focusPersonId, 0, Number.POSITIVE_INFINITY);
    walkDescendants(focusPersonId, 0);
    includeSiblings(focusPersonId);
  } else if (expandMode === "ancestors") {
    walkAncestors(focusPersonId, 0, Number.POSITIVE_INFINITY);
  } else if (expandMode === "descendants") {
    walkDescendants(focusPersonId, 0);
  }

  return people.filter((p) => included.has(toId(p.id)));
};


