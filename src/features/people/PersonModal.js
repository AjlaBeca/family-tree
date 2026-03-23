import React, { useEffect, useRef, useState } from "react";
import { Save, Trash2, Plus, Pencil, Upload, ChevronDown } from "lucide-react";

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
  const [tagDraftError, setTagDraftError] = useState("");
  const [healthDraft, setHealthDraft] = useState({
    hereditaryConditions: "",
    riskFactors: "",
    notes: "",
  });
  const [formError, setFormError] = useState("");
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [photoSource, setPhotoSource] = useState("");
  const [photoFileName, setPhotoFileName] = useState("");
  const [photoFrame, setPhotoFrame] = useState({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [openDropdown, setOpenDropdown] = useState("");
  const prevPersonIdRef = useRef(null);
  const prevOpenRef = useRef(false);
  const dropdownRootRef = useRef(null);

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
    setTagDraftError("");
  }, [isOpen, person?.id]);

  useEffect(() => {
    const currentPersonId = person?.id || null;
    const personChanged = prevPersonIdRef.current !== currentPersonId;
    const openedNow = Boolean(isOpen) && !prevOpenRef.current;

    if (personChanged || openedNow) {
      setPhotoEditorOpen(false);
      setPhotoSource(String(person?.photo || ""));
      setPhotoFileName("");
      setPhotoFrame({ zoom: 1, offsetX: 0, offsetY: 0 });
    }

    prevPersonIdRef.current = currentPersonId;
    prevOpenRef.current = Boolean(isOpen);
  }, [isOpen, person?.id, person?.photo]);

  useEffect(() => {
    const onDocumentPointerDown = (event) => {
      if (!dropdownRootRef.current?.contains(event.target)) {
        setOpenDropdown("");
      }
    };
    const onDocumentKeyDown = (event) => {
      if (event.key === "Escape") setOpenDropdown("");
    };
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, []);

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
    if (personId && parent === personId) return "Otac ne može biti ista osoba.";
    if (personId && parent2 === personId) return "Majka ne može biti ista osoba.";
    if (parent && parent2 && parent === parent2) {
      return "Otac i majka moraju biti različite osobe.";
    }
    if (personId && spouse === personId) return "Supružnik ne može biti ista osoba.";
    if (isDescendantParentChoice(parent)) {
      return "Neispravna veza: Otac je potomak ove osobe (ciklus).";
    }
    if (isDescendantParentChoice(parent2)) {
      return "Neispravna veza: Majka je potomak ove osobe (ciklus).";
    }
    return "";
  };

  const renderPersonDropdown = ({ keyName, value, options, onSelect, ariaLabel }) => {
    const selected = options.find((option) => String(option.value) === String(value));
    const label = selected?.label || options[0]?.label || "";
    return (
      <div className="person-dropdown">
        <button
          type="button"
          className="person-dropdown-trigger"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={openDropdown === keyName}
          onClick={() => setOpenDropdown((prev) => (prev === keyName ? "" : keyName))}
        >
          <span>{label}</span>
          <ChevronDown className={`person-dropdown-chevron ${openDropdown === keyName ? "is-open" : ""}`} />
        </button>
        {openDropdown === keyName && (
          <div className="person-dropdown-menu" role="listbox" aria-label={`${ariaLabel} opcije`}>
            {options.map((option) => (
              <button
                key={`${keyName}-${option.value}`}
                type="button"
                role="option"
                aria-selected={String(option.value) === String(value)}
                className={`person-dropdown-option ${
                  String(option.value) === String(value) ? "is-selected" : ""
                }`}
                onClick={() => {
                  onSelect(option.value);
                  setOpenDropdown("");
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modal-backdrop">
      <div className="modal person-modal" ref={dropdownRootRef}>
        <div className="modal-header">
          <h2>{editMode ? "Uredi osobu" : "Dodaj novu osobu"}</h2>
          <button onClick={onClose} className="btn-icon">
            X
          </button>
        </div>

        <div className="modal-body">
          {formError && <div className="form-alert">{formError}</div>}

          <div className="modal-row person-core-row">
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
              {renderPersonDropdown({
                keyName: "gender",
                value: String(person.gender || "M"),
                options: [
                  { value: "M", label: "Muško" },
                  { value: "F", label: "Žensko" },
                ],
                onSelect: (nextGender) => update({ gender: String(nextGender) }),
                ariaLabel: "Spol",
              })}
            </label>
            <label>
              Godina rođenja
              <input
                type="text"
                value={person.birthYear}
                onChange={(e) => update({ birthYear: e.target.value })}
              />
            </label>
          </div>

          <div className="modal-row person-core-row">
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
              Zanimanje (opciono)
              <input
                type="text"
                value={person.occupation || ""}
                onChange={(e) => update({ occupation: e.target.value })}
              />
            </label>

            <label>
              Mjesto rođenja (opciono)
              <input
                type="text"
                value={person.birthPlace || ""}
                onChange={(e) => update({ birthPlace: e.target.value })}
              />
            </label>
          </div>

          <div className="modal-row person-core-row">
            <label>
              Mjesto ukopa (opciono)
              <input
                type="text"
                value={person.burialPlace || ""}
                onChange={(e) => update({ burialPlace: e.target.value })}
              />
            </label>
            <label>
              Otac
              {renderPersonDropdown({
                keyName: "parent1",
                value: String(person.parent || 0),
                options: [
                  { value: "0", label: "Nema" },
                  ...people
                    .filter((p) => p.id !== person.id)
                    .map((p) => ({ value: String(p.id), label: p.name })),
                ],
                onSelect: (nextParent) => update({ parent: parseInt(nextParent, 10) }),
                ariaLabel: "Otac",
              })}
            </label>

            <label>
              Majka
              {renderPersonDropdown({
                keyName: "parent2",
                value: String(person.parent2 || 0),
                options: [
                  { value: "0", label: "Nema" },
                  ...people
                    .filter((p) => p.id !== person.id)
                    .map((p) => ({ value: String(p.id), label: p.name })),
                ],
                onSelect: (nextParent2) => update({ parent2: parseInt(nextParent2, 10) }),
                ariaLabel: "Majka",
              })}
            </label>
          </div>

          <div className="modal-row person-core-row">
            <label className="person-spouse-field">
              Supružnik
              {renderPersonDropdown({
                keyName: "spouse",
                value: String(person.spouse || 0),
                options: [
                  { value: "0", label: "Nema" },
                  ...people
                    .filter((p) => p.id !== person.id)
                    .map((p) => ({ value: String(p.id), label: p.name })),
                ],
                onSelect: (nextSpouse) => {
                  const spouseId = parseInt(nextSpouse, 10);
                  update({
                    spouse: spouseId,
                    divorced: spouseId ? person.divorced || 0 : 0,
                  });
                },
                ariaLabel: "Supružnik",
              })}
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

            <label className="person-bio-field">
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
                onChange={(e) => {
                  setTagDraft(e.target.value);
                  if (tagDraftError) setTagDraftError("");
                }}
              />
              <button
                type="button"
                className="btn-ghost small"
                onClick={async () => {
                  const name = tagDraft.trim();
                  if (!name) {
                    setTagDraftError("Unesi naziv oznake prije dodavanja.");
                    return;
                  }
                  if (!onCreateTag) {
                    setTagDraftError("Dodavanje oznaka trenutno nije dostupno.");
                    return;
                  }
                  const tag = await onCreateTag(name);
                  if (tag?.id) {
                    setTagSelections((prev) =>
                      prev.includes(tag.id) ? prev : [...prev, tag.id]
                    );
                  }
                  setTagDraft("");
                  setTagDraftError("");
                }}
              >
                <Plus className="w-4 h-4" />
                Dodaj
              </button>
            </div>
            {tagDraftError && <p className="tag-input-error">{tagDraftError}</p>}
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
              <div className="photo-picker-row">
                <label className="file-picker">
                  <span className="file-picker-btn">Odaberi fotografiju</span>
                  <span className="file-picker-name">
                    {photoFileName || "Nijedna fotografija nije odabrana"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      setPhotoFileName(file?.name || "");
                      handlePhotoUpload(file);
                    }}
                  />
                </label>
                {Boolean(person.photo) && (
                  <button
                    type="button"
                    className="btn-danger small photo-remove-btn"
                    onClick={() => {
                      setPhotoEditorOpen(false);
                      setPhotoSource("");
                      setPhotoFileName("");
                      setPhotoFrame({ zoom: 1, offsetX: 0, offsetY: 0 });
                      update({ photo: "" });
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Obrisi profilnu
                  </button>
                )}
              </div>
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



