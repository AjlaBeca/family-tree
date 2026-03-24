import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Layers,
  Trash2,
  Pencil,
  ArrowLeft,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { buildModelData } from "./tree-model";
import { applyManualLayout } from "./gojs-layout";
import {
  TREE_NODE_WIDTH,
  TREE_NODE_HEIGHT,
  TREE_SPOUSE_CURVINESS,
  TREE_SPOUSE_CURVE_DIR,
} from "./tree-constants";
import * as go from "gojs";

const normalizePhotoSource = (photo) => {
  const value = String(photo || "").trim();
  if (!value) return "";
  const lowered = value.toLowerCase();
  if (
    lowered === "null" ||
    lowered === "undefined" ||
    lowered === "[object object]" ||
    lowered === "%5bobject%20object%5d" ||
    lowered === "[object%20object]"
  ) {
    return "";
  }
  if (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }
  if (value.startsWith("//")) {
    return `${window.location.protocol}${value}`;
  }
  if (value.startsWith("/")) {
    return value;
  }
  if (value.startsWith("backend/public/")) {
    return `/${value.replace(/^backend\/public\//, "")}`;
  }
  if (value.startsWith("public/")) {
    return `/${value.replace(/^public\//, "")}`;
  }
  return `/${value}`;
};

const getLifeLabel = (data) => {
  const birth = data?.birthYear || "?";
  const death = data?.deathYear ? ` - ${data.deathYear}` : "";
  return `${birth}${death}`;
};

const getCleanName = (name) => {
  const value = String(name || "")
    .replace(/\s+/g, " ")
    .replace(/^[\u200B-\u200D\uFEFF]+/, "")
    .trim();
  return value || "Bez imena";
};

const parseYear = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const matched = raw.match(/^-?\d{1,4}$/);
  if (!matched) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPersonYearStatus = (person, year) => {
  if (!Number.isFinite(year)) return "unknown";
  const birthYear = parseYear(person?.birthYear);
  const deathYear = parseYear(person?.deathYear);
  if (birthYear !== null && year < birthYear) return "unborn";
  if (deathYear !== null && year > deathYear) return "dead";
  return "alive";
};

const getNumericId = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getParents = (person, byId) => {
  if (!person) return [];
  return [getNumericId(person.parent), getNumericId(person.parent2)].filter((id, index, arr) => {
    if (!id) return false;
    if (!byId.has(id)) return false;
    return arr.indexOf(id) === index;
  });
};

const getPartnerIds = (personId, byId, relationships = []) => {
  const result = new Set();
  if (!personId || !byId.has(personId)) return result;

  const person = byId.get(personId);
  const spouseId = getNumericId(person?.spouse);
  if (spouseId && byId.has(spouseId) && spouseId !== personId) {
    result.add(spouseId);
  }

  const rows = Array.isArray(relationships) ? relationships : [];
  rows.forEach((row) => {
    if (!isPartnerLikeStatus(row?.status)) return;
    const p1 = readRelationshipPersonId(row, 1);
    const p2 = readRelationshipPersonId(row, 2);
    if (!p1 || !p2) return;
    if (p1 === personId && byId.has(p2)) result.add(p2);
    if (p2 === personId && byId.has(p1)) result.add(p1);
  });

  return result;
};

const getKinshipParents = (person, byId, relationships = []) => {
  const direct = getParents(person, byId);
  if (direct.length !== 1) return direct;

  const inferred = new Set(direct);
  const knownParentId = direct[0];
  const partnerIds = getPartnerIds(knownParentId, byId, relationships);
  partnerIds.forEach((id) => {
    if (id && !inferred.has(id)) inferred.add(id);
  });

  return Array.from(inferred);
};

const getDistanceToAncestor = (fromId, ancestorId, byId, relationships = []) => {
  if (!fromId || !ancestorId) return null;
  if (fromId === ancestorId) return 0;
  const queue = [{ id: fromId, dist: 0 }];
  const visited = new Set([fromId]);
  while (queue.length > 0) {
    const current = queue.shift();
    const person = byId.get(current.id);
    const parents = getKinshipParents(person, byId, relationships);
    for (let i = 0; i < parents.length; i += 1) {
      const parentId = parents[i];
      if (visited.has(parentId)) continue;
      if (parentId === ancestorId) return current.dist + 1;
      visited.add(parentId);
      queue.push({ id: parentId, dist: current.dist + 1 });
    }
  }
  return null;
};

const getAncestorDistanceMap = (personId, byId, relationships = []) => {
  const distances = new Map();
  if (!personId || !byId.has(personId)) return distances;
  const queue = [{ id: personId, dist: 0 }];
  const visited = new Set([personId]);
  while (queue.length > 0) {
    const current = queue.shift();
    distances.set(current.id, current.dist);
    const person = byId.get(current.id);
    const parents = getKinshipParents(person, byId, relationships);
    for (let i = 0; i < parents.length; i += 1) {
      const parentId = parents[i];
      if (visited.has(parentId)) continue;
      visited.add(parentId);
      queue.push({ id: parentId, dist: current.dist + 1 });
    }
  }
  return distances;
};

const getSiblingKind = (aPerson, bPerson, byId, relationships = []) => {
  if (!aPerson || !bPerson) return null;
  const aParents = new Set(getKinshipParents(aPerson, byId, relationships));
  const bParents = new Set(getKinshipParents(bPerson, byId, relationships));
  let shared = 0;
  aParents.forEach((id) => {
    if (bParents.has(id)) shared += 1;
  });
  if (shared >= 2) return "full";
  if (shared === 1) return "half";
  return null;
};

const getAncestorLabel = (distance, person) => {
  const isFemale = String(person?.gender || "").toUpperCase() === "F";
  if (distance <= 1) return isFemale ? "majka" : "otac";
  if (distance === 2) return isFemale ? "nana/baka" : "djed";
  if (distance === 3) return isFemale ? "pranena" : "pradjed";
  if (distance === 4) return isFemale ? "cukurnena" : "cukundjed";
  return `predak (${distance}. koljeno)`;
};

const getDescendantLabel = (distance, person) => {
  const isFemale = String(person?.gender || "").toUpperCase() === "F";
  if (distance <= 1) return isFemale ? "kcerka" : "sin";
  if (distance === 2) return isFemale ? "unuka" : "unuk";
  if (distance === 3) return isFemale ? "praunuka" : "praunuk";
  if (distance === 4) return isFemale ? "cukununuka" : "cukununuk";
  return `potomak (${distance}. koljeno)`;
};

const getCousinTechnicalLabel = (degree, removed) => {
  if (degree < 1) return "";
  if (!removed) return `${degree}. rodjaci`;
  return `${degree}. rodjaci, ${removed}x removed`;
};

const getLocalizedCousinLabel = (degree, removed) => {
  if (degree < 1) return "";
  const baseMap = {
    1: "prvi rodjaci",
    2: "drugi rodjaci",
    3: "treci rodjaci",
    4: "cetvrti rodjaci",
    5: "peti rodjaci",
    6: "sesti rodjaci",
  };
  const base = baseMap[degree] || `rodjaci u ${degree}. koljenu`;
  if (!removed) return base;
  return `${base}, ${removed}x removed`;
};

const getAvuncularDistanceLabel = (base, extraGenerations) => {
  if (extraGenerations <= 0) return base;
  return `udaljeni ${base} (${extraGenerations + 1}. koljeno)`;
};

const getUncleAuntLabel = (person, parent) => {
  const personGender = String(person?.gender || "").toUpperCase();
  const parentGender = String(parent?.gender || "").toUpperCase();
  if (personGender === "F") return "tetka";
  if (personGender === "M" && parentGender === "F") return "ujak";
  if (personGender === "M" && parentGender === "M") return "amidza";
  return "tetka/ujak/amidza";
};

const getUncleAuntSpouseLabel = (spousePerson, uncleOrAuntPerson, parentPerson) => {
  const spouseGender = String(spousePerson?.gender || "").toUpperCase();
  const relativeGender = String(uncleOrAuntPerson?.gender || "").toUpperCase();
  const parentGender = String(parentPerson?.gender || "").toUpperCase();

  if (relativeGender === "M" && parentGender === "M") {
    if (spouseGender === "F") return "amidzinica";
    return "amidza";
  }
  if (relativeGender === "M" && parentGender === "F") {
    if (spouseGender === "F") return "dajdzinica";
    return "daidza";
  }
  if (relativeGender === "F") {
    if (spouseGender === "M") return "tetak";
    return "tetka";
  }
  return "rod u tazbini";
};

const getNieceNephewLabel = (person) => {
  const personGender = String(person?.gender || "").toUpperCase();
  if (personGender === "F") return "necakinja";
  if (personGender === "M") return "necak";
  return "necak/necakinja";
};

const getSiblingLabel = (person, isHalf) => {
  const personGender = String(person?.gender || "").toUpperCase();
  const base = personGender === "F" ? "sestra" : personGender === "M" ? "brat" : "brat/sestra";
  return isHalf ? `polu${base}` : base;
};

