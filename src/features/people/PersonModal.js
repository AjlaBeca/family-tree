import React from "react";
import { Save, Trash2 } from "lucide-react";

const PersonModal = ({
  isOpen,
  person,
  people,
  editMode,
  onClose,
  onSave,
  onDelete,
  onChange,
}) => {
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

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    try {
      const resized = await resizeImage(file);
      update({ photo: resized || "" });
    } catch {
      const raw = await readFileAsDataUrl(file);
      update({ photo: typeof raw === "string" ? raw : "" });
    }
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

          <div className="modal-row">
            <label>
              URL fotografije (opciono)
              <input
                type="text"
                value={person.photo}
                onChange={(e) => update({ photo: e.target.value })}
              />
            </label>

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
              <img src={person.photo} alt={person.name || "Pregled"} />
              <button
                type="button"
                className="btn-ghost small"
                onClick={() => update({ photo: "" })}
              >
                Ukloni fotografiju
              </button>
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
            <button onClick={onSave} className="btn-primary">
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
