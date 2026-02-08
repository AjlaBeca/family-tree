import React, { useMemo, useState } from "react";
import { Layers, Plus, Save, Trash2, RefreshCw } from "lucide-react";

const REL_STATUSES = [
  { id: "partner", label: "Partneri" },
  { id: "married", label: "Brak" },
  { id: "divorced", label: "Razvedeni" },
  { id: "separated", label: "Razdvojeni" },
  { id: "widowed", label: "Udovac/Udovica" },
];

const emptyDraft = {
  person1Id: 0,
  person2Id: 0,
  status: "partner",
  startDate: "",
  endDate: "",
  notes: "",
  isCurrent: 1,
};

const RelationshipsView = ({
  families,
  activeFamilyId,
  onFamilyChange,
  people,
  relationships,
  onCreateRelationship,
  onUpdateRelationship,
  onDeleteRelationship,
  onReloadRelationships,
}) => {
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(0);
  const [filterStatus, setFilterStatus] = useState("all");

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const filtered = useMemo(
    () =>
      relationships.filter((row) => {
        if (filterStatus === "all") return true;
        return row.status === filterStatus;
      }),
    [relationships, filterStatus]
  );

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(0);
  };

  const submit = async () => {
    if (!draft.person1Id || !draft.person2Id) {
      window.alert("Odaberi obje osobe.");
      return;
    }
    if (draft.person1Id === draft.person2Id) {
      window.alert("Veza mora imati dvije razlicite osobe.");
      return;
    }

    if (editingId) {
      await onUpdateRelationship(editingId, draft);
    } else {
      await onCreateRelationship(draft);
    }
    resetDraft();
  };

  return (
    <div className="panel page">
      <div className="page-header">
        <div>
          <h2>Veze kroz vrijeme</h2>
          <p className="muted-text">Evidencija partnerstava i brakova po porodici.</p>
          <p className="muted-text">
            Ovdje cuvas historiju veza (trenutne i bivse). Trenutno ovo ne mijenja crtez stabla,
            vec cuva podatke za pregled, filtere i export/import.
          </p>
        </div>
        <div className="family-select compact">
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
      </div>

      <div className="card relationship-form">
        <h3>{editingId ? "Uredi vezu" : "Nova veza"}</h3>
        <div className="relationship-grid">
          <label>
            Osoba 1
            <select
              value={draft.person1Id}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, person1Id: Number(e.target.value) }))
              }
            >
              <option value={0}>Odaberi osobu</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Osoba 2
            <select
              value={draft.person2Id}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, person2Id: Number(e.target.value) }))
              }
            >
              <option value={0}>Odaberi osobu</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={draft.status}
              onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
            >
              {REL_STATUSES.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Od datuma
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))}
            />
          </label>

          <label>
            Do datuma
            <input
              type="date"
              value={draft.endDate}
              onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))}
            />
          </label>

          <label className="inline-check relation-current" title="Ukljuceno = veza i dalje traje. Iskljuceno = zavrsena veza.">
            <input
              type="checkbox"
              checked={Boolean(draft.isCurrent)}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, isCurrent: e.target.checked ? 1 : 0 }))
              }
            />
            <span>Veza je i dalje aktivna</span>
          </label>
        </div>

        <label>
          Napomene
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
            rows={2}
          />
        </label>

        <div className="relationship-actions">
          <button type="button" className="btn-ghost" onClick={resetDraft}>
            Ocisti
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingId ? "Sačuvaj izmjene" : "Dodaj vezu"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="relationship-toolbar">
          <h3>Lista veza</h3>
          <div className="relationship-toolbar-right">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter statusa"
            >
              <option value="all">Svi statusi</option>
              {REL_STATUSES.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-ghost small" onClick={onReloadRelationships}>
              <RefreshCw className="w-4 h-4" />
              Osvjezi
            </button>
          </div>
        </div>

        <p className="muted-text">
          Primjer: za iste osobe mozes imati vise zapisa kroz vrijeme (npr. partneri pa brak pa razvod).
        </p>

        <div className="list">
          {filtered.length === 0 && <div className="empty">Nema unesenih veza.</div>}
          {filtered.map((row) => (
            <div className="list-item relationship-item" key={row.id}>
              <div>
                <h4>
                  {peopleById.get(row.person1Id)?.name || `#${row.person1Id}`} -{" "}
                  {peopleById.get(row.person2Id)?.name || `#${row.person2Id}`}
                </h4>
                <p>
                  Status: {row.status} | {row.startDate || "?"} - {row.endDate || "danas"}
                </p>
                {row.notes ? <p>{row.notes}</p> : null}
              </div>
              <div className="relationship-item-actions">
                <button
                  type="button"
                  className="btn-ghost small"
                  onClick={() => {
                    setEditingId(row.id);
                    setDraft({
                      person1Id: row.person1Id,
                      person2Id: row.person2Id,
                      status: row.status,
                      startDate: row.startDate || "",
                      endDate: row.endDate || "",
                      notes: row.notes || "",
                      isCurrent: row.isCurrent ? 1 : 0,
                    });
                  }}
                >
                  Uredi
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => onDeleteRelationship(row.id)}
                >
                  <Trash2 className="w-4 h-4" />
                  Obrisi
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RelationshipsView;