const getRelationshipEdgeLabel = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "married") return "brak";
  if (normalized === "partner") return "partner";
  if (normalized === "divorced") return "razvod";
  if (normalized === "separated") return "razdvojeni";
  if (normalized === "widowed") return "udovac/udovica";
  return "veza";
};

const getSurnameFromFullName = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const readRelationshipPersonId = (row, which) => {
  const primaryKey = which === 1 ? "person1Id" : "person2Id";
  const snakeKey = which === 1 ? "person1_id" : "person2_id";
  const altKey = which === 1 ? "personAId" : "personBId";
  return getNumericId(row?.[primaryKey] ?? row?.[snakeKey] ?? row?.[altKey]);
};

const isPartnerLikeStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "partner" || normalized === "married";
};

const hasDirectRelationshipBetween = (aId, bId, relationships = []) => {
  const rows = Array.isArray(relationships) ? relationships : [];
  return rows.some((row) => {
    const p1 = readRelationshipPersonId(row, 1);
    const p2 = readRelationshipPersonId(row, 2);
    if (!p1 || !p2) return false;
    const matchesPair = (p1 === aId && p2 === bId) || (p1 === bId && p2 === aId);
    if (!matchesPair) return false;
    return isPartnerLikeStatus(row?.status);
  });
};

const buildRelationshipPath = (aId, bId, byId, relationships = []) => {
  if (!aId || !bId || !byId.has(aId) || !byId.has(bId)) {
    return { nodes: [], edges: [] };
  }
  const adjacency = new Map();
  byId.forEach((person, id) => {
    if (!adjacency.has(id)) adjacency.set(id, []);
    const parentIds = getParents(person, byId);
    parentIds.forEach((parentId) => {
      if (!adjacency.has(parentId)) adjacency.set(parentId, []);
      adjacency.get(id).push({ to: parentId, edge: "roditelj" });
      adjacency.get(parentId).push({ to: id, edge: "dijete" });
    });
    const spouseId = getNumericId(person.spouse);
    if (spouseId && byId.has(spouseId)) {
      adjacency.get(id).push({ to: spouseId, edge: "bracni partner" });
    }
  });

  (Array.isArray(relationships) ? relationships : []).forEach((row) => {
    const p1 = readRelationshipPersonId(row, 1);
    const p2 = readRelationshipPersonId(row, 2);
    if (!p1 || !p2) return;
    if (!adjacency.has(p1) || !adjacency.has(p2)) return;
    const edge = getRelationshipEdgeLabel(row?.status);
    adjacency.get(p1).push({ to: p2, edge });
    adjacency.get(p2).push({ to: p1, edge });
  });

  const queue = [aId];
  const visited = new Set([aId]);
  const previous = new Map();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === bId) break;
    const edges = adjacency.get(current) || [];
    for (let i = 0; i < edges.length; i += 1) {
      const next = edges[i];
      if (visited.has(next.to)) continue;
      visited.add(next.to);
      previous.set(next.to, { from: current, edge: next.edge });
      queue.push(next.to);
    }
  }

  if (!previous.has(bId) && aId !== bId) return { nodes: [], edges: [] };
  const nodes = [bId];
  const edges = [];
  let current = bId;
  while (current !== aId) {
    const step = previous.get(current);
    if (!step) break;
    edges.unshift(step.edge || "veza");
    current = step.from;
    nodes.unshift(current);
  }
  return { nodes, edges };
};

const getPathLabel = (pathData, byId) => {
  const pathIds = Array.isArray(pathData?.nodes) ? pathData.nodes : [];
  const edges = Array.isArray(pathData?.edges) ? pathData.edges : [];
  if (pathIds.length < 2) return "";
  let label = getCleanName(byId.get(pathIds[0])?.name || "Bez imena");
  for (let i = 1; i < pathIds.length; i += 1) {
    const edge = edges[i - 1] || "veza";
    const name = getCleanName(byId.get(pathIds[i])?.name || "Bez imena");
    label += ` -${edge}-> ${name}`;
  }
  return label;
};

const getCardExtraText = (data, field) => {
  if (!data) return "-";
  if (field === "occupation") {
    const value = String(data.occupation || "").trim();
    return value || "Bez zanimanja";
  }
  if (field === "birthPlace") {
    const value = String(data.birthPlace || "").trim();
    return value || "Mjesto rodenja nepoznato";
  }
  if (field === "birthYear") {
    const value = String(data.birthYear || "").trim();
    return value || "Godina rodenja nepoznata";
  }
  if (field === "burialPlace") {
    const value = String(data.burialPlace || "").trim();
    return value || "Mjesto ukopa nepoznato";
  }
  if (field === "photo") {
    return data.hasPhoto ? "Ima fotografiju" : "Nema fotografiju";
  }
  if (field === "bio") {
    return String(data.bio || "").trim() ? "Ima biografiju" : "Nema biografiju";
  }
  if (field === "marital") {
    if (!data.spouse) return "Nije u braku";
    return data.divorced ? "Razveden/a" : "U braku";
  }
  if (field === "health") {
    if (data.healthBadge === "hereditary") return "Nasljedni rizik";
    if (data.healthBadge === "risk") return "Rizicni faktori";
    return "Bez oznake rizika";
  }
  if (field === "none") return "";
  return data.gender === "F" ? "Zensko" : "Musko";
};

