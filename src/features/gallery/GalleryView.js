import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Plus, Trash2, X, Download, ArrowLeft } from "lucide-react";
import { api, getApiErrorMessage } from "../../services/api";

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const createPhoto = (src) => ({
  id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  src,
  tags: [],
  createdAt: Date.now(),
});

const isPersistedPhotoId = (photoId) => {
  const parsed = Number(photoId);
  return Number.isInteger(parsed) && parsed > 0;
};

const isValidImageSource = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  const lowered = text.toLowerCase();
  return lowered !== "null" && lowered !== "undefined";
};

const normalizeGalleryRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const src = String(row?.src || "").trim();
      if (!isValidImageSource(src)) return null;
      const rawTags = Array.isArray(row?.tags) ? row.tags : [];
      const tags = rawTags
        .map((tag) => {
          const personId = Number(tag?.personId || 0);
          const x = Number(tag?.x);
          const y = Number(tag?.y);
          if (!personId) return null;
          return {
            id: tag?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            personId,
            x: Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 50,
            y: Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : 50,
          };
        })
        .filter(Boolean);

      return {
        id: row?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        familyId: row?.familyId || 0,
        src,
        createdAt: row?.createdAt || Date.now(),
        tags,
      };
    })
    .filter(Boolean);
};

const GalleryView = ({
  people,
  pinnedOnly,
  onPinnedOnlyChange,
  families,
  activeFamilyId,
  onFamilyChange,
  onOpenPersonDetails,
  onRequestConfirm,
}) => {
  const [album, setAlbum] = useState([]);
  const [viewMode, setViewMode] = useState("grid");
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [pendingPoint, setPendingPoint] = useState(null);
  const [draggingTagId, setDraggingTagId] = useState(null);
  const [dirtyPhotoIds, setDirtyPhotoIds] = useState([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const dragMovedRef = useRef(false);

  const loadGalleryRows = async (familyId) => {
    try {
      const rows = await api(`/api/gallery/photos?familyId=${familyId}`);
      return normalizeGalleryRows(rows);
    } catch (primaryErr) {
      try {
        const rows = await api(`/api/families/${familyId}/gallery`);
        return normalizeGalleryRows(rows);
      } catch {
        throw primaryErr;
      }
    }
  };

  

  useEffect(() => {
    let isCancelled = false;
    const loadGallery = async () => {
      setIsGalleryLoading(true);
      setSaveError("");
      try {
        if (!activeFamilyId) {
          if (!isCancelled) setAlbum([]);
          return;
        }
        const rows = await loadGalleryRows(activeFamilyId);
        if (!isCancelled) setAlbum(rows);
      } catch (err) {
        if (!isCancelled) {
          setAlbum([]);
          setSaveError(getApiErrorMessage(err, "Ne mogu učitati galeriju."));
        }
      } finally {
        if (!isCancelled) setIsGalleryLoading(false);
      }
    };
    loadGallery();

    return () => {
      isCancelled = true;
    };
  }, [activeFamilyId]);
  useEffect(() => {
    if (!activeFamilyId) {
      setAlbum([]);
    }
    setViewMode("grid");
    setSelectedPhotoId("");
    setPeopleSearch("");
    setTagSearch("");
    setPendingPoint(null);
    setDraggingTagId(null);
    setDirtyPhotoIds([]);
    setDeletedPhotoIds([]);
    setSaveMessage("");
  }, [activeFamilyId]);

  const peopleList = useMemo(() => {
    const list = Array.isArray(people) ? people : [];
    return pinnedOnly ? list.filter((p) => p.isPinned) : list;
  }, [people, pinnedOnly]);

  const personById = useMemo(() => new Map(peopleList.map((p) => [p.id, p])), [peopleList]);

  useEffect(() => {
    if (album.length === 0) {
      setSelectedPhotoId("");
      return;
    }
    if (!selectedPhotoId || !album.some((p) => p.id === selectedPhotoId)) {
      setSelectedPhotoId(album[0].id);
    }
  }, [album, selectedPhotoId]);

  const selectedPhoto = useMemo(
    () => album.find((photo) => photo.id === selectedPhotoId) || null,
    [album, selectedPhotoId]
  );

  const markPhotoDirty = (photoId) => {
    if (!photoId) return;
    setSaveMessage("");
    setSaveError("");
    setDirtyPhotoIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]));
  };

  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    if (!q) return peopleList;
    return peopleList.filter((p) => String(p.name || "").toLowerCase().includes(q));
  }, [peopleList, peopleSearch]);

  const taggablePeople = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (!q) return peopleList;
    return peopleList.filter((p) => String(p.name || "").toLowerCase().includes(q));
  }, [peopleList, tagSearch]);

  const openPhotoEditor = (photoId) => {
    if (!photoId) return;
    setSelectedPhotoId(photoId);
    setViewMode("editor");
    setPendingPoint(null);
    setDraggingTagId(null);
    setTagSearch("");
    setSaveMessage("");
    setSaveError("");
  };

  const backToGrid = () => {
    setViewMode("grid");
    setPendingPoint(null);
    setDraggingTagId(null);
    setTagSearch("");
  };

  const handleUpload = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;

    const next = [];
    for (const file of list) {
      try {
        const src = await readFileAsDataUrl(file);
        if (src) next.push(createPhoto(src));
      } catch {
        // ignore failed file
      }
    }

    if (!next.length) return;

    setAlbum((prev) => [...next, ...prev]);
    setSelectedPhotoId(next[0].id);
    setViewMode("editor");
    setPendingPoint(null);
    setTagSearch("");
    setSaveMessage("");
    setSaveError("");
    setDirtyPhotoIds((prev) => {
      const merged = new Set(prev);
      next.forEach((photo) => merged.add(photo.id));
      return Array.from(merged);
    });
  };

  const removeSelectedPhoto = async () => {
    if (!selectedPhoto) return;
    if (typeof onRequestConfirm === "function") {
      const ok = await onRequestConfirm({
        title: "Obriši sliku",
        message: "Obrisati izabranu sliku iz galerije?",
        confirmLabel: "Obriši",
        isDanger: true,
      });
      if (!ok) return;
    }
    setSaveMessage("");
    setSaveError("");

    if (isPersistedPhotoId(selectedPhoto.id) && activeFamilyId) {
      try {
        await api(`/api/gallery/photos/${Number(selectedPhoto.id)}?familyId=${activeFamilyId}`, {
          method: "DELETE",
        });
      } catch (err) {
        setSaveError(getApiErrorMessage(err, "Ne mogu obrisati sliku."));
        return;
      }
    }

    setAlbum((prev) => {
      const next = prev.filter((photo) => photo.id !== selectedPhoto.id);
      setSelectedPhotoId(next[0]?.id || "");
      setViewMode("grid");
      return next;
    });

    setDeletedPhotoIds((prev) => prev.filter((id) => id !== Number(selectedPhoto.id)));
    setDirtyPhotoIds((prev) => prev.filter((id) => id !== selectedPhoto.id));
    setPendingPoint(null);
    setDraggingTagId(null);
    setTagSearch("");
  };

  const addTagAtPendingPoint = (personId) => {
    if (!selectedPhoto || !pendingPoint || !personId) return;
    setAlbum((prev) =>
      prev.map((photo) => {
        if (photo.id !== selectedPhoto.id) return photo;
        const nextTag = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          personId,
          x: pendingPoint.x,
          y: pendingPoint.y,
        };
        return { ...photo, tags: [...(photo.tags || []), nextTag] };
      })
    );
    markPhotoDirty(selectedPhoto.id);
    setPendingPoint(null);
    setTagSearch("");
  };

  const removeTag = (tagId) => {
    if (!selectedPhoto || !tagId) return;
    setAlbum((prev) =>
      prev.map((photo) =>
        photo.id === selectedPhoto.id
          ? { ...photo, tags: (photo.tags || []).filter((tag) => tag.id !== tagId) }
          : photo
      )
    );
    markPhotoDirty(selectedPhoto.id);
  };

  const updateTagPosition = (tagId, x, y) => {
    if (!selectedPhoto || !tagId) return;
    setAlbum((prev) =>
      prev.map((photo) =>
        photo.id === selectedPhoto.id
          ? {
              ...photo,
              tags: (photo.tags || []).map((tag) =>
                tag.id === tagId
                  ? {
                      ...tag,
                      x: Math.max(0, Math.min(100, x)),
                      y: Math.max(0, Math.min(100, y)),
                    }
                  : tag
              ),
            }
          : photo
      )
    );
    markPhotoDirty(selectedPhoto.id);
  };

  const handleTagMouseDown = (e, tagId) => {
    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;
    setPendingPoint(null);
    setDraggingTagId(tagId);
  };

  const handleStageMouseMove = (e) => {
    if (!selectedPhoto || !draggingTagId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    dragMovedRef.current = true;
    updateTagPosition(draggingTagId, x, y);
  };

  const handleStageMouseUp = () => {
    if (draggingTagId) {
      setDraggingTagId(null);
      setTimeout(() => {
        dragMovedRef.current = false;
      }, 0);
    }
  };

  const handleImageClick = (e) => {
    if (!selectedPhoto) return;
    if (dragMovedRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPoint({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  };

  const saveGallery = async () => {
    if (!activeFamilyId) return;

    if (dirtyPhotoIds.length === 0 && deletedPhotoIds.length === 0) {
      setViewMode("grid");
      return;
    }

    try {
      const toDelete = Array.from(new Set(deletedPhotoIds)).filter((id) => isPersistedPhotoId(id));
      for (const photoId of toDelete) {
        await api(`/api/gallery/photos/${photoId}?familyId=${activeFamilyId}`, {
          method: "DELETE",
        });
      }

      const dirtySet = new Set(dirtyPhotoIds);
      const photosToSave = album.filter(
        (photo) => dirtySet.has(photo.id) && isValidImageSource(photo?.src)
      );
      const failedPhotoIds = [];
      let firstSaveError = "";

      for (const photo of photosToSave) {
        const payload = {
          src: String(photo.src || "").trim(),
          tags: Array.isArray(photo.tags)
            ? photo.tags.map((tag) => ({
                personId: Number(tag?.personId || 0),
                x: Number(tag?.x || 50),
                y: Number(tag?.y || 50),
              }))
            : [],
        };

        if (isPersistedPhotoId(photo.id)) {
          payload.id = Number(photo.id);
        }

        try {
          const savedPhotoRaw = await api("/api/gallery/photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              familyId: activeFamilyId,
              photo: payload,
            }),
          });
          const savedPhoto = normalizeGalleryRows([savedPhotoRaw])[0];
          if (!savedPhoto) {
            failedPhotoIds.push(photo.id);
          }
        } catch (err) {
          if (!firstSaveError) {
            firstSaveError = getApiErrorMessage(err, "Ne mogu sačuvati galeriju.");
          }
          failedPhotoIds.push(photo.id);
        }
      }

      const freshAlbum = await loadGalleryRows(activeFamilyId);
      setAlbum(freshAlbum);
      setDeletedPhotoIds([]);

      if (failedPhotoIds.length > 0) {
        setDirtyPhotoIds(failedPhotoIds);
        setSaveMessage("");
        setSaveError(
          failedPhotoIds.length === photosToSave.length
            ? firstSaveError || "Ne mogu sačuvati galeriju."
            : firstSaveError
              ? `Dio galerije je sačuvan, ali neke slike nisu. ${firstSaveError}`
              : "Dio galerije je sačuvan, ali neke slike nisu."
        );
        return;
      }

      setDirtyPhotoIds([]);
      setSaveError("");
      setSaveMessage("Galerija je sačuvana.");
      setViewMode("grid");
      setPendingPoint(null);
      setDraggingTagId(null);
      setTagSearch("");
    } catch (err) {
      setSaveError(getApiErrorMessage(err, "Ne mogu sačuvati galeriju."));
    }
  };

  return (
    <div className="panel page gallery-instagram-page">
      <div className="page-header">
        <div>
          <h2>Porodična galerija</h2>
          <p className="muted-text">
            Galerijske slike su odvojene od profilnih fotografija. Klikni sliku da dodas tag osobe.
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
        <label className="inline-check">
          <input
            type="checkbox"
            checked={Boolean(pinnedOnly)}
            onChange={(e) => onPinnedOnlyChange(e.target.checked)}
          />
          <span>Samo pinovani</span>
        </label>
      </div>

      <div className="card gallery-top-actions">
        <div className="gallery-top-actions-left">
          {saveMessage && <span className="muted-text">{saveMessage}</span>}
          {saveError && (
            <span className="muted-text" style={{ color: "#b91c1c" }}>
              {saveError}
            </span>
          )}
        </div>

        <div className="gallery-top-actions-right">
          <label className="btn-icon" title="Dodaj slike" aria-label="Dodaj slike">
            <Plus className="w-4 h-4" />
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>

          {viewMode === "editor" && (
            <>
              <button
                type="button"
                className="btn-icon"
                onClick={() => { void removeSelectedPhoto(); }}
                disabled={!selectedPhoto}
                title="Obriši izabranu sliku"
                aria-label="Obriši izabranu sliku"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                className="btn-icon"
                onClick={saveGallery}
                disabled={!selectedPhoto || (dirtyPhotoIds.length === 0 && deletedPhotoIds.length === 0)}
                title="Sačuvaj u galeriju"
                aria-label="Sačuvaj u galeriju"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                className="btn-icon"
                onClick={backToGrid}
                title="Nazad na galeriju"
                aria-label="Nazad na galeriju"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {isGalleryLoading && <div className="loading">Učitavanje galerije...</div>}

      {viewMode === "grid" ? (
        <div className="gallery-grid-screen">
          {album.length === 0 ? (
            <div className="empty gallery-empty-upload">
              <p>Galerija je prazna. Dodaj slike da započneš.</p>
            </div>
          ) : (
            <div className="gallery-fixed-grid">
              {album.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className="gallery-fixed-tile"
                  onClick={() => openPhotoEditor(photo.id)}
                  title="Otvori i taguj"
                >
                  <img src={photo.src} alt="Galerijska fotografija" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="gallery-instagram-layout">
          <aside className="gallery-people-sidebar">
            <h3>Osobe</h3>
            <input
              type="text"
              placeholder="Pretraži osobu"
              value={peopleSearch}
              onChange={(e) => setPeopleSearch(e.target.value)}
            />
            <div className="gallery-people-list">
              {filteredPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="gallery-person-btn"
                  onClick={() => onOpenPersonDetails && onOpenPersonDetails(person)}
                >
                  <span>{person.name || "Bez imena"}</span>
                  <small>
                    {person.birthYear || "?"}
                    {person.deathYear ? ` - ${person.deathYear}` : ""}
                  </small>
                </button>
              ))}
              {filteredPeople.length === 0 && <p className="muted-text">Nema rezultata.</p>}
            </div>
          </aside>

          <section className="gallery-instagram-main">
            {!selectedPhoto && (
              <div className="empty gallery-empty-upload">
                <p>Dodaj slike u galeriju za pocetak.</p>
              </div>
            )}

            {selectedPhoto && (
              <>
                <div
                  className="gallery-photo-stage"
                  onClick={handleImageClick}
                  onMouseMove={handleStageMouseMove}
                  onMouseUp={handleStageMouseUp}
                  onMouseLeave={handleStageMouseUp}
                  role="button"
                  tabIndex={0}
                >
                  <img src={selectedPhoto.src} alt="Galerijska fotografija" className="gallery-stage-image" />

                  {(selectedPhoto.tags || []).map((tag) => {
                    const person = personById.get(tag.personId);
                    if (!person) return null;
                    return (
                      <div
                        key={tag.id}
                        className="gallery-tag-marker"
                        style={{ left: `${tag.x}%`, top: `${tag.y}%` }}
                        onMouseDown={(e) => handleTagMouseDown(e, tag.id)}
                        title="Prevuci da pomjeriš tag"
                      >
                        <span>{person.name || "Bez imena"}</span>
                      </div>
                    );
                  })}

                  {pendingPoint && (
                    <div
                      className="gallery-pending-dot"
                      style={{ left: `${pendingPoint.x}%`, top: `${pendingPoint.y}%` }}
                    />
                  )}
                </div>

                <p className="muted-text">
                  Klikni na fotografiju da postaviš tačku za tag osobe. Prevuci postoje\u0107i tag da ga pomjeriš.
                </p>
              </>
            )}
          </section>

          <aside className="gallery-photo-editor">
            <h3>Dodani ljudi</h3>
            {selectedPhoto && (selectedPhoto.tags || []).length > 0 ? (
              <div className="gallery-current-tags">
                {(selectedPhoto.tags || []).map((tag) => {
                  const person = personById.get(tag.personId);
                  if (!person) return null;
                  return (
                    <div key={tag.id} className="gallery-current-tag-row">
                      <button
                        type="button"
                        className="gallery-person-btn"
                        onClick={() => onOpenPersonDetails && onOpenPersonDetails(person)}
                      >
                        <span>{person.name || "Bez imena"}</span>
                      </button>
                      <button
                        type="button"
                        className="gallery-tag-remove"
                        title="Ukloni tag"
                        onClick={() => removeTag(tag.id)}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted-text">Nema dodanih osoba na ovoj slici.</p>
            )}

            <h3>Dodaj tag osobe</h3>
            {!pendingPoint && <p className="muted-text">Prvo klikni mjesto na slici.</p>}
            {pendingPoint && (
              <>
                <input
                  type="text"
                  placeholder="Pretraži osobu za tag"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                />
                <div className="gallery-tag-person-list">
                  {taggablePeople.map((person) => (
                    <button
                      key={`tag-${person.id}`}
                      type="button"
                      className="gallery-person-btn"
                      onClick={() => addTagAtPendingPoint(person.id)}
                    >
                      <span>{person.name || "Bez imena"}</span>
                    </button>
                  ))}
                  {taggablePeople.length === 0 && <p className="muted-text">Nema rezultata.</p>}
                </div>
                <button type="button" className="btn-ghost small" onClick={() => setPendingPoint(null)}>
                  Otkaži tag
                </button>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default GalleryView;








