export const getVisiblePeople = (people, focusPersonId, expandMode, maxDepth) => {
  if (people.length === 0) return people;
  if (expandMode === "all") return people;
  if (!focusPersonId) return people;

  const byId = new Map(people.map((p) => [p.id, p]));
  const childrenByParent = new Map();
  people.forEach((p) => {
    if (p.parent) {
      if (!childrenByParent.has(p.parent)) childrenByParent.set(p.parent, []);
      childrenByParent.get(p.parent).push(p.id);
    }
    if (p.parent2) {
      if (!childrenByParent.has(p.parent2)) childrenByParent.set(p.parent2, []);
      childrenByParent.get(p.parent2).push(p.id);
    }
  });

  const included = new Set();
  included.add(focusPersonId);

  const walkAncestors = (id, depth) => {
    if (depth >= maxDepth) return;
    const person = byId.get(id);
    if (!person) return;
    const parents = [person.parent, person.parent2].filter(Boolean);
    parents.forEach((parentId) => {
      if (!included.has(parentId)) {
        included.add(parentId);
        walkAncestors(parentId, depth + 1);
      }
    });
  };

  const walkDescendants = (id, depth) => {
    if (depth >= maxDepth) return;
    const children = childrenByParent.get(id) || [];
    children.forEach((childId) => {
      if (!included.has(childId)) {
        included.add(childId);
        walkDescendants(childId, depth + 1);
      }
    });
  };

  if (expandMode === "ancestors" || expandMode === "both") {
    walkAncestors(focusPersonId, 0);
  }
  if (expandMode === "descendants" || expandMode === "both") {
    walkDescendants(focusPersonId, 0);
  }

  const focus = byId.get(focusPersonId);
  if (focus) {
    const parents = [focus.parent, focus.parent2].filter(Boolean);
    parents.forEach((parentId) => {
      const siblings = childrenByParent.get(parentId) || [];
      siblings.forEach((siblingId) => included.add(siblingId));
    });
  }

  Array.from(included).forEach((id) => {
    const person = byId.get(id);
    if (person?.spouse) included.add(person.spouse);
  });

  return people.filter((p) => included.has(p.id));
};