const TreeView = ({
  families,
  activeFamilyId,
  onFamilyChange,
  newFamilyName,
  onNewFamilyNameChange,
  onAddFamily,
  onDeleteFamily,
  stats,
  people,
  visiblePeople,
  focusPersonId,
  onFocusChange,
  focusPerson,
  expandMode,
  onExpandModeChange,
  maxDepth,
  onMaxDepthChange,
  onAddPerson,
  tags,
  activeTagId,
  onTagChange,
  tagLinks,
  personHealthMap,
  relationships,
  onOpenPersonDetails,
  onEditPerson,
}) => {
  const diagramRef = useRef(null);
  const overviewRef = useRef(null);
  const diagramInstanceRef = useRef(null);
  const overviewInstanceRef = useRef(null);
  const goRef = useRef(null);
  const visibleRef = useRef(visiblePeople);
  const onEditRef = useRef(onEditPerson);
  const onOpenDetailsRef = useRef(onOpenPersonDetails);
  const clickTimerRef = useRef(null);
  const cardExtraSelectRef = useRef(null);
  const focusSelectRef = useRef(null);
  const tagSelectRef = useRef(null);
  const familySelectRef = useRef(null);
  const moreOptionsRef = useRef(null);
  const highlightSelectRef = useRef(null);
  const relationPersonARef = useRef(null);
  const relationPersonBRef = useRef(null);
  const dropdownTypeaheadRef = useRef({ buffer: "", timer: null });
  const [profilePersonId, setProfilePersonId] = useState(null);
  const [cardView, setCardView] = useState("detailed");
  const [cardExtraField, setCardExtraField] = useState("occupation");
  const [cardExtraOpen, setCardExtraOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [yearMode, setYearMode] = useState("off");
  const [yearFilterInput, setYearFilterInput] = useState("");
  const [highlightRule, setHighlightRule] = useState("off");
  const [relationPersonAId, setRelationPersonAId] = useState(0);
  const [relationPersonBId, setRelationPersonBId] = useState(0);
  const [relationPersonAOpen, setRelationPersonAOpen] = useState(false);
  const [relationPersonBOpen, setRelationPersonBOpen] = useState(false);
  const [profilePhotoFailed, setProfilePhotoFailed] = useState(false);
  const cardExtraOptions = useMemo(
    () => [
      { value: "occupation", label: "Zanimanje" },
      { value: "gender", label: "Spol" },
      { value: "birthPlace", label: "Rođenje mjesto" },
    ],
    []
  );

  const selectedCardExtraLabel = useMemo(
    () =>
      cardExtraOptions.find((option) => option.value === cardExtraField)?.label || "Zanimanje",
    [cardExtraField, cardExtraOptions]
  );

  const highlightOptions = useMemo(
    () => [
      { value: "off", label: "Bez isticanja" },
      { value: "female", label: "Spol: zene" },
      { value: "male", label: "Spol: muskarci" },
      { value: "living", label: "Status: zivi" },
      { value: "deceased", label: "Status: preminuli" },
      { value: "photo", label: "Imaju fotografiju" },
    ],
    []
  );
  const selectedHighlightLabel = useMemo(
    () => highlightOptions.find((option) => option.value === highlightRule)?.label || "Bez isticanja",
    [highlightOptions, highlightRule]
  );

  const openOnlyTreeDropdown = useCallback((keyName) => {
    setFamilyOpen(keyName === "family");
    setRelationPersonAOpen(keyName === "relationA");
    setRelationPersonBOpen(keyName === "relationB");
    setFocusOpen(keyName === "focus");
    setTagOpen(keyName === "tag");
    setCardExtraOpen(keyName === "cardExtra");
    setHighlightOpen(keyName === "highlight");
    if (keyName !== "moreOptions") setMoreOptionsOpen(false);
  }, []);

  const handleTreeDropdownTypeahead = useCallback((event, keyName, options, onSelect) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Backspace") {
      dropdownTypeaheadRef.current.buffer = dropdownTypeaheadRef.current.buffer.slice(0, -1);
      return;
    }
    if (event.key.length !== 1) return;

    const key = event.key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (!key) return;

    openOnlyTreeDropdown(keyName);
    dropdownTypeaheadRef.current.buffer += key;
    if (dropdownTypeaheadRef.current.timer) clearTimeout(dropdownTypeaheadRef.current.timer);
    dropdownTypeaheadRef.current.timer = setTimeout(() => {
      dropdownTypeaheadRef.current.buffer = "";
    }, 700);

    const query = dropdownTypeaheadRef.current.buffer;
    const match = (options || []).find((option) =>
      String(option?.label || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .startsWith(query)
    );
    if (!match) return;

    event.preventDefault();
    onSelect(match.value);
  }, [openOnlyTreeDropdown]);

  const projectionYear = useMemo(() => parseYear(yearFilterInput), [yearFilterInput]);

  const projectedPeople = useMemo(() => {
    let basePeople = visiblePeople;
    if (Number.isFinite(projectionYear) && yearMode === "living") {
      basePeople = visiblePeople.filter((person) => getPersonYearStatus(person, projectionYear) === "alive");
    }

    return basePeople.map((person) => {
      let decorated = person;
      if (Number.isFinite(projectionYear) && yearMode === "status") {
        const status = getPersonYearStatus(person, projectionYear);
        if (status === "alive") {
          decorated = {
            ...decorated,
            cardStroke: "#15803d",
            cardFill: "rgba(187, 247, 208, 0.55)",
            nodeOpacity: 1,
          };
        } else if (status === "dead") {
          decorated = {
            ...decorated,
            cardStroke: "#b91c1c",
            cardFill: "rgba(254, 202, 202, 0.52)",
            nodeOpacity: 1,
          };
        } else if (status === "unborn") {
          decorated = {
            ...decorated,
            cardStroke: "#94a3b8",
            cardFill: "rgba(226, 232, 240, 0.72)",
            nodeOpacity: 0.5,
          };
        }
      }

      const normalizedGender = String(person?.gender || "").toUpperCase();
      const hasDeathYear = String(person?.deathYear ?? "").trim().length > 0;
      const hasPhoto = String(person?.photo ?? "").trim().length > 0;
      let shouldHighlight = false;
      if (highlightRule === "female") shouldHighlight = normalizedGender === "F";
      if (highlightRule === "male") shouldHighlight = normalizedGender === "M";
      if (highlightRule === "living") shouldHighlight = !hasDeathYear;
      if (highlightRule === "deceased") shouldHighlight = hasDeathYear;
      if (highlightRule === "photo") shouldHighlight = hasPhoto;

      if (highlightRule !== "off" && shouldHighlight) {
        decorated = {
          ...decorated,
          cardStroke: "#ca8a04",
          cardFill: "hsla(48, 96%, 70%, 0.35)",
          nodeOpacity: 1,
        };
      } else if (highlightRule !== "off") {
        decorated = {
          ...decorated,
          cardStroke: "#94a3b8",
          cardFill: "rgba(226, 232, 240, 0.35)",
          nodeOpacity: 1,
        };
      }

      return decorated;
    });
  }, [projectionYear, visiblePeople, yearMode, highlightRule]);

  useEffect(() => {
    visibleRef.current = projectedPeople;
  }, [projectedPeople]);

  useEffect(() => {
    const onDocumentPointerDown = (event) => {
      if (!focusSelectRef.current?.contains(event.target)) {
        setFocusOpen(false);
      }
      if (!tagSelectRef.current?.contains(event.target)) {
        setTagOpen(false);
      }
      if (!familySelectRef.current?.contains(event.target)) {
        setFamilyOpen(false);
      }
      if (!cardExtraSelectRef.current?.contains(event.target)) {
        setCardExtraOpen(false);
      }
      if (!moreOptionsRef.current?.contains(event.target)) {
        setMoreOptionsOpen(false);
        setHighlightOpen(false);
      }
      if (!highlightSelectRef.current?.contains(event.target)) {
        setHighlightOpen(false);
      }
      if (!relationPersonARef.current?.contains(event.target)) {
        setRelationPersonAOpen(false);
      }
      if (!relationPersonBRef.current?.contains(event.target)) {
        setRelationPersonBOpen(false);
      }
    };
    const onDocumentKeyDown = (event) => {
      if (event.key === "Escape") {
        setFocusOpen(false);
        setTagOpen(false);
        setFamilyOpen(false);
        setCardExtraOpen(false);
        setMoreOptionsOpen(false);
        setHighlightOpen(false);
        setRelationPersonAOpen(false);
        setRelationPersonBOpen(false);
      }
    };
    const typeaheadState = dropdownTypeaheadRef.current;
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
      if (typeaheadState.timer) {
        clearTimeout(typeaheadState.timer);
      }
    };
  }, []);

  useEffect(() => {
    onEditRef.current = onEditPerson;
  }, [onEditPerson]);
  useEffect(() => {
    onOpenDetailsRef.current = onOpenPersonDetails;
  }, [onOpenPersonDetails]);

  const profilePerson = useMemo(
    () => people.find((person) => person.id === profilePersonId) || null,
    [people, profilePersonId]
  );
  const resolvedProfilePhoto = useMemo(
    () => normalizePhotoSource(profilePerson?.photo),
    [profilePerson]
  );

  const profileChildrenCount = useMemo(() => {
    if (!profilePerson) return 0;
    return people.filter(
      (person) => person.parent === profilePerson.id || person.parent2 === profilePerson.id
    ).length;
  }, [people, profilePerson]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const profileParent1 = useMemo(() => {
    if (!profilePerson?.parent) return null;
    return peopleById.get(profilePerson.parent) || null;
  }, [peopleById, profilePerson]);

  const profileParent2 = useMemo(() => {
    if (!profilePerson?.parent2) return null;
    return peopleById.get(profilePerson.parent2) || null;
  }, [peopleById, profilePerson]);

  const profileSpouse = useMemo(() => {
    if (!profilePerson?.spouse) return null;
    return peopleById.get(profilePerson.spouse) || null;
  }, [peopleById, profilePerson]);

  const profileChildren = useMemo(() => {
    if (!profilePerson) return [];
    return people.filter(
      (person) => person.parent === profilePerson.id || person.parent2 === profilePerson.id
    );
  }, [people, profilePerson]);

  const profileHealth = useMemo(() => {
    if (!profilePerson?.id) return null;
    return personHealthMap?.[profilePerson.id] || null;
  }, [personHealthMap, profilePerson]);

  const profileTagNames = useMemo(() => {
    if (!profilePerson?.id) return [];
    const tagIds = new Set(
      (tagLinks || [])
        .filter((link) => Number(link.personId) === Number(profilePerson.id))
        .map((link) => Number(link.tagId))
    );
    return (tags || [])
      .filter((tag) => tagIds.has(Number(tag.id)))
      .map((tag) => getCleanName(tag.name))
      .filter(Boolean);
  }, [profilePerson, tagLinks, tags]);

  const profileRelationships = useMemo(() => {
    if (!profilePerson?.id) return [];
    return (relationships || [])
      .filter(
        (row) =>
          Number(row.personA) === Number(profilePerson.id) ||
          Number(row.personB) === Number(profilePerson.id)
      )
      .map((row) => {
        const otherId =
          Number(row.personA) === Number(profilePerson.id)
            ? Number(row.personB)
            : Number(row.personA);
        const other = peopleById.get(otherId);
        return {
          id: row.id,
          otherName: getCleanName(other?.name),
          status: String(row.status || ""),
          startYear: row.startYear || "",
          endYear: row.endYear || "",
          notes: String(row.notes || "").trim(),
        };
      })
      .sort((a, b) => Number(a.startYear || 0) - Number(b.startYear || 0));
  }, [profilePerson, relationships, peopleById]);

  useEffect(() => {
    setProfilePhotoFailed(false);
  }, [profilePerson?.id, resolvedProfilePhoto]);

  const positionMarriageNodes = useCallback((diagram) => {
    if (!diagram || !goRef.current) return;
    const go = goRef.current;

    diagram.startTransaction("position-marriage");
    diagram.nodes.each((node) => {
      if (node.data?.category !== "Marriage") return;
      const spouses = Array.isArray(node.data.spouses) ? node.data.spouses : [];
      if (spouses.length < 2) return;
      const left = diagram.findNodeForKey(spouses[0]);
      const right = diagram.findNodeForKey(spouses[1]);
      if (!left || !right) return;

      const linkIt = left.findLinksBetween(right);
      const link = linkIt ? linkIt.first() : null;
      const mid = link?.midPoint || null;

      if (mid && typeof mid.x === "number" && typeof mid.y === "number") {
        node.location = new go.Point(mid.x, mid.y);
        return;
      }

      const centerX = (left.location.x + right.location.x) / 2;
      const centerY = (left.location.y + right.location.y) / 2;
      node.location = new go.Point(centerX, centerY);
    });
    diagram.commitTransaction("position-marriage");

    diagram.links.each((link) => {
      if (link.category === "Spouse") {
        link.curviness = TREE_SPOUSE_CURVINESS * TREE_SPOUSE_CURVE_DIR;
      }
      link.invalidateRoute();
    });
  }, []);

  const initDiagram = useCallback(() => {
    if (!go || !diagramRef.current) return;

    const $ = go.GraphObject.make;
    goRef.current = go;
    const existingDiagram = go.Diagram.fromDiv(diagramRef.current);
    if (existingDiagram) {
      diagramInstanceRef.current = existingDiagram;
      const { nodeDataArray, linkDataArray } = buildModelData(visibleRef.current, {
        cardMode: cardView,
        resolvePhoto: normalizePhotoSource,
      });
      const model = new go.GraphLinksModel(nodeDataArray, linkDataArray);
      existingDiagram.model = model;
      applyManualLayout(existingDiagram, visibleRef.current, go);
      setTimeout(() => positionMarriageNodes(existingDiagram), 0);
      return;
    }

    const resolveNode = (obj) => {
      if (!obj) return null;
      if (obj.data) return obj;
      if (obj.part && obj.part.data) return obj.part;
      return null;
    };

    const openEditor = (obj) => {
      const node = resolveNode(obj);
      const data = node?.data;
      if (!data || data.category) return;
      if (onEditRef.current) onEditRef.current(data);
    };

    const openProfile = (obj) => {
      const node = resolveNode(obj);
      const data = node?.data;
      if (!data || data.category) return;
      setProfilePersonId(data.id || data.key || null);
      if (onOpenDetailsRef.current) onOpenDetailsRef.current(data);
    };

    const diagram = $(go.Diagram, diagramRef.current, {
      "undoManager.isEnabled": true,
      initialAutoScale: go.Diagram.Uniform,
      "animationManager.isEnabled": false,
      padding: 20,
    });
    diagram.layout = new go.Layout();
    diagram.layout.isInitial = false;
    diagram.layout.isOngoing = false;

    diagram.addDiagramListener("ObjectDoubleClicked", (e) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      openEditor(e.subject?.part || e.subject);
    });

    diagram.addDiagramListener("ObjectSingleClicked", (e) => {
      if (e.diagram?.lastInput?.clickCount !== 1) return;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        openProfile(e.subject?.part || e.subject);
        clickTimerRef.current = null;
      }, 220);
    });

    if (diagram.div) {
      const handler = (ev) => {
        const rect = diagram.div.getBoundingClientRect();
        const viewPoint = new go.Point(
          ev.clientX - rect.left,
          ev.clientY - rect.top
        );
        const docPoint = diagram.transformViewToDoc(viewPoint);
        const part = diagram.findPartAt(docPoint, true);
        if (part instanceof go.Node && part.data && !part.data.category) {
          openEditor(part);
        }
      };
      diagram.__dblclickHandler = handler;
      diagram.div.addEventListener("dblclick", handler);
    }


    diagram.nodeTemplate = (
      $(
        go.Node,
        "Auto",
        {
          locationSpot: go.Spot.Center,
          isLayoutPositioned: true,
          doubleClick: (e, node) => {
            openEditor(node);
          },
        },
        new go.Binding("isLayoutPositioned", "isLayoutPositioned"),
        $(
          go.Shape,
          "RoundedRectangle",
          {
            parameter1: 14,
            fill: "#F8FAFC",
            stroke: "#1D4ED8",
            strokeWidth: 2,
            cursor: "pointer",
            desiredSize: new go.Size(TREE_NODE_WIDTH, TREE_NODE_HEIGHT),
          },
          new go.Binding("opacity", "nodeOpacity", (value) =>
            typeof value === "number" ? value : 1
          ),
          new go.Binding("stroke", "cardStroke"),
          new go.Binding("fill", "cardFill")
        ),
        $(
          go.Panel,
          "Auto",
          { margin: 0, alignment: go.Spot.Center },
          $(
            go.Panel,
            "Vertical",
            { alignment: go.Spot.Center, defaultAlignment: go.Spot.Center },
            $(
              go.Panel,
              "Table",
              {
                margin: new go.Margin(2, 0, 0, 0),
                defaultAlignment: go.Spot.Left,
                visible: true,
              },
              new go.Binding("visible", "cardMode", (mode) => mode !== "compact"),
              $(go.RowColumnDefinition, { column: 0, width: TREE_NODE_WIDTH - 34 }),
              $(
                go.TextBlock,
                {
                  row: 0,
                  column: 0,
                  font: "500 14px 'Space Grotesk', sans-serif",
                  stroke: "#111827",
                  margin: new go.Margin(2, 0, 2, 0),
                  maxLines: 2,
                  wrap: go.TextBlock.WrapFit,
                  overflow: go.TextBlock.OverflowEllipsis,
                  textAlign: "left",
                },
                new go.Binding("text", "name", (name) => getCleanName(name))
              ),
              $(
                go.TextBlock,
                {
                  row: 1,
                  column: 0,
                  font: "12px 'Space Grotesk', sans-serif",
                  stroke: "#4B5563",
                  maxLines: 1,
                  overflow: go.TextBlock.OverflowEllipsis,
                  textAlign: "left",
                },
                new go.Binding("text", "", (data) => getLifeLabel(data))
              ),
              $(
                go.TextBlock,
                {
                  row: 2,
                  column: 0,
                  font: "11px 'Space Grotesk', sans-serif",
                  stroke: "#64748B",
                  maxLines: 1,
                  overflow: go.TextBlock.OverflowEllipsis,
                  textAlign: "left",
                },
                new go.Binding("text", "", (data) => getCardExtraText(data, cardExtraField))
              )
            ),
            $(
              go.Panel,
              "Table",
              {
                margin: 0,
                visible: false,
                defaultAlignment: go.Spot.Center,
              },
              new go.Binding("visible", "cardMode", (mode) => mode === "compact"),
              $(go.RowColumnDefinition, { column: 0, width: TREE_NODE_WIDTH - 22 }),
              $(go.RowColumnDefinition, { row: 0, height: TREE_NODE_HEIGHT - 20 }),
              $(
                go.TextBlock,
                {
                  row: 0,
                  column: 0,
                  font: "700 20px 'Space Grotesk', sans-serif",
                  stroke: "#0F172A",
                  maxLines: 2,
                  wrap: go.TextBlock.WrapFit,
                  overflow: go.TextBlock.OverflowEllipsis,
                  alignment: go.Spot.Center,
                  textAlign: "center",
                  isMultiline: true,
                  margin: new go.Margin(4, 8, 4, 8),
                  width: TREE_NODE_WIDTH - 38,
                },
                new go.Binding("text", "name", (name) => getCleanName(name))
              )
            )
          )
        )
      )
    );

    diagram.nodeTemplateMap.add(
      "Marriage",
      $(
        go.Node,
        "Position",
        {
          selectable: false,
          pickable: false,
          layerName: "Background",
          locationSpot: go.Spot.Center,
        },
        $(go.Shape, "Circle", {
          portId: "",
          width: 2,
          height: 2,
          fill: "transparent",
          stroke: null,
          alignment: go.Spot.Center,
        })
      )
    );

    diagram.linkTemplate = $(
      go.Link,
      {
        selectable: false,
        pickable: false,
        routing: go.Link.Orthogonal,
        corner: 0,
        layerName: "Background",
        fromSpot: go.Spot.Bottom,
        toSpot: go.Spot.Top,
      },
      $(go.Shape, { strokeWidth: 1.6, stroke: "#AEB7C7" })
    );

    diagram.linkTemplateMap.add(
      "Spouse",
      $(
        go.Link,
        {
          selectable: false,
          pickable: false,
          routing: go.Link.Normal,
          curve: go.Link.Bezier,
          curviness: TREE_SPOUSE_CURVINESS * TREE_SPOUSE_CURVE_DIR,
          computeCurviness: () => TREE_SPOUSE_CURVINESS * TREE_SPOUSE_CURVE_DIR,
          fromSpot: go.Spot.RightSide,
          toSpot: go.Spot.LeftSide,
          fromEndSegmentLength: 10,
          toEndSegmentLength: 10,
          layerName: "Background",
        },
        $(
          go.Shape,
          { strokeWidth: 2.6, stroke: "#7C3AED" },
          new go.Binding("strokeDashArray", "isDivorced", (value) =>
            value ? [8, 6] : null
          )
        )
      )
    );

    diagram.linkTemplateMap.add(
      "ParentChild",
      $(
        go.Link,
        {
          selectable: false,
          pickable: false,
          routing: go.Link.Orthogonal,
          corner: 0,
          fromSpot: go.Spot.Bottom,
          toSpot: go.Spot.Top,
        },
        $(go.Shape, { strokeWidth: 1.6, stroke: "#AEB7C7" })
      )
    );

    diagramInstanceRef.current = diagram;

    if (overviewRef.current) {
      overviewInstanceRef.current = $(go.Overview, overviewRef.current, {
        observed: diagram,
      });
    }

    const { nodeDataArray, linkDataArray } = buildModelData(visibleRef.current, {
      cardMode: cardView,
      resolvePhoto: normalizePhotoSource,
    });
    const model = new go.GraphLinksModel(nodeDataArray, linkDataArray);
    diagram.model = model;
    applyManualLayout(diagram, visibleRef.current, go);
    setTimeout(() => positionMarriageNodes(diagram), 0);
  }, [cardView, cardExtraField, positionMarriageNodes]);

  useEffect(() => {
    initDiagram();
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      if (overviewInstanceRef.current) {
        overviewInstanceRef.current.div = null;
        overviewInstanceRef.current = null;
      }
      if (diagramInstanceRef.current) {
        const diagram = diagramInstanceRef.current;
        if (diagram.div && diagram.__dblclickHandler) {
          diagram.div.removeEventListener("dblclick", diagram.__dblclickHandler);
          diagram.__dblclickHandler = null;
        }
        diagram.div = null;
        diagramInstanceRef.current = null;
      }
    };
  }, [initDiagram]);

  useEffect(() => {
    if (!diagramInstanceRef.current || !goRef.current) return;
    const { nodeDataArray, linkDataArray } = buildModelData(projectedPeople, {
      cardMode: cardView,
      resolvePhoto: normalizePhotoSource,
    });
    const model = new goRef.current.GraphLinksModel(nodeDataArray, linkDataArray);
    diagramInstanceRef.current.model = model;
    applyManualLayout(diagramInstanceRef.current, projectedPeople, goRef.current);
    setTimeout(() => positionMarriageNodes(diagramInstanceRef.current), 0);
  }, [cardView, cardExtraField, projectedPeople, positionMarriageNodes]);

  useEffect(() => {
    const diagram = diagramInstanceRef.current;
    if (!diagram || !goRef.current) return;

    if (diagramRef.current && diagram.div !== diagramRef.current) {
      diagram.div = diagramRef.current;
      if (diagram.div && diagram.__dblclickHandler) {
        diagram.div.addEventListener("dblclick", diagram.__dblclickHandler);
      }
    }

    if (overviewRef.current) {
      if (overviewInstanceRef.current) {
        overviewInstanceRef.current.observed = diagram;
        if (overviewInstanceRef.current.div !== overviewRef.current) {
          overviewInstanceRef.current.div = overviewRef.current;
        }
      } else {
        const $ = goRef.current.GraphObject.make;
        overviewInstanceRef.current = $(goRef.current.Overview, overviewRef.current, {
          observed: diagram,
        });
      }
    }

    diagram.requestUpdate();
    applyManualLayout(diagram, projectedPeople, goRef.current);
    setTimeout(() => positionMarriageNodes(diagram), 0);
  }, [projectedPeople, positionMarriageNodes]);

  const zoomIn = () => {
    if (diagramInstanceRef.current) diagramInstanceRef.current.scale *= 1.2;
  };

  const zoomOut = () => {
    if (diagramInstanceRef.current) diagramInstanceRef.current.scale /= 1.2;
  };
  
  const fitToScreen = () => {
    if (diagramInstanceRef.current) diagramInstanceRef.current.zoomToFit();
  };

  const resetTreeLayout = () => {
    const diagram = diagramInstanceRef.current;
    const go = goRef.current;
    if (!diagram || !go) return;
    applyManualLayout(diagram, visibleRef.current, go);
    positionMarriageNodes(diagram);
    diagram.zoomToFit();
  };

  const selectedFocusPerson = useMemo(() => {
    if (!people.length) return null;
    return people.find((person) => Number(person.id) === Number(focusPersonId)) || people[0];
  }, [people, focusPersonId]);

  const selectedTagLabel = useMemo(() => {
    if (!activeTagId) return "Sve oznake";
    const selected = (tags || []).find((tag) => Number(tag.id) === Number(activeTagId));
    return selected?.name || "Sve oznake";
  }, [activeTagId, tags]);

  const selectedFamilyLabel = useMemo(() => {
    const selected = (families || []).find((family) => Number(family.id) === Number(activeFamilyId));
    return selected?.name || "Bez porodice";
  }, [families, activeFamilyId]);

  const relationshipPeople = useMemo(() => {
    return [...(people || [])].sort((a, b) =>
      getCleanName(a?.name || "").localeCompare(getCleanName(b?.name || ""), "bs", {
        sensitivity: "base",
      })
    );
  }, [people]);

  useEffect(() => {
    if (!relationshipPeople.length) {
      setRelationPersonAId(0);
      setRelationPersonBId(0);
      return;
    }
    const ids = relationshipPeople.map((person) => Number(person.id));
    setRelationPersonAId((prev) => {
      if (ids.includes(Number(prev))) return Number(prev);
      return ids[0];
    });
    setRelationPersonBId((prev) => {
      if (ids.includes(Number(prev))) return Number(prev);
      return ids.length > 1 ? ids[1] : ids[0];
    });
  }, [relationshipPeople]);

  const selectedRelationPersonA = useMemo(
    () => relationshipPeople.find((person) => Number(person.id) === Number(relationPersonAId)) || null,
    [relationshipPeople, relationPersonAId]
  );
  const selectedRelationPersonB = useMemo(
    () => relationshipPeople.find((person) => Number(person.id) === Number(relationPersonBId)) || null,
    [relationshipPeople, relationPersonBId]
  );

  const relationshipResult = useMemo(() => {
    const personA = selectedRelationPersonA;
    const personB = selectedRelationPersonB;
    if (!personA || !personB) {
      return { title: "Odaberi dvije osobe", detail: "Izaberi osobe za racunanje srodstva." };
    }
    if (Number(personA.id) === Number(personB.id)) {
      return { title: "Ista osoba", detail: "Odabrana je ista osoba u oba polja." };
    }

    const aId = Number(personA.id);
    const bId = Number(personB.id);
    const byId = new Map((people || []).map((person) => [Number(person.id), person]));

    const siblingKind = getSiblingKind(personA, personB, byId, relationships);
    const isSpouse =
      getNumericId(personA.spouse) === bId ||
      getNumericId(personB.spouse) === aId ||
      hasDirectRelationshipBetween(aId, bId, relationships);
    const bParentIds = getKinshipParents(personB, byId, relationships);
    const aParentIds = getKinshipParents(personA, byId, relationships);
    const distAAncestorOfB = getDistanceToAncestor(bId, aId, byId, relationships);
    const distBAncestorOfA = getDistanceToAncestor(aId, bId, byId, relationships);
    const detailParts = [];

    const ancestorsA = getAncestorDistanceMap(aId, byId, relationships);
    const ancestorsB = getAncestorDistanceMap(bId, byId, relationships);
    let bestCommon = null;
    ancestorsA.forEach((distA, ancestorId) => {
      if (!ancestorsB.has(ancestorId)) return;
      const distB = ancestorsB.get(ancestorId);
      if (!distA || !distB) return;
      const score = distA + distB;
      if (!bestCommon || score < bestCommon.score) {
        bestCommon = { ancestorId, distA, distB, score };
      }
    });
    if (bestCommon) {
      const ancestorName = getCleanName(byId.get(bestCommon.ancestorId)?.name || "Nepoznato");
      detailParts.push(
        `Najblizi zajednicki predak: ${ancestorName} (A:${bestCommon.distA}. koljeno, B:${bestCommon.distB}. koljeno)`
      );
    }

    let title = "Povezani kroz stablo";
    if (isSpouse) {
      title = "Bracni partneri";
    } else if (bParentIds.includes(aId)) {
      title = `${getCleanName(personA.name)} je ${getAncestorLabel(1, personA)} od ${getCleanName(personB.name)}`;
    } else if (aParentIds.includes(bId)) {
      title = `${getCleanName(personA.name)} je ${getDescendantLabel(1, personA)} od ${getCleanName(personB.name)}`;
    } else if (siblingKind === "full" || siblingKind === "half") {
      title = `${getCleanName(personA.name)} je ${getSiblingLabel(personA, siblingKind === "half")} od ${getCleanName(personB.name)}`;
    } else if (Number.isInteger(distAAncestorOfB) && distAAncestorOfB > 0) {
      title = `${getCleanName(personA.name)} je ${getAncestorLabel(distAAncestorOfB, personA)} od ${getCleanName(personB.name)}`;
      detailParts.push(`Direktna linija: ${distAAncestorOfB}. koljeno`);
    } else if (Number.isInteger(distBAncestorOfA) && distBAncestorOfA > 0) {
      title = `${getCleanName(personA.name)} je ${getDescendantLabel(distBAncestorOfA, personA)} od ${getCleanName(personB.name)}`;
      detailParts.push(`Direktna linija: ${distBAncestorOfA}. koljeno`);
    } else {
      let foundDirectAvuncular = false;
      for (let i = 0; i < bParentIds.length; i += 1) {
        const parentId = bParentIds[i];
        const parent = byId.get(parentId);
        const kind = getSiblingKind(personA, parent, byId, relationships);
        if (!kind) continue;
        const base = getUncleAuntLabel(personA, parent);
        const prefix = kind === "half" ? "polu" : "";
        title = `${getCleanName(personA.name)} je ${prefix}${base} od ${getCleanName(personB.name)}`;
        foundDirectAvuncular = true;
        break;
      }
      if (!foundDirectAvuncular) {
        for (let i = 0; i < aParentIds.length; i += 1) {
          const parentId = aParentIds[i];
          const parent = byId.get(parentId);
          const kind = getSiblingKind(personB, parent, byId, relationships);
          if (!kind) continue;
          const base = getNieceNephewLabel(personA);
          const prefix = kind === "half" ? "polu" : "";
          title = `${getCleanName(personA.name)} je ${prefix}${base} od ${getCleanName(personB.name)}`;
          foundDirectAvuncular = true;
          break;
        }
      }
      if (!foundDirectAvuncular) {
        const partnersOfB = Array.from(getPartnerIds(bId, byId, relationships));
        for (let i = 0; i < partnersOfB.length; i += 1) {
          const partner = byId.get(partnersOfB[i]);
          if (!partner) continue;
          for (let j = 0; j < aParentIds.length; j += 1) {
            const parent = byId.get(aParentIds[j]);
            if (!parent) continue;
            const kind = getSiblingKind(partner, parent, byId, relationships);
            if (!kind) continue;
            const label = getUncleAuntSpouseLabel(personB, partner, parent);
            title = `${getCleanName(personB.name)} je ${label} od ${getCleanName(personA.name)}`;
            foundDirectAvuncular = true;
            break;
          }
          if (foundDirectAvuncular) break;
        }
      }

      if (!foundDirectAvuncular && bestCommon) {
        const degree = Math.min(bestCommon.distA, bestCommon.distB) - 1;
        const removed = Math.abs(bestCommon.distA - bestCommon.distB);
        const technical = getCousinTechnicalLabel(degree, removed);
        if (degree >= 1) {
          if (degree === 1 && removed === 0) {
            title = `${getCleanName(personA.name)} i ${getCleanName(personB.name)} su prvi rodjaci`;
            detailParts.push(
              `Generacije do zajednickog pretka: A ${bestCommon.distA}, B ${bestCommon.distB}`
            );
          } else {
            title = `${getCleanName(personA.name)} i ${getCleanName(personB.name)} su ${getLocalizedCousinLabel(
              degree,
              removed
            )}`;
            detailParts.push(
              `Generacije do zajednickog pretka: A ${bestCommon.distA}, B ${bestCommon.distB}`
            );
          }
          detailParts.push(`Klasifikacija: ${technical}`);
        } else if (bestCommon.distA === 1 && bestCommon.distB > 1) {
          const extra = bestCommon.distB - 2;
          title = getAvuncularDistanceLabel("tetka/ujak/amidza", extra);
          detailParts.push(`Klasifikacija: avunkularna linija (${bestCommon.distB - 1}. koljeno)`);
        } else if (bestCommon.distB === 1 && bestCommon.distA > 1) {
          const extra = bestCommon.distA - 2;
          title = getAvuncularDistanceLabel("necak/necakinja", extra);
          detailParts.push(`Klasifikacija: potomacka avunkularna linija (${bestCommon.distA - 1}. koljeno)`);
        }
      }
    }

    const path = buildRelationshipPath(aId, bId, byId, relationships);
    const pathLabel = getPathLabel(path, byId);
    if (pathLabel) detailParts.unshift(`Putanja: ${pathLabel}`);

    if (title === "Povezani kroz stablo") {
      const edgePattern = (path?.edges || []).join(",");
      if (edgePattern === "roditelj,roditelj,dijete,dijete") {
        title = `${getCleanName(personA.name)} i ${getCleanName(personB.name)} su prvi rodjaci`;
        if (!detailParts.some((part) => String(part).startsWith("Klasifikacija:"))) {
          detailParts.push("Klasifikacija: 1. rodjaci");
        }
      }
    }

    if (!pathLabel) {
      const surnameA = getSurnameFromFullName(personA.name).toLowerCase();
      const surnameB = getSurnameFromFullName(personB.name).toLowerCase();
      if (surnameA && surnameB && surnameA === surnameB) {
        detailParts.push(
          `Prezime se poklapa (${getSurnameFromFullName(
            personA.name
          )}), ali nedostaju roditeljske/partnerske veze da se izracuna tacna putanja.`
        );
      }
    }
    if (detailParts.length > 0) {
      return { title, detail: detailParts.join(" | ") };
    }
    return { title, detail: "Nema direktne putanje kroz roditelj/bracni partner/relacije veze." };
  }, [selectedRelationPersonA, selectedRelationPersonB, people, relationships]);


  return (
    <div className="tree-shell">
      <aside className="tree-side">
        <div className="panel card">
          <h3>{"Porodične grupe"}</h3>
          <div className="family-select" ref={familySelectRef}>
            <Layers className="w-4 h-4" />
            <button
              type="button"
              className="filter-dropdown-trigger family-dropdown-trigger"
              aria-label="Aktivna porodica"
              aria-haspopup="listbox"
              aria-expanded={familyOpen}
              onKeyDown={(event) =>
                handleTreeDropdownTypeahead(
                  event,
                  "family",
                  (families || []).map((family) => ({
                    value: Number(family.id),
                    label: getCleanName(family.name),
                  })),
                  (nextFamilyId) => onFamilyChange(Number(nextFamilyId))
                )
              }
              onClick={() => {
                setFamilyOpen((prev) => !prev);
                setFocusOpen(false);
                setTagOpen(false);
                setCardExtraOpen(false);
              }}
            >
              <span>{selectedFamilyLabel}</span>
              <ChevronDown className={`card-extra-chevron ${familyOpen ? "is-open" : ""}`} />
            </button>
            {familyOpen && (
              <div className="filter-dropdown-menu family-dropdown-menu" role="listbox" aria-label="Porodice opcije">
                {(families || []).map((family) => (
                  <button
                    key={family.id}
                    type="button"
                    role="option"
                    aria-selected={Number(activeFamilyId) === Number(family.id)}
                    className={`filter-dropdown-option ${
                      Number(activeFamilyId) === Number(family.id) ? "is-selected" : ""
                    }`}
                    onClick={() => {
                      onFamilyChange(Number(family.id));
                      setFamilyOpen(false);
                    }}
                  >
                    {family.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="family-create">
            <input
              type="text"
              placeholder="Naziv nove porodice"
              value={newFamilyName}
              onChange={(e) => onNewFamilyNameChange(e.target.value)}
            />
            <button onClick={onAddFamily} className="btn-primary full">
              <Plus className="w-4 h-4" />
              Kreiraj porodicu
            </button>
            <button
              onClick={onDeleteFamily}
              className="btn-danger full"
              disabled={!activeFamilyId}
            >
              <Trash2 className="w-4 h-4" />
              {"Obriši porodicu"}
            </button>
          </div>
        </div>

        <div className="panel card">
          <h3>{"Sažetak porodice"}</h3>
          <div className="stat-grid">
            <div>
              <p className="stat-label">Ukupno</p>
              <p className="stat-value">{stats.total}</p>
            </div>
            <div>
              <p className="stat-label">{"\u017divi"}</p>
              <p className="stat-value">{stats.living}</p>
            </div>
            <div>
              <p className="stat-label">{"Muško"}</p>
              <p className="stat-value">{stats.males}</p>
            </div>
            <div>
              <p className="stat-label">{"\u017densko"}</p>
              <p className="stat-value">{stats.females}</p>
            </div>
          </div>
        </div>

        <div className="panel card relationship-panel">
          <h3>Kalkulator srodstva</h3>
          <div className="relationship-fields">
            <div className="relationship-field" ref={relationPersonARef}>
              <span>Osoba A</span>
              <button
                type="button"
                className="filter-dropdown-trigger tree-toolbar-dropdown-trigger"
                aria-haspopup="listbox"
                aria-expanded={relationPersonAOpen}
                onKeyDown={(event) =>
                  handleTreeDropdownTypeahead(
                    event,
                    "relationA",
                    relationshipPeople.map((person) => ({
                      value: Number(person.id),
                      label: getCleanName(person.name),
                    })),
                    (nextId) => setRelationPersonAId(Number(nextId))
                  )
                }
                onClick={() => {
                  setRelationPersonAOpen((prev) => !prev);
                  setRelationPersonBOpen(false);
                  setFamilyOpen(false);
                  setFocusOpen(false);
                  setTagOpen(false);
                  setCardExtraOpen(false);
                  setMoreOptionsOpen(false);
                }}
              >
                <span>{selectedRelationPersonA ? getCleanName(selectedRelationPersonA.name) : "Odaberi osobu"}</span>
                <ChevronDown className={`card-extra-chevron ${relationPersonAOpen ? "is-open" : ""}`} />
              </button>
              {relationPersonAOpen && (
                <div className="filter-dropdown-menu family-dropdown-menu" role="listbox" aria-label="Osoba A opcije">
                  {relationshipPeople.map((person) => (
                    <button
                      key={`rel-a-${person.id}`}
                      type="button"
                      role="option"
                      aria-selected={Number(relationPersonAId) === Number(person.id)}
                      className={`filter-dropdown-option ${
                        Number(relationPersonAId) === Number(person.id) ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        setRelationPersonAId(Number(person.id));
                        setRelationPersonAOpen(false);
                      }}
                    >
                      {getCleanName(person.name)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relationship-field" ref={relationPersonBRef}>
              <span>Osoba B</span>
              <button
                type="button"
                className="filter-dropdown-trigger tree-toolbar-dropdown-trigger"
                aria-haspopup="listbox"
                aria-expanded={relationPersonBOpen}
                onKeyDown={(event) =>
                  handleTreeDropdownTypeahead(
                    event,
                    "relationB",
                    relationshipPeople.map((person) => ({
                      value: Number(person.id),
                      label: getCleanName(person.name),
                    })),
                    (nextId) => setRelationPersonBId(Number(nextId))
                  )
                }
                onClick={() => {
                  setRelationPersonBOpen((prev) => !prev);
                  setRelationPersonAOpen(false);
                  setFamilyOpen(false);
                  setFocusOpen(false);
                  setTagOpen(false);
                  setCardExtraOpen(false);
                  setMoreOptionsOpen(false);
                }}
              >
                <span>{selectedRelationPersonB ? getCleanName(selectedRelationPersonB.name) : "Odaberi osobu"}</span>
                <ChevronDown className={`card-extra-chevron ${relationPersonBOpen ? "is-open" : ""}`} />
              </button>
              {relationPersonBOpen && (
                <div className="filter-dropdown-menu family-dropdown-menu" role="listbox" aria-label="Osoba B opcije">
                  {relationshipPeople.map((person) => (
                    <button
                      key={`rel-b-${person.id}`}
                      type="button"
                      role="option"
                      aria-selected={Number(relationPersonBId) === Number(person.id)}
                      className={`filter-dropdown-option ${
                        Number(relationPersonBId) === Number(person.id) ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        setRelationPersonBId(Number(person.id));
                        setRelationPersonBOpen(false);
                      }}
                    >
                      {getCleanName(person.name)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="relationship-result">
            <p className="relationship-title">{relationshipResult.title}</p>
            <p className="relationship-detail">{relationshipResult.detail}</p>
          </div>
        </div>
      </aside>

      <section className="tree-canvas">
        <div className="tree-toolbar">
          <div className="toolbar-group">
            <button onClick={zoomIn} className="btn-icon">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={zoomOut} className="btn-icon">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={resetTreeLayout} className="btn-icon" title="Reset raspored">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={fitToScreen} className="btn-icon">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          <div className="toolbar-meta">{projectedPeople.length} prikazano / {people.length} ukupno</div>
        </div>

        <div className="tree-filters">
          <div className="filter-item">
            <span>Fokus</span>
            <div className="filter-dropdown-wrap" ref={focusSelectRef}>
              <button
                type="button"
                className="filter-dropdown-trigger tree-toolbar-dropdown-trigger"
                aria-label="Fokus osobe"
                aria-haspopup="listbox"
                aria-expanded={focusOpen}
                onKeyDown={(event) =>
                  handleTreeDropdownTypeahead(
                    event,
                    "focus",
                    (people || []).map((person) => ({
                      value: Number(person.id),
                      label: getCleanName(person.name),
                    })),
                    (nextId) => onFocusChange(Number(nextId))
                  )
                }
                onClick={() => {
                  setFocusOpen((prev) => !prev);
                  setTagOpen(false);
                  setCardExtraOpen(false);
                }}
              >
                <span>{selectedFocusPerson?.name || "Bez imena"}</span>
                <ChevronDown className={`card-extra-chevron ${focusOpen ? "is-open" : ""}`} />
              </button>
              {focusOpen && (
                <div
                  className="filter-dropdown-menu tree-toolbar-dropdown-menu"
                  role="listbox"
                  aria-label="Fokus opcije"
                >
                  {people.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      role="option"
                      aria-selected={Number(focusPersonId) === Number(person.id)}
                      className={`filter-dropdown-option ${
                        Number(focusPersonId) === Number(person.id) ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        onFocusChange(Number(person.id));
                        setFocusOpen(false);
                      }}
                    >
                      {person.name || "Bez imena"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="filter-item">
            <span>Oznaka</span>
            <div className="filter-dropdown-wrap" ref={tagSelectRef}>
              <button
                type="button"
                className="filter-dropdown-trigger tree-toolbar-dropdown-trigger"
                aria-label="Filter oznake"
                aria-haspopup="listbox"
                aria-expanded={tagOpen}
                onKeyDown={(event) =>
                  handleTreeDropdownTypeahead(
                    event,
                    "tag",
                    [
                      { value: 0, label: "Sve oznake" },
                      ...((tags || []).map((tag) => ({
                        value: Number(tag.id),
                        label: getCleanName(tag.name),
                      }))),
                    ],
                    (nextTagId) => onTagChange(Number(nextTagId))
                  )
                }
                onClick={() => {
                  setTagOpen((prev) => !prev);
                  setFocusOpen(false);
                  setCardExtraOpen(false);
                }}
              >
                <span>{selectedTagLabel}</span>
                <ChevronDown className={`card-extra-chevron ${tagOpen ? "is-open" : ""}`} />
              </button>
              {tagOpen && (
                <div
                  className="filter-dropdown-menu tree-toolbar-dropdown-menu"
                  role="listbox"
                  aria-label="Oznake opcije"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={!activeTagId}
                    className={`filter-dropdown-option ${!activeTagId ? "is-selected" : ""}`}
                    onClick={() => {
                      onTagChange(0);
                      setTagOpen(false);
                    }}
                  >
                    Sve oznake
                  </button>
                  {(tags || []).map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      role="option"
                      aria-selected={Number(activeTagId) === Number(tag.id)}
                      className={`filter-dropdown-option ${
                        Number(activeTagId) === Number(tag.id) ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        onTagChange(Number(tag.id));
                        setTagOpen(false);
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="filter-item filter-item-display">
            <span>Prikaz</span>
            <div className="segmented">
              {["ancestors", "descendants", "both", "all"].map((mode) => (
                <button
                  key={mode}
                  className={`seg-btn ${expandMode === mode ? "active" : ""}`}
                  onClick={() => onExpandModeChange(mode)}
                >
                  {mode === "ancestors"
                    ? "Preci"
                    : mode === "descendants"
                      ? "Potomci"
                      : mode === "both"
                        ? "Oboje"
                        : "Cijelo stablo"}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-item filter-item-card">
            <span>Kartica</span>
            <div className="card-controls-row">
              <div className="segmented card-mode-segmented">
              <button
                type="button"
                className={`seg-btn ${cardView === "detailed" ? "active" : ""}`}
                onClick={() => setCardView("detailed")}
              >
                Detaljno
              </button>
              <button
                type="button"
                className={`seg-btn ${cardView === "compact" ? "active" : ""}`}
                onClick={() => setCardView("compact")}
              >
                Kompaktno
              </button>
              </div>
              <div className="card-extra-select-wrap" ref={cardExtraSelectRef}>
                <button
                  type="button"
                  className="filter-dropdown-trigger tree-toolbar-dropdown-trigger card-extra-select"
                  aria-label="Dodatno polje kartice"
                  aria-haspopup="listbox"
                  aria-expanded={cardExtraOpen}
                  onKeyDown={(event) =>
                    handleTreeDropdownTypeahead(
                      event,
                      "cardExtra",
                      cardExtraOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                      })),
                      (nextValue) => setCardExtraField(String(nextValue))
                    )
                  }
                  onClick={() => {
                    setCardExtraOpen((prev) => !prev);
                    setFocusOpen(false);
                    setTagOpen(false);
                  }}
                >
                  <span>{selectedCardExtraLabel}</span>
                  <ChevronDown className={`card-extra-chevron ${cardExtraOpen ? "is-open" : ""}`} />
                </button>
                {cardExtraOpen && (
                  <div
                    className="filter-dropdown-menu tree-toolbar-dropdown-menu card-extra-menu"
                    role="listbox"
                    aria-label="Dodatno polje kartice opcije"
                  >
                    {cardExtraOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={cardExtraField === option.value}
                        className={`filter-dropdown-option card-extra-option ${
                          cardExtraField === option.value ? "is-selected" : ""
                        }`}
                        onClick={() => {
                          setCardExtraField(option.value);
                          setCardExtraOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="filter-item tree-more-options" ref={moreOptionsRef}>
            <span>Više opcija</span>
            <button
              type="button"
              className={`filter-dropdown-trigger tree-toolbar-dropdown-trigger more-options-trigger ${
                moreOptionsOpen ? "is-open" : ""
              }`}
              aria-haspopup="dialog"
              aria-expanded={moreOptionsOpen}
              onClick={() => {
                setMoreOptionsOpen((prev) => !prev);
                setHighlightOpen(false);
                setFocusOpen(false);
                setTagOpen(false);
                setCardExtraOpen(false);
              }}
            >
              <span>
                {yearMode === "off"
                  ? "Godina: isključeno"
                  : yearMode === "status"
                    ? "Godina + boje"
                    : "Godina: samo živi"}
              </span>
              <SlidersHorizontal className="more-options-icon" />
            </button>
            {moreOptionsOpen && (
              <div className="tree-more-options-panel" role="dialog" aria-label="Više opcija prikaza">
                <label className="tree-more-options-label" htmlFor="tree-year-filter-input">
                  Godina za prikaz
                </label>
                <input
                  id="tree-year-filter-input"
                  className="tree-more-options-year"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="3000"
                  placeholder="npr. 1980"
                  value={yearFilterInput}
                  onChange={(event) => setYearFilterInput(event.target.value)}
                />
                <div className="tree-more-options-modes">
                  <button
                    type="button"
                    className={`seg-btn ${yearMode === "off" ? "active" : ""}`}
                    onClick={() => setYearMode("off")}
                  >
                    Normalno
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${yearMode === "status" ? "active" : ""}`}
                    onClick={() => setYearMode("status")}
                  >
                    Boje statusa
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${yearMode === "living" ? "active" : ""}`}
                    onClick={() => setYearMode("living")}
                  >
                    Samo živi
                  </button>
                </div>
                <label className="tree-more-options-label">
                  Istakni osobe
                </label>
                <div className="filter-dropdown-wrap" ref={highlightSelectRef}>
                  <button
                    type="button"
                    className="filter-dropdown-trigger tree-toolbar-dropdown-trigger"
                    aria-label="Isticanje po kriteriju"
                    aria-haspopup="listbox"
                    aria-expanded={highlightOpen}
                    onClick={() => setHighlightOpen((prev) => !prev)}
                  >
                    <span>{selectedHighlightLabel}</span>
                    <ChevronDown className={`card-extra-chevron ${highlightOpen ? "is-open" : ""}`} />
                  </button>
                  {highlightOpen && (
                    <div
                      className="filter-dropdown-menu tree-toolbar-dropdown-menu"
                      role="listbox"
                      aria-label="Isticanje po kriteriju opcije"
                    >
                      {highlightOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={highlightRule === option.value}
                          className={`filter-dropdown-option ${
                            highlightRule === option.value ? "is-selected" : ""
                          }`}
                          onClick={() => {
                            setHighlightRule(option.value);
                            setHighlightOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!Number.isFinite(projectionYear) && yearMode !== "off" && (
                  <p className="tree-more-options-hint">Unesi validnu godinu da filter radi.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {profilePerson ? (
          <div className="tree-profile-page">
            <div className="tree-profile-header">
              <button
                type="button"
                className="btn-ghost small"
                onClick={() => setProfilePersonId(null)}
              >
                <ArrowLeft className="w-4 h-4" />
                Nazad na stablo
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onEditPerson && onEditPerson(profilePerson)}
              >
                <Pencil className="w-4 h-4" />
                Uredi profil
              </button>
            </div>
            <div className="tree-profile-card">
              {resolvedProfilePhoto && !profilePhotoFailed ? (
                <img
                  src={resolvedProfilePhoto}
                  alt={profilePerson.name || "Profilna fotografija"}
                  className="tree-profile-photo"
                  onError={() => setProfilePhotoFailed(true)}
                />
              ) : (
                <div className="tree-profile-photo tree-profile-fallback">
                  {getCleanName(profilePerson.name)
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0] || "")
                    .join("")
                    .toUpperCase()}
                </div>
              )}
              <div className="tree-profile-details">
                <div className="tree-profile-title">
                  <h3>{getCleanName(profilePerson.name)}</h3>
                  <p className="muted-text">{getLifeLabel(profilePerson)}</p>
                </div>

                <div className="tree-profile-badges">
                  <span className={`pill ${profilePerson.gender === "F" ? "pink" : "blue"}`}> 
                    {profilePerson.gender === "F" ? "Žensko" : "Muško"}
                  </span>
                  {profilePerson.healthBadge === "hereditary" && (
                    <span className="pill tree-pill-risk">Nasljedni rizik</span>
                  )}
                  {profilePerson.healthBadge === "risk" && (
                    <span className="pill tree-pill-risk">Rizični faktori</span>
                  )}
                </div>

                <div className="tree-profile-grid">
                  <div className="tree-info-card">
                    <h4>Porodični podaci</h4>
                    <p><strong>Otac:</strong> {profileParent1 ? getCleanName(profileParent1.name) : "-"}</p>
                    <p><strong>Majka:</strong> {profileParent2 ? getCleanName(profileParent2.name) : "-"}</p>
                    <p><strong>Bracni partner:</strong> {profileSpouse ? getCleanName(profileSpouse.name) : "-"}</p>
                    <p><strong>Broj djece:</strong> {profileChildrenCount}</p>
                    <p><strong>Zanimanje:</strong> {String(profilePerson.occupation || "").trim() || "-"}</p>
                    <p><strong>Mjesto rođenja:</strong> {String(profilePerson.birthPlace || "").trim() || "-"}</p>
                    <p><strong>Osnovna skola:</strong> {String(profilePerson.primarySchool || "").trim() || "-"}</p>
                    <p><strong>Srednja skola:</strong> {String(profilePerson.secondarySchool || "").trim() || "-"}</p>
                    <p><strong>Mjesto ukopa:</strong> {String(profilePerson.burialPlace || "").trim() || "-"}</p>
                  </div>

                  <div className="tree-info-card">
                    <h4>Zdravlje</h4>
                    <p><strong>Nasljedno:</strong> {String(profileHealth?.hereditaryConditions || "").trim() || "-"}</p>
                    <p><strong>Rizično:</strong> {String(profileHealth?.riskFactors || "").trim() || "-"}</p>
                    <p><strong>Napomene:</strong> {String(profileHealth?.notes || "").trim() || "-"}</p>
                  </div>

                  <div className="tree-info-card">
                    <h4>Oznake</h4>
                    {profileTagNames.length > 0 ? (
                      <div className="tree-chip-row">
                        {profileTagNames.map((tag) => (
                          <span key={tag} className="tag-pill small active">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p>-</p>
                    )}
                  </div>

                  <div className="tree-info-card">
                    <h4>Djeca</h4>
                    {profileChildren.length > 0 ? (
                      <div className="tree-list">
                        {profileChildren.map((child) => (
                          <span key={child.id}>
                            {getCleanName(child.name)} ({getLifeLabel(child)})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p>-</p>
                    )}
                  </div>

                  <div className="tree-info-card tree-info-card-wide">
                    <h4>Veze kroz vrijeme</h4>
                    {profileRelationships.length > 0 ? (
                      <div className="tree-list">
                        {profileRelationships.map((row) => (
                          <span key={row.id}>
                            {row.status} - {row.otherName}
                            {(row.startYear || row.endYear) &&
                              ` (${row.startYear || "?"} - ${row.endYear || "?"})`}
                            {row.notes ? ` | ${row.notes}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p>-</p>
                    )}
                  </div>
                </div>

                {profilePerson.bio && (
                  <div className="tree-info-card tree-profile-bio-card">
                    <h4>Biografija</h4>
                    <p className="profile-bio">{profilePerson.bio}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="tree-grid">
            <div ref={diagramRef} className="tree-diagram" />
            <div className="tree-overview">
              <p className="overview-title">Minimapa</p>
              <div ref={overviewRef} className="overview-canvas" />
            </div>
          </div>
        )}

        {people.length === 0 && (
          <div className="empty-state">
            <h3>{"Još nema osoba"}</h3>
            <p>{"Dodaj prvog člana porodice da počneš graditi ovo stablo."}</p>
            <button onClick={onAddPerson} className="btn-primary">
              <Plus className="w-4 h-4" />
              Dodaj osobu
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default TreeView;















