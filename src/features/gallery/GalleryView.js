import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Plus, Trash2, X, Download, ArrowLeft, Users, ChevronDown } from "lucide-react";
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
  description: "",
  location: "",
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
        description: String(row?.description || ""),
        location: String(row?.location || ""),
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
  const [showPeopleSidebar, setShowPeopleSidebar] = useState(false);
  const [gridQuery, setGridQuery] = useState("");
  const [gridSort, setGridSort] = useState("newest");
  const [gridTaggedOnly, setGridTaggedOnly] = useState(false);
  const dragMovedRef = useRef(false);
  const dropdownRootRef = useRef(null);
  const [openDropdown, setOpenDropdown] = useState("");

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
    setShowPeopleSidebar(false);
    setGridQuery("");
    setGridSort("newest");
    setGridTaggedOnly(false);
    setOpenDropdown("");
  }, [activeFamilyId]);

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

  const allPeople = useMemo(() => (Array.isArray(people) ? people : []), [people]);

  const peopleList = useMemo(
    () => (pinnedOnly ? allPeople.filter((p) => p.isPinned) : allPeople),
    [allPeople, pinnedOnly]
  );

  const personById = useMemo(
    () => new Map(allPeople.map((p) => [Number(p.id), p])),
    [allPeople]
  );

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
    if (!q) return allPeople;
    return allPeople.filter((p) => String(p.name || "").toLowerCase().includes(q));
  }, [allPeople, tagSearch]);

  const taggedPhotosCount = useMemo(
    () => album.filter((photo) => Array.isArray(photo.tags) && photo.tags.length > 0).length,
    [album]
  );

  const selectedFamilyLabel = useMemo(() => {
    const selected = (families || []).find((family) => Number(family.id) === Number(activeFamilyId));
    return selected?.name || "Bez porodice";
  }, [families, activeFamilyId]);

  const selectedSortLabel = useMemo(() => {
    if (gridSort === "oldest") return "Sort: najstarije";
    if (gridSort === "mostTagged") return "Sort: najvise tagova";
    return "Sort: najnovije";
  }, [gridSort]);

  const gridAlbum = useMemo(() => {
    const q = String(gridQuery || "").trim().toLowerCase();
    let next = Array.isArray(album) ? [...album] : [];

    next = next.filter((photo) => {
      if (gridTaggedOnly && (!Array.isArray(photo.tags) || photo.tags.length === 0)) return false;
      if (!q) return true;
      const description = String(photo.description || "").toLowerCase();
      const location = String(photo.location || "").toLowerCase();
      const taggedNames = (photo.tags || [])
        .map((tag) => String(personById.get(Number(tag.personId || 0))?.name || "").toLowerCase())
        .join(" ");
      return description.includes(q) || location.includes(q) || taggedNames.includes(q);
    });

    if (gridSort === "oldest") {
      next.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    } else if (gridSort === "mostTagged") {
      next.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0));
    } else {
      next.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    }

    return next;
  }, [album, gridQuery, gridSort, gridTaggedOnly, personById]);

  const openPhotoEditor = (photoId) => {
    if (!photoId) return;
    setSelectedPhotoId(photoId);
    setViewMode("editor");
    setPendingPoint(null);
    setDraggingTagId(null);
    setTagSearch("");
    setSaveMessage("");
    setSaveError("");
    setShowPeopleSidebar(false);
  };

  useEffect(() => {
    if (viewMode !== "editor") return;
    if (!gridAlbum.length) {
      setSelectedPhotoId("");
      return;
    }
    if (!selectedPhotoId || !gridAlbum.some((photo) => photo.id === selectedPhotoId)) {
      setSelectedPhotoId(gridAlbum[0].id);
    }
  }, [viewMode, gridAlbum, selectedPhotoId]);

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
    const normalizedPersonId = Number(personId);
    if (
      !selectedPhoto ||
      !pendingPoint ||
      !Number.isInteger(normalizedPersonId) ||
      normalizedPersonId <= 0
    ) {
      return;
    }
    setAlbum((prev) =>
      prev.map((photo) => {
        if (photo.id !== selectedPhoto.id) return photo;
        const nextTag = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          personId: normalizedPersonId,
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

  const updateSelectedPhotoMeta = (field, value) => {
    if (!selectedPhoto) return;
    const normalized = String(value || "");
    setAlbum((prev) =>
      prev.map((photo) =>
        photo.id === selectedPhoto.id ? { ...photo, [field]: normalized } : photo
      )
    );
    markPhotoDirty(selectedPhoto.id);
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
          description: String(photo.description || "").trim(),
          location: String(photo.location || "").trim(),
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

  const renderDropdown = ({ keyName, ariaLabel, value, label, options, onSelect, className = "" }) => (
    <div className={`gallery-dropdown ${className}`.trim()} data-open={openDropdown === keyName ? "1" : "0"}>
      <button
        type="button"
        className="gallery-dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={openDropdown === keyName}
        onClick={() => setOpenDropdown((prev) => (prev === keyName ? "" : keyName))}
      >
        <span>{label}</span>
        <ChevronDown className={`gallery-dropdown-chevron ${openDropdown === keyName ? "is-open" : ""}`} />
      </button>
      {openDropdown === keyName && (
        <div className="gallery-dropdown-menu" role="listbox" aria-label={`${ariaLabel} opcije`}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={String(value) === String(option.value)}
              className={`gallery-dropdown-option ${
                String(value) === String(option.value) ? "is-selected" : ""
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

  return (
    <div className="panel page gallery-instagram-page" ref={dropdownRootRef}>

      <div className="gallery-hero">
        <div className="gallery-hero-copy">
          <h2>Galerija</h2>
          <p className="muted-text">Uredi slike i tagove</p>
        </div>

        <div className="gallery-hero-controls">
          <div className="family-select compact">
            <Layers className="w-4 h-4" />
            {renderDropdown({
              keyName: "family",
              ariaLabel: "Aktivna porodica",
              value: String(activeFamilyId || ""),
              label: selectedFamilyLabel,
              options: (families || []).map((family) => ({
                value: String(family.id),
                label: family.name,
              })),
              onSelect: (nextFamilyId) => onFamilyChange(Number(nextFamilyId)),
              className: "gallery-family-dropdown",
            })}
          </div>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={Boolean(pinnedOnly)}
              onChange={(e) => onPinnedOnlyChange(e.target.checked)}
            />
            <span>Samo pinovani</span>
          </label>

          <div className="gallery-hero-actions no-divider">
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
                  onClick={() => setShowPeopleSidebar((v) => !v)}
                  title={showPeopleSidebar ? "Sakrij osobe" : "Prikazi osobe"}
                  aria-label={showPeopleSidebar ? "Sakrij osobe" : "Prikazi osobe"}
                >
                  <Users className="w-4 h-4" />
                </button>

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
                  title="Sacuvaj u galeriju"
                  aria-label="Sacuvaj u galeriju"
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
      </div>

      <div className="gallery-top-meta" role="status" aria-live="polite">
        <span className="meta-pill">{album.length} slika</span>
        <span className="meta-pill">{taggedPhotosCount} tagovanih</span>
        {isGalleryLoading && <span className="meta-pill">Ucitavanje...</span>}
        {saveMessage && <span className="meta-pill">{saveMessage}</span>}
        {saveError && <span className="meta-pill meta-pill--error">{saveError}</span>}
      </div>

      {isGalleryLoading && <div className="loading">Učitavanje galerije...</div>}

      {viewMode === "grid" ? (
        <div className="gallery-grid-screen">
          <div className="gallery-grid-filters">
            <input
              type="text"
              value={gridQuery}
              onChange={(e) => setGridQuery(e.target.value)}
              placeholder="Pretrazi opis, lokaciju ili tag osobe"
              aria-label="Pretraga galerije"
            />
            {renderDropdown({
              keyName: "gridSort",
              ariaLabel: "Sortiranje galerije",
              value: gridSort,
              label: selectedSortLabel,
              options: [
                { value: "newest", label: "Sort: najnovije" },
                { value: "oldest", label: "Sort: najstarije" },
                { value: "mostTagged", label: "Sort: najvise tagova" },
              ],
              onSelect: setGridSort,
              className: "gallery-sort-dropdown",
            })}
            <label className="inline-check">
              <input
                type="checkbox"
                checked={Boolean(gridTaggedOnly)}
                onChange={(e) => setGridTaggedOnly(e.target.checked)}
              />
              <span>Samo tagovane</span>
            </label>
          </div>

          {album.length === 0 ? (
            <div className="empty gallery-empty-upload">
              <p>Galerija je prazna. Dodaj slike da zapocnes.</p>
            </div>
          ) : (
            <div className="gallery-fixed-grid">
              {gridAlbum.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className="gallery-fixed-tile"
                  onClick={() => openPhotoEditor(photo.id)}
                  title="Otvori i taguj"
                >
                  <img
                    src={photo.src}
                    alt="Galerijska fotografija"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                  />
                </button>
              ))}
              {gridAlbum.length === 0 && (
                <div className="empty gallery-empty-upload">
                  <p>Nema rezultata za izabrane filtere.</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={`gallery-instagram-layout ${showPeopleSidebar ? "" : "compact-side"}`}>
          <aside className={`gallery-people-sidebar ${showPeopleSidebar ? "" : "is-hidden"}`}>
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
            <div className="gallery-grid-filters gallery-grid-filters--editor">
              <input
                type="text"
                value={gridQuery}
                onChange={(e) => setGridQuery(e.target.value)}
                placeholder="Pretrazi opis, lokaciju ili tag osobe"
                aria-label="Pretraga galerije"
              />
              {renderDropdown({
                keyName: "editorSort",
                ariaLabel: "Sortiranje galerije",
                value: gridSort,
                label: selectedSortLabel,
                options: [
                  { value: "newest", label: "Sort: najnovije" },
                  { value: "oldest", label: "Sort: najstarije" },
                  { value: "mostTagged", label: "Sort: najvise tagova" },
                ],
                onSelect: setGridSort,
                className: "gallery-sort-dropdown",
              })}
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={Boolean(gridTaggedOnly)}
                  onChange={(e) => setGridTaggedOnly(e.target.checked)}
                />
                <span>Samo tagovane</span>
              </label>
            </div>

            <div className="gallery-editor-strip">
              {gridAlbum.map((photo) => (
                <button
                  key={`strip-${photo.id}`}
                  type="button"
                  className={`gallery-strip-tile ${selectedPhotoId === photo.id ? "is-active" : ""}`}
                  onClick={() => setSelectedPhotoId(photo.id)}
                  title="Prebaci sliku"
                >
                  <img
                    src={photo.src}
                    alt="Thumb"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                  />
                </button>
              ))}
            </div>

            {!selectedPhoto && (
              <div className="empty gallery-empty-upload">
                <p>Nema rezultata za izabrane filtere.</p>
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
                  <img
                    src={selectedPhoto.src}
                    alt="Galerijska fotografija"
                    className="gallery-stage-image"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />

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
                  Klikni na fotografiju da postavis tacku za tag osobe. Prevuci postojeci tag da ga pomjeris.
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
                      onClick={() => addTagAtPendingPoint(Number(person.id))}
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

            {selectedPhoto && (
              <div className="gallery-photo-meta">
                <h3>Detalji fotografije</h3>
                <label>
                  Opis
                  <textarea
                    rows={2}
                    value={String(selectedPhoto.description || "")}
                    onChange={(e) => updateSelectedPhotoMeta("description", e.target.value)}
                    placeholder="Npr. Porodicni rucak"
                  />
                </label>
                <label>
                  Lokacija
                  <input
                    type="text"
                    value={String(selectedPhoto.location || "")}
                    onChange={(e) => updateSelectedPhotoMeta("location", e.target.value)}
                    placeholder="Npr. Sarajevo"
                  />
                </label>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default GalleryView;










