export const sanitizePeople = (people) => {
  const keys = new Set(people.map((p) => p.key));
  const sanitized = people.map((p) => ({
    ...p,
    parent: keys.has(p.parent) ? p.parent : 0,
    parent2: keys.has(p.parent2) ? p.parent2 : 0,
    spouse: keys.has(p.spouse) ? p.spouse : 0,
    divorced: p.divorced ? 1 : 0,
  }));

  sanitized.forEach((p) => {
    if (p.parent === p.key) p.parent = 0;
    if (p.parent2 === p.key) p.parent2 = 0;
    if (p.parent2 && p.parent2 === p.parent) p.parent2 = 0;
    if (p.spouse === p.key) p.spouse = 0;
    if (!p.spouse) p.divorced = 0;
  });

  const byKey = new Map(sanitized.map((p) => [p.key, p]));
  sanitized.forEach((p) => {
    if (p.spouse && byKey.has(p.spouse)) {
      const other = byKey.get(p.spouse);
      if (other.spouse !== p.key) other.spouse = p.key;
    }
  });

  return sanitized;
};

const getSurname = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

export const buildModelData = (people) => {
  const nodeDataArray = [];
  const linkDataArray = [];
  const marriages = new Map();
  const keys = new Set(people.map((p) => p.key));
  const byKey = new Map(people.map((p) => [p.key, p]));
  const branchMemo = new Map();

  const getBranchKey = (person) => {
    if (!person) return "unknown";
    if (branchMemo.has(person.key)) return branchMemo.get(person.key);

    const surname = getSurname(person.name || "");
    if (surname) {
      const key = surname.toLowerCase();
      branchMemo.set(person.key, key);
      return key;
    }

    const parent = byKey.get(person.parent) || byKey.get(person.parent2);
    if (parent) {
      const key = getBranchKey(parent);
      branchMemo.set(person.key, key);
      return key;
    }

    const rootKey = `root-${person.key}`;
    branchMemo.set(person.key, rootKey);
    return rootKey;
  };

  people.forEach((person) => {
    const data = { ...person };
    nodeDataArray.push(data);
  });

  const branchKeys = Array.from(
    new Set(people.map((person) => getBranchKey(person)))
  ).sort((a, b) => a.localeCompare(b));

  const colorByBranch = new Map();
  const count = Math.max(branchKeys.length, 1);
  branchKeys.forEach((key, index) => {
    const hue = Math.round((index * 360) / count);
    colorByBranch.set(key, {
      cardStroke: `hsl(${hue}, 70%, 42%)`,
      cardFill: `hsla(${hue}, 70%, 88%, 0.35)`,
    });
  });

  nodeDataArray.forEach((node) => {
    if (node.category) return;
    const branchKey = getBranchKey(node);
    const colors = colorByBranch.get(branchKey);
    if (colors) {
      node.cardStroke = colors.cardStroke;
      node.cardFill = colors.cardFill;
    }
  });

  const getDivorceStatus = (a, b) => {
    const personA = byKey.get(a);
    const personB = byKey.get(b);
    if (!personA || !personB) return false;
    const areSpouses = personA.spouse === b || personB.spouse === a;
    if (!areSpouses) return false;
    return Boolean(personA.divorced || personB.divorced);
  };

  const ensureMarriageNode = (a, b, options = {}) => {
    const aa = Math.min(a, b);
    const bb = Math.max(a, b);
    const coupleId = `${aa}-${bb}`;
    if (!marriages.has(coupleId)) {
      const marriageKey = `m-${coupleId}`;
      const linkData = {
        from: aa,
        to: bb,
        category: "Spouse",
        isDivorced: Boolean(options.isDivorced),
      };
      marriages.set(coupleId, { key: marriageKey, linkData });
      nodeDataArray.push({
        key: marriageKey,
        category: "Marriage",
        spouses: [aa, bb],
      });

      linkDataArray.push(linkData);
    } else if (options.isDivorced) {
      const entry = marriages.get(coupleId);
      if (entry?.linkData) {
        entry.linkData.isDivorced = true;
      }
    }

    return marriages.get(coupleId).key;
  };

  people.forEach((person) => {
    if (person.spouse && person.spouse !== person.key && keys.has(person.spouse)) {
      ensureMarriageNode(person.key, person.spouse, {
        isDivorced: getDivorceStatus(person.key, person.spouse),
      });
    }
  });

  people.forEach((person) => {
    const parent1 = person.parent;
    const parent2 = person.parent2;

    if (parent1 && parent2 && keys.has(parent1) && keys.has(parent2)) {
      const marriageKey = ensureMarriageNode(parent1, parent2, {
        isDivorced: getDivorceStatus(parent1, parent2),
      });
      linkDataArray.push({
        from: marriageKey,
        to: person.key,
        category: "ParentChild",
      });
      return;
    }

    if (parent1 && keys.has(parent1)) {
      linkDataArray.push({
        from: parent1,
        to: person.key,
        category: "ParentChild",
      });
      return;
    }

    if (parent2 && keys.has(parent2)) {
      linkDataArray.push({
        from: parent2,
        to: person.key,
        category: "ParentChild",
      });
    }
  });

  return { nodeDataArray, linkDataArray };
};
