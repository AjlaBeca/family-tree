import {
  TREE_NODE_WIDTH,
  TREE_NODE_HEIGHT,
  TREE_SPOUSE_GAP,
  TREE_CLUSTER_GAP,
  TREE_GROUP_GAP,
  TREE_LAYER_GAP,
} from "./tree-constants";

const getParents = (person, keys) => {
  const parents = [];
  if (person.parent && keys.has(person.parent)) parents.push(person.parent);
  if (person.parent2 && keys.has(person.parent2) && person.parent2 !== person.parent) {
    parents.push(person.parent2);
  }
  return parents;
};

const buildCouples = (people, keys) => {
  const couples = new Map();
  people.forEach((person) => {
    if (!person.spouse || !keys.has(person.spouse)) return;
    const a = Math.min(person.key, person.spouse);
    const b = Math.max(person.key, person.spouse);
    const id = `${a}-${b}`;
    if (!couples.has(id)) {
      couples.set(id, { id, a, b });
    }
  });
  return couples;
};

const computeGenerations = (people, keys, couples) => {
  const gen = new Map();
  people.forEach((person) => gen.set(person.key, 0));
  const maxIterations = Math.max(people.length * 4, 10);

  for (let i = 0; i < maxIterations; i += 1) {
    let changed = false;

    people.forEach((person) => {
      const parents = getParents(person, keys);
      if (parents.length === 0) return;
      let parentGen = 0;
      parents.forEach((parentId) => {
        parentGen = Math.max(parentGen, gen.get(parentId) || 0);
      });
      const nextGen = parentGen + 1;
      if (nextGen > (gen.get(person.key) || 0)) {
        gen.set(person.key, nextGen);
        changed = true;
      }
    });

    couples.forEach(({ a, b }) => {
      const maxGen = Math.max(gen.get(a) || 0, gen.get(b) || 0);
      if (maxGen > (gen.get(a) || 0)) {
        gen.set(a, maxGen);
        changed = true;
      }
      if (maxGen > (gen.get(b) || 0)) {
        gen.set(b, maxGen);
        changed = true;
      }
    });

    if (!changed) break;
  }

  return gen;
};

const buildClusters = (people, couples, generations) => {
  const clusters = [];
  const clustered = new Set();

  couples.forEach(({ id, a, b }) => {
    clusters.push({
      id: `couple-${id}`,
      members: [a, b],
      width: TREE_NODE_WIDTH * 2 + TREE_SPOUSE_GAP,
      generation: Math.max(generations.get(a) || 0, generations.get(b) || 0),
    });
    clustered.add(a);
    clustered.add(b);
  });

  people.forEach((person) => {
    if (clustered.has(person.key)) return;
    clusters.push({
      id: `single-${person.key}`,
      members: [person.key],
      width: TREE_NODE_WIDTH,
      generation: generations.get(person.key) || 0,
    });
  });

  return clusters;
};

