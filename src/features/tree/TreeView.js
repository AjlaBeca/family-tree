import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Trash2,
  Pencil,
  ArrowLeft,
} from "lucide-react";
import { buildModelData } from "./tree-model";
import { applyManualLayout } from "./gojs-layout";
import {
  TREE_NODE_WIDTH,
  TREE_NODE_HEIGHT,
  TREE_SPOUSE_CURVINESS,
  TREE_SPOUSE_CURVE_DIR,
} from "./tree-constants";

const normalizePhotoSource = (photo) => {
  const value = String(photo || "").trim();
  if (!value) return "";
  const lowered = value.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return "";
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

const formatCompactName = (name, max = 20) => {
  const value = getCleanName(name);
  if (value.length <= max) return value;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    const short = `${first} ${last.charAt(0).toUpperCase()}.`;
    if (short.length <= max) return short;
  }
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1)}…`;
};

const TreeView = ({
  families,
  activeFamilyId,
  onFamilyChange,
  newFamilyName,
  onNewFamilyNameChange,
  onAddFamily,
  onDeleteFamily,
  activeFamily,
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
  onImport,
  onExport,
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
  const [profilePersonId, setProfilePersonId] = useState(null);
  const [cardView, setCardView] = useState("detailed");
  const [profilePhotoFailed, setProfilePhotoFailed] = useState(false);

  useEffect(() => {
    visibleRef.current = visiblePeople;
  }, [visiblePeople]);

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
    if (!window.go || !diagramRef.current) return;

    const $ = window.go.GraphObject.make;
    goRef.current = window.go;
    const existingDiagram = window.go.Diagram.fromDiv(diagramRef.current);
    if (existingDiagram) {
      diagramInstanceRef.current = existingDiagram;
      const { nodeDataArray, linkDataArray } = buildModelData(visibleRef.current, {
        cardMode: cardView,
        resolvePhoto: normalizePhotoSource,
      });
      const model = new window.go.GraphLinksModel(nodeDataArray, linkDataArray);
      existingDiagram.model = model;
      applyManualLayout(existingDiagram, visibleRef.current, window.go);
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

    const diagram = $(window.go.Diagram, diagramRef.current, {
      "undoManager.isEnabled": true,
      initialAutoScale: window.go.Diagram.Uniform,
      "animationManager.isEnabled": false,
      padding: 20,
    });
    diagram.layout = new window.go.Layout();
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
        const viewPoint = new window.go.Point(
          ev.clientX - rect.left,
          ev.clientY - rect.top
        );
        const docPoint = diagram.transformViewToDoc(viewPoint);
        const part = diagram.findPartAt(docPoint, true);
        if (part instanceof window.go.Node && part.data && !part.data.category) {
          openEditor(part);
        }
      };
      diagram.__dblclickHandler = handler;
      diagram.div.addEventListener("dblclick", handler);
    }


    diagram.nodeTemplate = (
      $(
        window.go.Node,
        "Auto",
        {
          locationSpot: window.go.Spot.Center,
          isLayoutPositioned: true,
          doubleClick: (e, node) => {
            openEditor(node);
          },
        },
        new window.go.Binding("isLayoutPositioned", "isLayoutPositioned"),
        $(
          window.go.Shape,
          "RoundedRectangle",
          {
            parameter1: 14,
            fill: "#F8FAFC",
            stroke: "#1D4ED8",
            strokeWidth: 2,
            cursor: "pointer",
            desiredSize: new window.go.Size(TREE_NODE_WIDTH, TREE_NODE_HEIGHT),
          },
          new window.go.Binding("stroke", "cardStroke"),
          new window.go.Binding("fill", "cardFill")
        ),
        $(
          window.go.Panel,
          "Auto",
          { margin: 8, alignment: window.go.Spot.Center },
          $(
            window.go.Panel,
            "Vertical",
            { alignment: window.go.Spot.Center },
            $(
              window.go.Panel,
              "Table",
              {
                margin: new window.go.Margin(2, 0, 0, 0),
                defaultAlignment: window.go.Spot.Left,
                visible: true,
              },
              new window.go.Binding("visible", "cardMode", (mode) => mode !== "compact"),
              $(window.go.RowColumnDefinition, { column: 0, width: 42 }),
              $(window.go.RowColumnDefinition, { column: 1, width: TREE_NODE_WIDTH - 92 }),
              $(
                window.go.Panel,
                "Auto",
                {
                  row: 0,
                  column: 0,
                  rowSpan: 3,
                  margin: new window.go.Margin(0, 8, 0, 0),
                  alignment: window.go.Spot.Center,
                },
                $(window.go.Shape, "Circle", {
                  fill: "#111827",
                  stroke: null,
                  width: 34,
                  height: 34,
                }),
                $(
                  window.go.Picture,
                  {
                    width: 34,
                    height: 34,
                    imageStretch: window.go.GraphObject.UniformToFill,
                  },
                  new window.go.Binding("source", "photoSrc", (photo) => photo || null),
                  new window.go.Binding("visible", "hasPhoto")
                ),
                $(
                  window.go.TextBlock,
                  {
                    font: "500 14px 'Space Grotesk', sans-serif",
                    stroke: "#F9FAFB",
                  },
                  new window.go.Binding("visible", "hasPhoto", (hasPhoto) => !hasPhoto),
                  new window.go.Binding("text", "name", (name) =>
                    getCleanName(name)
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()
                  )
                )
              ),
              $(
                window.go.TextBlock,
                {
                  row: 0,
                  column: 1,
                  font: "500 14px 'Space Grotesk', sans-serif",
                  stroke: "#111827",
                  margin: new window.go.Margin(2, 0, 2, 0),
                  maxLines: 2,
                  wrap: window.go.TextBlock.WrapFit,
                  overflow: window.go.TextBlock.OverflowEllipsis,
                  textAlign: "left",
                },
                new window.go.Binding("text", "name", (name) => getCleanName(name))
              ),
              $(
                window.go.TextBlock,
                {
                  row: 1,
                  column: 1,
                  font: "12px 'Space Grotesk', sans-serif",
                  stroke: "#4B5563",
                  maxLines: 1,
                  overflow: window.go.TextBlock.OverflowEllipsis,
                  textAlign: "left",
                },
                new window.go.Binding("text", (data) => getLifeLabel(data))
              ),
              $(
                window.go.TextBlock,
                {
                  row: 2,
                  column: 1,
                  font: "11px 'Space Grotesk', sans-serif",
                  stroke: "#64748B",
                  maxLines: 1,
                  overflow: window.go.TextBlock.OverflowEllipsis,
                  textAlign: "left",
                },
                new window.go.Binding("text", (data) =>
                  data.gender === "F" ? "Žensko" : "Muško"
                )
              )
            ),
            $(
              window.go.Panel,
              "Horizontal",
              {
                margin: new window.go.Margin(8, 0, 0, 0),
                visible: false,
              },
              new window.go.Binding("visible", "cardMode", (mode) => mode === "compact"),
              $(
                window.go.Panel,
                "Auto",
                { margin: new window.go.Margin(0, 6, 0, 0) },
                $(window.go.Shape, "Circle", {
                  fill: "#0F172A",
                  stroke: null,
                  width: 26,
                  height: 26,
                }),
                $(
                  window.go.Picture,
                  {
                    width: 26,
                    height: 26,
                    imageStretch: window.go.GraphObject.UniformToFill,
                  },
                  new window.go.Binding("source", "photoSrc", (photo) => photo || null),
                  new window.go.Binding("visible", "hasPhoto")
                ),
                $(
                  window.go.TextBlock,
                  {
                    font: "500 11px 'Space Grotesk', sans-serif",
                    stroke: "#F8FAFC",
                  },
                  new window.go.Binding("visible", "hasPhoto", (hasPhoto) => !hasPhoto),
                  new window.go.Binding("text", "name", (name) =>
                    getCleanName(name)
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()
                  )
                )
              ),
              $(
                window.go.TextBlock,
                {
                  font: "500 13px 'Space Grotesk', sans-serif",
                  stroke: "#0F172A",
                  width: TREE_NODE_WIDTH - 56,
                  maxLines: 1,
                  overflow: window.go.TextBlock.OverflowEllipsis,
                  textAlign: "left",
                },
                new window.go.Binding("text", (data) => {
                  const compactName = formatCompactName(data.name, 20);
                  return `${compactName} (${getLifeLabel(data)})`;
                })
              )
            )
          )
        )
      )
    );

    diagram.nodeTemplateMap.add(
      "Marriage",
      $(
        window.go.Node,
        "Spot",
        {
          selectable: false,
          pickable: false,
          layerName: "Background",
          locationSpot: window.go.Spot.Center,
        },
        $(window.go.Shape, "Circle", {
          portId: "",
          width: 2,
          height: 2,
          fill: "transparent",
          stroke: null,
          alignment: window.go.Spot.Center,
        })
      )
    );

    diagram.linkTemplate = $(
      window.go.Link,
      {
        selectable: false,
        pickable: false,
        routing: window.go.Link.Orthogonal,
        corner: 0,
        layerName: "Background",
        fromSpot: window.go.Spot.Bottom,
        toSpot: window.go.Spot.Top,
      },
      $(window.go.Shape, { strokeWidth: 1.6, stroke: "#AEB7C7" })
    );

    diagram.linkTemplateMap.add(
      "Spouse",
      $(
        window.go.Link,
        {
          selectable: false,
          pickable: false,
          routing: window.go.Link.Normal,
          curve: window.go.Link.Bezier,
          curviness: TREE_SPOUSE_CURVINESS * TREE_SPOUSE_CURVE_DIR,
          computeCurviness: () => TREE_SPOUSE_CURVINESS * TREE_SPOUSE_CURVE_DIR,
          fromSpot: window.go.Spot.RightSide,
          toSpot: window.go.Spot.LeftSide,
          fromEndSegmentLength: 10,
          toEndSegmentLength: 10,
          layerName: "Background",
        },
        $(
          window.go.Shape,
          { strokeWidth: 2.6, stroke: "#7C3AED" },
          new window.go.Binding("strokeDashArray", "isDivorced", (value) =>
            value ? [8, 6] : null
          )
        )
      )
    );

    diagram.linkTemplateMap.add(
      "ParentChild",
      $(
        window.go.Link,
        {
          selectable: false,
          pickable: false,
          routing: window.go.Link.Orthogonal,
          corner: 0,
          fromSpot: window.go.Spot.Bottom,
          toSpot: window.go.Spot.Top,
        },
        $(window.go.Shape, { strokeWidth: 1.6, stroke: "#AEB7C7" })
      )
    );

    diagramInstanceRef.current = diagram;

    if (overviewRef.current) {
      overviewInstanceRef.current = $(window.go.Overview, overviewRef.current, {
        observed: diagram,
      });
    }

    const { nodeDataArray, linkDataArray } = buildModelData(visibleRef.current, {
      cardMode: cardView,
      resolvePhoto: normalizePhotoSource,
    });
    const model = new window.go.GraphLinksModel(nodeDataArray, linkDataArray);
    diagram.model = model;
    applyManualLayout(diagram, visibleRef.current, window.go);
    setTimeout(() => positionMarriageNodes(diagram), 0);
  }, [cardView, positionMarriageNodes]);

  useEffect(() => {
    const scriptSrc = "https://cdnjs.cloudflare.com/ajax/libs/gojs/2.3.11/go.js";
    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
    let script = null;
    let onLoad = null;

    if (!existingScript) {
      script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      onLoad = () => initDiagram();
      script.addEventListener("load", onLoad);
      document.body.appendChild(script);
    } else {
      if (window.go) {
        initDiagram();
      } else {
        script = existingScript;
        onLoad = () => initDiagram();
        script.addEventListener("load", onLoad);
      }
    }

    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      if (script && onLoad) {
        script.removeEventListener("load", onLoad);
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
    const { nodeDataArray, linkDataArray } = buildModelData(visiblePeople, {
      cardMode: cardView,
      resolvePhoto: normalizePhotoSource,
    });
    const model = new goRef.current.GraphLinksModel(nodeDataArray, linkDataArray);
    diagramInstanceRef.current.model = model;
    applyManualLayout(diagramInstanceRef.current, visiblePeople, goRef.current);
    setTimeout(() => positionMarriageNodes(diagramInstanceRef.current), 0);
  }, [cardView, visiblePeople, positionMarriageNodes]);

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
    applyManualLayout(diagram, visiblePeople, goRef.current);
    setTimeout(() => positionMarriageNodes(diagram), 0);
  }, [visiblePeople, positionMarriageNodes]);

  const zoomIn = () => {
    if (diagramInstanceRef.current) diagramInstanceRef.current.scale *= 1.2;
  };

  const zoomOut = () => {
    if (diagramInstanceRef.current) diagramInstanceRef.current.scale /= 1.2;
  };
  
  const fitToScreen = () => {
    if (diagramInstanceRef.current) diagramInstanceRef.current.zoomToFit();
  };
  

  return (
    <div className="tree-shell">
      <aside className="tree-side">
        <div className="panel card">
          <h3>Brze radnje</h3>
          <div className="action-list">
            <button onClick={onAddPerson} className="btn-primary full">
              <Plus className="w-4 h-4" />
              Dodaj novu osobu
            </button>
            <button onClick={fitToScreen} className="btn-ghost full">
              <Maximize2 className="w-4 h-4" />
              Uklopi na ekran
            </button>
            <label className="btn-ghost full">
              <Upload className="w-4 h-4" />
              Import
              <input type="file" accept=".json" onChange={onImport} className="hidden" />
            </label>
            <button onClick={onExport} className="btn-ghost full">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        <div className="panel card">
          <h3>{"Porodične grupe"}</h3>
          <div className="family-select">
            <Layers className="w-4 h-4" />
            <select
              value={activeFamilyId || ""}
              onChange={(e) => onFamilyChange(Number(e.target.value))}
            >
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
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
            <button onClick={fitToScreen} className="btn-icon">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          <div className="toolbar-meta">{visiblePeople.length} prikazano / {people.length} ukupno</div>
        </div>

        <div className="tree-filters">
          <div className="filter-item">
            <span>Fokus</span>
            <select value={focusPersonId || ""} onChange={(e) => onFocusChange(Number(e.target.value))}>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name || "Bez imena"}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <span>Oznaka</span>
            <select value={activeTagId || 0} onChange={(e) => onTagChange(Number(e.target.value))}>
              <option value={0}>Sve oznake</option>
              {(tags || []).map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
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
          <div className="filter-item">
            <span>Kartica</span>
            <div className="segmented">
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
                  {profilePerson.isPinned ? (
                    <span className="pill tree-pill-pin">Pinovan clan</span>
                  ) : (
                    <span className="pill tree-pill-muted">Nije pinovan</span>
                  )}
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
                    <p><strong>Roditelj 1:</strong> {profileParent1 ? getCleanName(profileParent1.name) : "-"}</p>
                    <p><strong>Roditelj 2:</strong> {profileParent2 ? getCleanName(profileParent2.name) : "-"}</p>
                    <p><strong>Supružnik:</strong> {profileSpouse ? getCleanName(profileSpouse.name) : "-"}</p>
                    <p><strong>Broj djece:</strong> {profileChildrenCount}</p>
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











