import React, { useEffect, useState } from "react";
import { Save, Trash2, Plus, Pencil, Upload } from "lucide-react";

const PersonModal = ({
  isOpen,
  person,
  people,
  tags,
  selectedTagIds,
  personHealth,
  onCreateTag,
  editMode,
  onClose,
  onSave,
  onDelete,
  onChange,
}) => {
  const [tagSelections, setTagSelections] = useState([]);
  const [tagDraft, setTagDraft] = useState("");
  const [healthDraft, setHealthDraft] = useState({
    hereditaryConditions: "",
    riskFactors: "",
    notes: "",
  });
  const [formError, setFormError] = useState("");
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [photoSource, setPhotoSource] = useState("");
  const [photoFrame, setPhotoFrame] = useState({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => {
    setTagSelections(selectedTagIds || []);
  }, [selectedTagIds]);

  useEffect(() => {
    setHealthDraft({
      hereditaryConditions: personHealth?.hereditaryConditions || "",
      riskFactors: personHealth?.riskFactors || "",
      notes: personHealth?.notes || "",
    });
  }, [personHealth, person?.id]);

  useEffect(() => {
    setFormError("");
  }, [isOpen, person?.id]);

  useEffect(() => {
    setPhotoEditorOpen(false);
    setPhotoSource(String(person?.photo || ""));
    setPhotoFrame({ zoom: 1, offsetX: 0, offsetY: 0 });
  }, [person?.id, person?.photo]);

  if (!isOpen || !person) return null;

  const update = (changes) => {
    onChange({ ...person, ...changes });
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const resizeImage = async (file, maxSize = 900) => {
    const dataUrl = await readFileAsDataUrl(file);
    if (typeof dataUrl !== "string") return "";

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const width = img.width || 1;
        const height = img.height || 1;
        const scale = Math.min(maxSize / width, maxSize / height, 1);
        if (scale === 1) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const buildCircularPhoto = async (src, frame = { zoom: 1, offsetX: 0, offsetY: 0 }) => {
    const source = String(src || "").trim();
    if (!source) return "";
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const size = 900;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(source);
          return;
        }

        const zoom = Math.max(1, Math.min(3, Number(frame.zoom || 1)));
        const scale = Math.max(size / img.width, size / img.height) * zoom;
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const moveLimit = size * 0.35;
        const drawX =
          (size - drawW) / 2 + (Math.max(-100, Math.min(100, Number(frame.offsetX || 0))) / 100) * moveLimit;
        const drawY =
          (size - drawH) / 2 + (Math.max(-100, Math.min(100, Number(frame.offsetY || 0))) / 100) * moveLimit;

        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();

        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(source);
      img.src = source;
    });
  };

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    try {
      const resized = await resizeImage(file);
      const src = resized || "";
      setPhotoSource(src);
      setPhotoFrame({ zoom: 1, offsetX: 0, offsetY: 0 });
      const rounded = await buildCircularPhoto(src, { zoom: 1, offsetX: 0, offsetY: 0 });
      update({ photo: rounded || resized || "" });
      setPhotoEditorOpen(true);
    } catch {
      const raw = await readFileAsDataUrl(file);
      const rawSource = typeof raw === "string" ? raw : "";
      setPhotoSource(rawSource);
      setPhotoFrame({ zoom: 1, offsetX: 0, offsetY: 0 });
      const rounded = await buildCircularPhoto(rawSource, { zoom: 1, offsetX: 0, offsetY: 0 });
      update({ photo: rounded || rawSource });
      setPhotoEditorOpen(true);
    }
  };

  const handleFrameChange = async (nextFrame) => {
    setPhotoFrame(nextFrame);
    if (!photoSource) return;
    const rounded = await buildCircularPhoto(photoSource, nextFrame);
    if (rounded) update({ photo: rounded });
  };

  const isDescendantParentChoice = (candidateParentId) => {
    const personId = Number(person.id || 0);
    const parentId = Number(candidateParentId || 0);
    if (!personId || !parentId) return false;

    const childrenByParent = new Map();
    people.forEach((p) => {
      const isEditingPerson = Number(p.id) === personId;
      const parent1 = isEditingPerson ? Number(person.parent || 0) : Number(p.parent || 0);
      const parent2 = isEditingPerson ? Number(person.parent2 || 0) : Number(p.parent2 || 0);
      [parent1, parent2].forEach((parentValue) => {
        if (!parentValue) return;
        const children = childrenByParent.get(parentValue) || [];
        children.push(Number(p.id));
        childrenByParent.set(parentValue, children);
      });
    });

    const queue = [personId];
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === parentId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      (childrenByParent.get(current) || []).forEach((childId) => {
        if (!visited.has(childId)) queue.push(childId);
      });
    }
    return false;
  };

  const validateBeforeSave = () => {
    const personId = Number(person.id || 0);
    const parent = Number(person.parent || 0);
    const parent2 = Number(person.parent2 || 0);
    const spouse = Number(person.spouse || 0);

    if (!(person.name || "").trim()) return "Ime je obavezno.";
    if (personId && parent === personId) return "Roditelj 1 ne može biti ista osoba.";
    if (personId && parent2 === personId) return "Roditelj 2 ne može biti ista osoba.";
    if (parent && parent2 && parent === parent2) {
      return "Roditelj 1 i Roditelj 2 moraju biti različite osobe.";
    }
    if (personId && spouse === personId) return "Supružnik ne može biti ista osoba.";
    if (isDescendantParentChoice(parent)) {
      return "Neispravna veza: Roditelj 1 je potomak ove osobe (ciklus).";
    }
    if (isDescendantParentChoice(parent2)) {
      return "Neispravna veza: Roditelj 2 je potomak ove osobe (ciklus).";
    }
    return "";
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2>{editMode ? "Uredi osobu" : "Dodaj novu osobu"}</h2>
          <button onClick={onClose} className="btn-icon">
            X
          </button>
        </div>

        <div className="modal-body">
          {formError && <div className="form-alert">{formError}</div>}

          <div className="modal-row">
            <label>
              Ime
              <input
                type="text"
                value={person.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>

            <label>
              Spol
              <select
                value={person.gender}
                onChange={(e) => update({ gender: e.target.value })}
              >
                <option value="M">Muško</option>
                <option value="F">Žensko</option>
              </select>
            </label>
          </div>

          <div className="modal-row">
            <label>
              Godina rođenja
              <input
                type="text"
                value={person.birthYear}
                onChange={(e) => update({ birthYear: e.target.value })}
              />
            </label>

            <label>
              Godina smrti (opciono)
              <input
                type="text"
                value={person.deathYear}
                onChange={(e) => update({ deathYear: e.target.value })}
              />
            </label>
          </div>

          <div className="modal-row">
            <label>
              Roditelj 1
              <select
                value={person.parent}
                onChange={(e) => update({ parent: parseInt(e.target.value, 10) })}
              >
                <option value={0}>Nema</option>
                {people
                  .filter((p) => p.id !== person.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Roditelj 2
              <select
                value={person.parent2 || 0}
                onChange={(e) => update({ parent2: parseInt(e.target.value, 10) })}
              >
                <option value={0}>Nema</option>
                {people
                  .filter((p) => p.id !== person.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="modal-row">
            <label>
              Supružnik
              <select
                value={person.spouse || 0}
                onChange={(e) => {
                  const spouseId = parseInt(e.target.value, 10);
                  update({
                    spouse: spouseId,
                    divorced: spouseId ? person.divorced || 0 : 0,
                  });
                }}
              >
                <option value={0}>Nema</option>
                {people
                  .filter((p) => p.id !== person.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <div className="inline-check">
                <input
                  type="checkbox"
                  checked={Boolean(person.divorced)}
                  disabled={!person.spouse}
                  onChange={(e) => update({ divorced: e.target.checked ? 1 : 0 })}
                />
                <span>Razvedeni</span>
              </div>
            </label>

            <label>
              Biografija (opciono)
              <textarea
                value={person.bio}
                onChange={(e) => update({ bio: e.target.value })}
                rows={2}
              />
            </label>
          </div>

          <div className="modal-section">
            <div className="section-header">
              <h4>Pin i zdravlje</h4>
            </div>

            <div className="modal-row">
              <label>
                <div className="inline-check">
                  <input
                    type="checkbox"
                    checked={Boolean(person.isPinned)}
                    onChange={(e) => update({ isPinned: e.target.checked ? 1 : 0 })}
                  />
                  <span>Označi kao ključnog člana (pin)</span>
                </div>
              </label>

              <label>
                Boja pina
                <input
                  type="color"
                  value={person.pinColor || "#f59e0b"}
                  onChange={(e) => update({ pinColor: e.target.value })}
                  disabled={!person.isPinned}
                />
              </label>
            </div>

            <div className="modal-row">
              <label>
                Nasljedne bolesti
                <textarea
                  value={healthDraft.hereditaryConditions}
                  onChange={(e) =>
                    setHealthDraft((prev) => ({
                      ...prev,
                      hereditaryConditions: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </label>

              <label>
                Rizični faktori
                <textarea
                  value={healthDraft.riskFactors}
                  onChange={(e) =>
                    setHealthDraft((prev) => ({
                      ...prev,
                      riskFactors: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </label>
            </div>

            <label>
              Zdravstvene napomene
              <textarea
                value={healthDraft.notes}
                onChange={(e) =>
                  setHealthDraft((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                rows={2}
              />
            </label>
          </div>

          <div className="modal-section">
            <div className="section-header">
              <h4>Oznake</h4>
            </div>
            <div className="tag-input">
              <input
                type="text"
                placeholder="Nova oznaka"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost small"
                onClick={async () => {
                  const name = tagDraft.trim();
                  if (!name || !onCreateTag) return;
                  const tag = await onCreateTag(name);
                  if (tag?.id) {
                    setTagSelections((prev) =>
                      prev.includes(tag.id) ? prev : [...prev, tag.id]
                    );
                  }
                  setTagDraft("");
                }}
              >
                <Plus className="w-4 h-4" />
                Dodaj
              </button>
            </div>
            <div className="tag-list">
              {(tags || []).length === 0 && (
                <p className="muted-text">Nema oznaka.</p>
              )}
              {(tags || []).map((tag) => (
                <label key={tag.id} className="tag-item">
                  <input
                    type="checkbox"
                    checked={tagSelections.includes(tag.id)}
                    onChange={() =>
                      setTagSelections((prev) =>
                        prev.includes(tag.id)
                          ? prev.filter((id) => id !== tag.id)
                          : [...prev, tag.id]
                      )
                    }
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="modal-row modal-row-single">
            <label>
              Dodaj fotografiju (opciono)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e.target.files && e.target.files[0])}
              />
            </label>
          </div>

          {person.photo && (
            <div className="photo-preview">
              <div className="photo-frame-shell">
                <div className="photo-frame-preview">
                  <img src={person.photo} alt={person.name || "Pregled"} />
                </div>
                <button
                  type="button"
                  className="btn-icon photo-edit-overlay"
                  onClick={() => setPhotoEditorOpen((open) => !open)}
                  title="Uredi fotografiju"
                  aria-label="Uredi fotografiju"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>

              {photoEditorOpen && (
                <div className="photo-editor-popover">
                  <label className="photo-upload-inline">
                    <Upload className="w-4 h-4" />
                    Zamijeni fotografiju
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e.target.files && e.target.files[0])}
                    />
                  </label>

                  <label>
                    Zoom
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.01"
                      value={photoFrame.zoom}
                      onChange={(e) =>
                        handleFrameChange({
                          ...photoFrame,
                          zoom: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Pomak X
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={photoFrame.offsetX}
                      onChange={(e) =>
                        handleFrameChange({
                          ...photoFrame,
                          offsetX: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Pomak Y
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={photoFrame.offsetY}
                      onChange={(e) =>
                        handleFrameChange({
                          ...photoFrame,
                          offsetY: Number(e.target.value),
                        })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="btn-danger small"
                    onClick={() => {
                      setPhotoEditorOpen(false);
                      setPhotoSource("");
                      setPhotoFrame({ zoom: 1, offsetX: 0, offsetY: 0 });
                      update({ photo: "" });
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Ukloni fotografiju
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {editMode ? (
            <button onClick={onDelete} className="btn-danger">
              <Trash2 className="w-4 h-4" />
              Obriši
            </button>
          ) : (
            <div />
          )}
          <div className="modal-actions">
            <button onClick={onClose} className="btn-ghost">
              Odustani
            </button>
            <button
              onClick={async () => {
                const validationError = validateBeforeSave();
                if (validationError) {
                  setFormError(validationError);
                  window.alert(validationError);
                  return;
                }
                const preparedPhoto = person.photo
                  ? await buildCircularPhoto(photoSource || person.photo, photoFrame)
                  : "";
                onSave({
                  person: { ...person, photo: preparedPhoto || person.photo || "" },
                  tagIds: tagSelections,
                  health: healthDraft,
                });
              }}
              className="btn-primary"
            >
              <Save className="w-4 h-4" />
              Sačuvaj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonModal;