const computePositions = (people) => {
  const keys = new Set(people.map((p) => p.key));
  const byKey = new Map(people.map((p) => [p.key, p]));
  const couples = buildCouples(people, keys);
  const generations = computeGenerations(people, keys, couples);
  const clusters = buildClusters(people, couples, generations);

  const clustersByGen = new Map();
  clusters.forEach((cluster) => {
    const list = clustersByGen.get(cluster.generation) || [];
    list.push(cluster);
    clustersByGen.set(cluster.generation, list);
  });

  const positions = new Map();
  const generationsSorted = Array.from(clustersByGen.keys()).sort((a, b) => a - b);
  generationsSorted.forEach((genLevel) => {
    const y = genLevel * (TREE_NODE_HEIGHT + TREE_LAYER_GAP);
    const generationClusters = clustersByGen.get(genLevel) || [];
    let rootCursor = 0;

    const groups = new Map();

    generationClusters.forEach((cluster) => {
      const parentIds = new Set();
      cluster.members.forEach((memberId) => {
        const person = byKey.get(memberId);
        if (!person) return;
        getParents(person, keys).forEach((pid) => parentIds.add(pid));
      });

      const parentList = Array.from(parentIds).sort((a, b) => a - b);
      const parentKey = parentList.length ? parentList.join("-") : `root-${cluster.id}`;
      const group = groups.get(parentKey) || {
        key: parentKey,
        parentIds: parentList,
        clusters: [],
        width: 0,
        centerX: 0,
      };
      group.clusters.push(cluster);
      groups.set(parentKey, group);
    });

    const groupList = Array.from(groups.values()).map((group) => {
      const width =
        group.clusters.reduce((sum, cluster) => sum + cluster.width, 0) +
        Math.max(group.clusters.length - 1, 0) * TREE_CLUSTER_GAP;
      group.width = width;

      if (group.parentIds.length > 0) {
        const parentX = group.parentIds
          .map((pid) => positions.get(pid)?.x)
          .filter((value) => typeof value === "number");
        if (parentX.length > 0) {
          group.centerX = parentX.reduce((sum, val) => sum + val, 0) / parentX.length;
        } else {
          group.centerX = rootCursor + width / 2;
          rootCursor += width + TREE_GROUP_GAP;
        }
      } else {
        group.centerX = rootCursor + width / 2;
        rootCursor += width + TREE_GROUP_GAP;
      }

      return group;
    });

    groupList.sort((a, b) => a.centerX - b.centerX);

    let cursorRight = -Infinity;
    groupList.forEach((group) => {
      const left = group.centerX - group.width / 2;
      if (left < cursorRight + TREE_GROUP_GAP) {
        group.centerX = cursorRight + TREE_GROUP_GAP + group.width / 2;
      }
      cursorRight = group.centerX + group.width / 2;
    });

    groupList.forEach((group) => {
      const clustersSorted = group.clusters.slice().sort((a, b) => {
        const personA = byKey.get(a.members[0]);
        const personB = byKey.get(b.members[0]);
        const yearA = Number.parseInt(personA?.birthYear, 10);
        const yearB = Number.parseInt(personB?.birthYear, 10);
        if (!Number.isNaN(yearA) && !Number.isNaN(yearB)) {
          return yearA - yearB;
        }
        const nameA = (personA?.name || "").toLowerCase();
        const nameB = (personB?.name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      let xCursor = group.centerX - group.width / 2;
      clustersSorted.forEach((cluster) => {
        const clusterCenter = xCursor + cluster.width / 2;

        if (cluster.members.length === 2) {
          const offset = (TREE_NODE_WIDTH + TREE_SPOUSE_GAP) / 2;
          positions.set(cluster.members[0], { x: clusterCenter - offset, y });
          positions.set(cluster.members[1], { x: clusterCenter + offset, y });
        } else {
          positions.set(cluster.members[0], { x: clusterCenter, y });
        }

        xCursor += cluster.width + TREE_CLUSTER_GAP;
      });
    });
  });

  if (positions.size > 0) {
    let minX = Infinity;
    let minY = Infinity;
    positions.forEach((pos) => {
      minX = Math.min(minX, pos.x - TREE_NODE_WIDTH / 2);
      minY = Math.min(minY, pos.y - TREE_NODE_HEIGHT / 2);
    });

    const offsetX = minX < 40 ? 40 - minX : 0;
    const offsetY = minY < 40 ? 40 - minY : 0;

    positions.forEach((pos, key) => {
      positions.set(key, {
        x: pos.x + offsetX,
        y: pos.y + offsetY,
      });
    });
  }

  return positions;
};

const computeRelativeLevels = (people, focusPersonId) => {
  const focusId = Number(focusPersonId || 0);
  if (!focusId) return new Map();
  const byKey = new Map(people.map((p) => [Number(p.key), p]));
  if (!byKey.has(focusId)) return new Map();

  const childrenByParent = new Map();
  people.forEach((person) => {
    const childId = Number(person.key);
    const p1 = Number(person.parent || 0);
    const p2 = Number(person.parent2 || 0);
    if (p1 && byKey.has(p1)) {
      if (!childrenByParent.has(p1)) childrenByParent.set(p1, []);
      childrenByParent.get(p1).push(childId);
    }
    if (p2 && byKey.has(p2)) {
      if (!childrenByParent.has(p2)) childrenByParent.set(p2, []);
      childrenByParent.get(p2).push(childId);
    }
  });

  const levels = new Map();
  const queue = [focusId];
  levels.set(focusId, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    const person = byKey.get(current);
    if (!person) continue;
    const currentLevel = levels.get(current) || 0;

    const parents = [Number(person.parent || 0), Number(person.parent2 || 0)].filter(
      (pid) => pid && byKey.has(pid)
    );
    parents.forEach((parentId) => {
      const candidateLevel = currentLevel - 1;
      if (!levels.has(parentId) || candidateLevel < levels.get(parentId)) {
        levels.set(parentId, candidateLevel);
        queue.push(parentId);
      }
    });

    const children = childrenByParent.get(current) || [];
    children.forEach((childId) => {
      const candidateLevel = currentLevel + 1;
      if (!levels.has(childId) || candidateLevel > levels.get(childId)) {
        levels.set(childId, candidateLevel);
        queue.push(childId);
      }
    });
  }

  return levels;
};

const applyFocusedRowAlignment = (positions, people, focusPersonId) => {
  const focusId = Number(focusPersonId || 0);
  if (!focusId || !positions.has(focusId)) return positions;
  const levels = computeRelativeLevels(people, focusId);
  if (levels.size === 0) return positions;
  const childrenByParent = new Map();
  const parentsByChild = new Map();
  people.forEach((person) => {
    const id = Number(person.key);
    const p1 = Number(person.parent || 0);
    const p2 = Number(person.parent2 || 0);
    const parentIds = [p1, p2].filter((pid, idx, arr) => pid && arr.indexOf(pid) === idx);
    parentsByChild.set(id, parentIds);
    parentIds.forEach((parentId) => {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(id);
    });
  });

  const rows = new Map();
  people.forEach((person) => {
    const id = Number(person.key);
    if (!levels.has(id)) return;
    const level = levels.get(id);
    const list = rows.get(level) || [];
    list.push(id);
    rows.set(level, list);
  });

  const next = new Map(positions);
  const focusX = positions.get(focusId)?.x || 0;
  const rowGap = TREE_NODE_HEIGHT + TREE_LAYER_GAP;
  const colGap = TREE_NODE_WIDTH + Math.max(TREE_CLUSTER_GAP, TREE_SPOUSE_GAP);
  const sortedLevels = Array.from(rows.keys()).sort((a, b) => a - b);
  const minLevel = sortedLevels.length > 0 ? sortedLevels[0] : 0;
  const maxLevel = sortedLevels.length > 0 ? sortedLevels[sortedLevels.length - 1] : 0;

  const arrangeRow = (level, getAnchorX) => {
    const ids = (rows.get(level) || []).slice();
    if (ids.length === 0) return;
    const placed = ids.map((id) => {
      const fallback = next.get(id)?.x ?? positions.get(id)?.x ?? 0;
      const anchor = Number.isFinite(getAnchorX(id)) ? getAnchorX(id) : fallback;
      return { id, fallback, anchor, x: anchor };
    });

    placed.sort((a, b) => {
      if (a.anchor !== b.anchor) return a.anchor - b.anchor;
      return a.fallback - b.fallback;
    });

    for (let i = 1; i < placed.length; i += 1) {
      placed[i].x = Math.max(placed[i].x, placed[i - 1].x + colGap);
    }
    for (let i = placed.length - 2; i >= 0; i -= 1) {
      placed[i].x = Math.min(placed[i].x, placed[i + 1].x - colGap);
    }

    const meanAnchor =
      placed.reduce((sum, row) => sum + row.anchor, 0) / Math.max(placed.length, 1);
    const meanX = placed.reduce((sum, row) => sum + row.x, 0) / Math.max(placed.length, 1);
    const centerShift = meanAnchor - meanX;
    const y = 40 + (level - minLevel) * rowGap;

    placed.forEach((row) => {
      next.set(row.id, { x: row.x + centerShift, y });
    });
  };

  arrangeRow(0, (id) => {
    if (id === focusId) return focusX;
    const parents = (parentsByChild.get(id) || []).filter((pid) => levels.get(pid) === -1);
    const parentAnchors = parents
      .map((pid) => next.get(pid)?.x ?? positions.get(pid)?.x)
      .filter((x) => typeof x === "number");
    if (parentAnchors.length > 0) {
      return parentAnchors.reduce((sum, x) => sum + x, 0) / parentAnchors.length;
    }
    return positions.get(id)?.x ?? focusX;
  });

  for (let level = -1; level >= minLevel; level -= 1) {
    arrangeRow(level, (id) => {
      const children = (childrenByParent.get(id) || []).filter(
        (childId) => levels.get(childId) === level + 1
      );
      const anchors = children
        .map((childId) => next.get(childId)?.x ?? positions.get(childId)?.x)
        .filter((x) => typeof x === "number");
      if (anchors.length > 0) {
        return anchors.reduce((sum, x) => sum + x, 0) / anchors.length;
      }
      return positions.get(id)?.x ?? focusX;
    });
  }

  for (let level = 1; level <= maxLevel; level += 1) {
    arrangeRow(level, (id) => {
      const parents = (parentsByChild.get(id) || []).filter(
        (parentId) => levels.get(parentId) === level - 1
      );
      const anchors = parents
        .map((parentId) => next.get(parentId)?.x ?? positions.get(parentId)?.x)
        .filter((x) => typeof x === "number");
      if (anchors.length > 0) {
        return anchors.reduce((sum, x) => sum + x, 0) / anchors.length;
      }
      return positions.get(id)?.x ?? focusX;
    });
  }

  return next;
};

export const applyManualLayout = (diagram, people, go, options = {}) => {
  if (!diagram || !go) return;
  const { focusPersonId = null, expandMode = "all" } = options || {};
  let positions = computePositions(people);
  if (focusPersonId && expandMode !== "all") {
    positions = applyFocusedRowAlignment(positions, people, focusPersonId);
  }

  diagram.startTransaction("manual-layout");
  positions.forEach((pos, key) => {
    const node = diagram.findNodeForKey(key);
    if (node) node.location = new go.Point(pos.x, pos.y);
  });

  diagram.nodes.each((node) => {
    if (node.data?.category !== "Marriage") return;
    const spouses = Array.isArray(node.data.spouses) ? node.data.spouses : [];
    if (spouses.length < 2) return;
    const left = diagram.findNodeForKey(spouses[0]);
    const right = diagram.findNodeForKey(spouses[1]);
    if (!left || !right) return;

    const centerX = (left.location.x + right.location.x) / 2;
    const centerY = (left.location.y + right.location.y) / 2;
    node.location = new go.Point(centerX, centerY);
  });

  diagram.commitTransaction("manual-layout");
};


