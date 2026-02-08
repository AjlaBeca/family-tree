import React, { useCallback, useEffect, useRef } from "react";
import {
  Plus,
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Trash2,
} from "lucide-react";
import { buildModelData } from "./tree-model";
import { applyManualLayout } from "./gojs-layout";
import {
  TREE_NODE_WIDTH,
  TREE_NODE_HEIGHT,
  TREE_SPOUSE_CURVINESS,
  TREE_SPOUSE_CURVE_DIR,
} from "./tree-constants";

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
  onEditPerson,
}) => {
  const diagramRef = useRef(null);
  const overviewRef = useRef(null);
  const diagramInstanceRef = useRef(null);
  const overviewInstanceRef = useRef(null);
  const goRef = useRef(null);
  const visibleRef = useRef(visiblePeople);
  const onEditRef = useRef(onEditPerson);

  useEffect(() => {
    visibleRef.current = visiblePeople;
  }, [visiblePeople]);

  useEffect(() => {
    onEditRef.current = onEditPerson;
  }, [onEditPerson]);

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

    diagram.links.each((link) => link.invalidateRoute());
  }, []);

  const initDiagram = useCallback(() => {
    if (!window.go || !diagramRef.current) return;

    const $ = window.go.GraphObject.make;
    goRef.current = window.go;

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
      openEditor(e.subject?.part || e.subject);
    });

    diagram.addDiagramListener("ObjectSingleClicked", (e) => {
      if (e.diagram?.lastInput?.clickCount === 2) {
        openEditor(e.subject?.part || e.subject);
      }
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
          "Rectangle",
          {
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
          "Horizontal",
          { margin: 10, alignment: window.go.Spot.Center },
          $(
            window.go.Panel,
            "Auto",
            { margin: new window.go.Margin(0, 8, 0, 0) },
            $(window.go.Shape, "Circle", {
              fill: "#111827",
              stroke: null,
              width: 34,
              height: 34,
            }),
            $(
              window.go.TextBlock,
              {
                font: "500 14px 'Space Grotesk', sans-serif",
                stroke: "#F9FAFB",
              },
              new window.go.Binding("text", "name", (name) =>
                (name || "?")
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()
              )
            )
          ),
          $(
            window.go.Panel,
            "Vertical",
            $(
              window.go.TextBlock,
              {
                font: "500 14px 'Space Grotesk', sans-serif",
                stroke: "#111827",
                margin: new window.go.Margin(2, 0, 2, 0),
                width: TREE_NODE_WIDTH - 80,
                maxLines: 1,
                overflow: window.go.TextBlock.OverflowEllipsis,
                textAlign: "left",
              },
              new window.go.Binding("text", "name")
            ),
            $(
              window.go.TextBlock,
              {
                font: "12px 'Space Grotesk', sans-serif",
                stroke: "#4B5563",
                width: TREE_NODE_WIDTH - 80,
                maxLines: 1,
                overflow: window.go.TextBlock.OverflowEllipsis,
                textAlign: "left",
              },
              new window.go.Binding("text", (data) => {
                const birth = data.birthYear || "?";
                const death = data.deathYear ? ` - ${data.deathYear}` : "";
                return `${birth}${death}`;
              })
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
      $(window.go.Shape, { strokeWidth: 2, stroke: "#94A3B8" })
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
          fromSpot: window.go.Spot.Right,
          toSpot: window.go.Spot.Left,
          fromEndSegmentLength: 0,
          toEndSegmentLength: 0,
          layerName: "Background",
        },
        $(
          window.go.Shape,
          { strokeWidth: 2, stroke: "#A855F7" },
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
        $(window.go.Shape, { strokeWidth: 2, stroke: "#94A3B8" })
      )
    );

    diagramInstanceRef.current = diagram;

    if (overviewRef.current) {
      overviewInstanceRef.current = $(window.go.Overview, overviewRef.current, {
        observed: diagram,
      });
    }

    const { nodeDataArray, linkDataArray } = buildModelData(visibleRef.current);
    const model = new window.go.GraphLinksModel(nodeDataArray, linkDataArray);
    diagram.model = model;
    applyManualLayout(diagram, visibleRef.current, window.go);
    setTimeout(() => positionMarriageNodes(diagram), 0);
  }, [positionMarriageNodes]);

  useEffect(() => {
    const scriptSrc = "https://cdnjs.cloudflare.com/ajax/libs/gojs/2.3.11/go.js";
    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      script.onload = initDiagram;
      document.body.appendChild(script);
    } else {
      initDiagram();
    }

    return () => {
      if (diagramInstanceRef.current) {
        const diagram = diagramInstanceRef.current;
        if (diagram.div && diagram.__dblclickHandler) {
          diagram.div.removeEventListener("dblclick", diagram.__dblclickHandler);
          diagram.__dblclickHandler = null;
        }
        diagram.div = null;
      }
    };
  }, [initDiagram]);

  useEffect(() => {
    if (!diagramInstanceRef.current || !goRef.current) return;
    const { nodeDataArray, linkDataArray } = buildModelData(visiblePeople);
    const model = new goRef.current.GraphLinksModel(nodeDataArray, linkDataArray);
    diagramInstanceRef.current.model = model;
    applyManualLayout(diagramInstanceRef.current, visiblePeople, goRef.current);
    setTimeout(() => positionMarriageNodes(diagramInstanceRef.current), 0);
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
          <h3>Porodicne grupe</h3>
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
              Obriši porodicu
            </button>
          </div>
          {activeFamily && (
            <p className="family-note">{activeFamily.notes || "Još nema bilješki."}</p>
          )}
        </div>

        <div className="panel card">
          <h3>Sažetak porodice</h3>
          <div className="stat-grid">
            <div>
              <p className="stat-label">Ukupno</p>
              <p className="stat-value">{stats.total}</p>
            </div>
            <div>
              <p className="stat-label">Živi</p>
              <p className="stat-value">{stats.living}</p>
            </div>
            <div>
              <p className="stat-label">Muško</p>
              <p className="stat-value">{stats.males}</p>
            </div>
            <div>
              <p className="stat-label">Žensko</p>
              <p className="stat-value">{stats.females}</p>
            </div>
          </div>
        </div>

        <div className="panel card muted">
          <p>
            Savjet: Dvaput klikni na osobu u stablu da urediš profil. Koristi minimapu
            za brzo kretanje kroz velike porodice.
          </p>
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
            <span>U fokusu</span>
            <strong>{focusPerson?.name || "Nema"}</strong>
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
                    ? "Predci"
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
            <span>Generacije</span>
            <input
              type="range"
              min="1"
              max="6"
              value={maxDepth}
              onChange={(e) => onMaxDepthChange(Number(e.target.value))}
            />
            <strong>{maxDepth}</strong>
          </div>
        </div>

        <div className="tree-grid">
          <div ref={diagramRef} className="tree-diagram" />
          <div className="tree-overview">
            <p className="overview-title">Minimapa</p>
            <div ref={overviewRef} className="overview-canvas" />
          </div>
        </div>

        {people.length === 0 && (
          <div className="empty-state">
            <h3>Još nema osoba</h3>
            <p>Dodaj prvog clana porodice da pocneš graditi ovo stablo.</p>
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
