import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, X, Briefcase, MapPin } from "lucide-react";
import { api, getApiErrorMessage } from "../../services/api";

const clean = (value, fallback = "-") => {
  const text = String(value || "").trim();
  return text || fallback;
};

const lifeLabel = (person) => {
  if (!person) return "-";
  const birth = clean(person.birthYear, "?");
  const death = person.deathYear ? ` - ${person.deathYear}` : "";
  return `${birth}${death}`;
};

const relationLabel = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "married") return "Brak";
  if (normalized === "partner") return "Partnerstvo";
  if (normalized === "divorced") return "Razvod";
  if (normalized === "separated") return "Razdvojeni";
  if (normalized === "widowed") return "Udovištvo";
  return clean(status);
};

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
  if (value.startsWith("//")) return `${window.location.protocol}${value}`;
  if (value.startsWith("/")) return value;
  if (value.startsWith("backend/public/")) return `/${value.replace(/^backend\/public\//, "")}`;
  if (value.startsWith("public/")) return `/${value.replace(/^public\//, "")}`;
  return `/${value}`;
};

const normalizeGalleryRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const src = normalizePhotoSource(row?.src);
      if (!src) return null;
      const tags = Array.isArray(row?.tags)
        ? row.tags
            .map((tag) => ({
              personId: Number(tag?.personId || 0),
              x: Number(tag?.x || 0),
              y: Number(tag?.y || 0),
            }))
            .filter((tag) => tag.personId > 0)
        : [];
      return {
        id: Number(row?.id || 0) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        src,
        tags,
      };
    })
    .filter(Boolean);
};

const PersonDetailsView = ({
  personId,
  people,
  tags,
  tagLinks,
  personHealthMap,
  relationships,
  activeFamilyId,
  onBackToTree,
  onEditPerson,
}) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [taggedPhotos, setTaggedPhotos] = useState([]);
  const [taggedPhotosError, setTaggedPhotosError] = useState("");
  const [showAllTaggedPhotos, setShowAllTaggedPhotos] = useState(false);

  const person = useMemo(
    () => (people || []).find((item) => Number(item.id) === Number(personId)) || null,
    [people, personId]
  );

  const byId = useMemo(
    () => new Map((people || []).map((item) => [Number(item.id), item])),
    [people]
  );

  const parent1 = person?.parent ? byId.get(Number(person.parent)) : null;
  const parent2 = person?.parent2 ? byId.get(Number(person.parent2)) : null;
  const spouse = person?.spouse ? byId.get(Number(person.spouse)) : null;

  const children = useMemo(() => {
    if (!person) return [];
    return (people || []).filter(
      (item) => Number(item.parent) === Number(person.id) || Number(item.parent2) === Number(person.id)
    );
  }, [people, person]);

  const health = person ? personHealthMap?.[person.id] || null : null;

  const tagNames = useMemo(() => {
    if (!person) return [];
    const ids = new Set(
      (tagLinks || [])
        .filter((link) => Number(link.personId) === Number(person.id))
        .map((link) => Number(link.tagId))
    );
    return (tags || [])
      .filter((tag) => ids.has(Number(tag.id)))
      .map((tag) => clean(tag.name))
      .filter(Boolean);
  }, [person, tags, tagLinks]);

  const relationRows = useMemo(() => {
    if (!person) return [];
    return (relationships || [])
      .filter(
        (row) => Number(row.personA) === Number(person.id) || Number(row.personB) === Number(person.id)
      )
      .map((row) => {
        const otherId =
          Number(row.personA) === Number(person.id) ? Number(row.personB) : Number(row.personA);
        const other = byId.get(otherId);
        return {
          id: row.id,
          other: clean(other?.name),
          status: relationLabel(row.status),
          start: row.startYear || "?",
          end: row.endYear || "?",
          notes: clean(row.notes, ""),
        };
      });
  }, [person, relationships, byId]);

  const profilePhoto = useMemo(() => normalizePhotoSource(person?.photo), [person?.photo]);

  useEffect(() => {
    setPhotoFailed(false);
  }, [person?.id, profilePhoto]);

  useEffect(() => {
    let cancelled = false;
    const loadTaggedPhotos = async () => {
      if (!person?.id || !activeFamilyId) {
        if (!cancelled) {
          setTaggedPhotos([]);
          setTaggedPhotosError("");
        }
        return;
      }

      setTaggedPhotosError("");
      try {
        let rows;
        try {
          rows = await api(`/api/gallery/photos?familyId=${activeFamilyId}`);
        } catch (primaryErr) {
          try {
            rows = await api(`/api/families/${activeFamilyId}/gallery`);
          } catch {
            throw primaryErr;
          }
        }
        const allPhotos = normalizeGalleryRows(rows);
        const filtered = allPhotos.filter((photo) =>
          (photo.tags || []).some((tag) => Number(tag.personId) === Number(person.id))
        );

        if (!cancelled) setTaggedPhotos(filtered);
      } catch (err) {
        if (!cancelled) {
          setTaggedPhotos([]);
          setTaggedPhotosError(getApiErrorMessage(err, "Ne mogu učitati označene fotografije."));

        }
      }
    };

    loadTaggedPhotos();
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId, person?.id]);

  const taggedPreview = useMemo(() => taggedPhotos.slice(0, 3), [taggedPhotos]);

  if (!person) {
    return (
      <div className="panel page">
        <div className="page-header">
          <h2>Detalji osobe</h2>
          <button type="button" className="btn-ghost" onClick={onBackToTree}>
            <ArrowLeft className="w-4 h-4" />
            Nazad na stablo
          </button>
        </div>
        <div className="card">Osoba nije pronađena.</div>
      </div>
    );
  }

  return (
    <div className="panel page person-details-page">
      <div className="page-header">
        <div className="gallery-top-actions">
          <button type="button" className="btn-ghost" onClick={onBackToTree}>
            <ArrowLeft className="w-4 h-4" />
            Nazad na stablo
          </button>
          <button type="button" className="btn-primary" onClick={() => onEditPerson?.(person)}>
            <Pencil className="w-4 h-4" />
            Uredi profil
          </button>
        </div>
      </div>

      <div className="card person-details-hero">
        {profilePhoto && !photoFailed ? (
          <img
            src={profilePhoto}
            alt={clean(person.name, "Profil")}
            className="person-details-photo"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <div className="person-details-photo person-details-fallback">
            {clean(person.name, "Bez imena")
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0] || "")
              .join("")
              .toUpperCase()}
          </div>
        )}
        <div className="person-details-hero-meta">
          <div className="person-hero-top">
            <h3>{clean(person.name, "Bez imena")}</h3>
            <span className="muted-text person-hero-year">{lifeLabel(person)}</span>
            <div className="person-hero-pills">
              <span className={`pill ${person.gender === "F" ? "pink" : "blue"}`}>
                {person.gender === "F" ? "Zensko" : "Musko"}
              </span>
              {tagNames.length > 0 && (
                <span className="pill blue">
                  {tagNames.length === 1 ? tagNames[0] : `${tagNames.length} oznake`}
                </span>
              )}
            </div>
          </div>
          <div className="person-hero-facts">
            <p>
              <Briefcase className="w-4 h-4" />
              <span className="person-hero-fact-label">Zanimanje</span>
              <span>{clean(person.occupation, "Nije uneseno")}</span>
            </p>
            <p>
              <MapPin className="w-4 h-4" />
              <span className="person-hero-fact-label">Mjesto rodenja</span>
              <span>{clean(person.birthPlace, "Nije uneseno")}</span>
            </p>
            <p>
              <Briefcase className="w-4 h-4" />
              <span className="person-hero-fact-label">Odsjek / stepen</span>
              <span>{clean(person.studies, "Nije uneseno")}</span>
            </p>
            <p>
              <MapPin className="w-4 h-4" />
              <span className="person-hero-fact-label">Fakultet</span>
              <span>{clean(person.faculty, "Nije uneseno")}</span>
            </p>
          </div>
          <p className="muted-text person-hero-bio">{clean(person.bio, "Bez biografije.")}</p>
        </div>
      </div>

      <div className="card chart-card person-mini-card person-tagged-card person-section-tagged">
        <h3>Tagged photos</h3>
        {taggedPreview.length === 0 ? (
          <p className="muted-text">Nema tagged fotografija.</p>
        ) : (
          <div className="person-tagged-strip">
            {taggedPreview.map((photo, index) => (
              <button
                key={`${photo.id}-${index}`}
                type="button"
                className="person-tagged-thumb"
                onClick={() => setShowAllTaggedPhotos(true)}
              >
                <img src={photo.src} alt="Tagged" />
              </button>
            ))}
            {taggedPhotos.length > 3 && (
              <button
                type="button"
                className="person-tagged-more"
                onClick={() => setShowAllTaggedPhotos(true)}
                aria-label="Prikaži sve označene fotografije"
                title="Prikaži sve označene fotografije"
              >
                ...
              </button>
            )}
          </div>
        )}
        {taggedPhotosError && <p className="muted-text" style={{ color: "#b91c1c" }}>{taggedPhotosError}</p>}
      </div>
      <div className="person-details-layout">
        <div className="person-details-col person-details-col-main">
          <div className="card chart-card person-mini-card person-section-basic">
            <h3>Osnovno</h3>
            <div className="person-kv-list">
              <div className="person-kv-row">
                <span className="person-kv-label">Spol</span>
                <span className="person-kv-value">{person.gender === "F" ? "Zensko" : "Musko"}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Zanimanje</span>
                <span className="person-kv-value">{clean(person.occupation)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Mjesto rođenja</span>
                <span className="person-kv-value">{clean(person.birthPlace)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Mjesto ukopa</span>
                <span className="person-kv-value">{clean(person.burialPlace)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Odsjek / stepen</span>
                <span className="person-kv-value">{clean(person.studies)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Fakultet</span>
                <span className="person-kv-value">{clean(person.faculty)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Otac</span>
                <span className="person-kv-value">{clean(parent1?.name)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Bracni partner</span>
                <span className="person-kv-value">{clean(spouse?.name)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Majka</span>
                <span className="person-kv-value">{clean(parent2?.name)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="person-details-col person-details-col-side">
          <div className="card chart-card person-mini-card person-section-health">
            <h3>Zdravlje</h3>
            <div className="person-kv-list">
              <div className="person-kv-row">
                <span className="person-kv-label">Nasljedne bolesti</span>
                <span className="person-kv-value">{clean(health?.hereditaryConditions)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Rizicni faktori</span>
                <span className="person-kv-value">{clean(health?.riskFactors)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Napomene</span>
                <span className="person-kv-value">{clean(health?.notes)}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Oznake</span>
                <span className="person-kv-value">{tagNames.length > 0 ? `${tagNames.length} oznaka` : "Nema oznaka"}</span>
              </div>
              <div className="person-kv-row">
                <span className="person-kv-label">Veze</span>
                <span className="person-kv-value">{relationRows.length > 0 ? `${relationRows.length} aktivnih zapisa` : "Nema veza"}</span>
              </div>
            </div>
          </div>

          <div className="card chart-card person-panel person-section-tags">
            <h3>Oznake</h3>
            {tagNames.length === 0 ? (
              <p className="muted-text person-empty-state">Nema oznaka.</p>
            ) : (
              <div className="gallery-tag-pills">
                {tagNames.map((name) => (
                  <span key={name} className="tag-pill active">{name}</span>
                ))}
              </div>
            )}
          </div>

          <div className="card chart-card person-panel person-section-children">
            <h3>Djeca</h3>
            {children.length === 0 ? (
              <p className="muted-text person-empty-state">Nema djece.</p>
            ) : (
              <div className="list compact-list">
                {children.map((child) => (
                  <div key={child.id} className="list-item">
                    <h4>{clean(child.name)}</h4>
                    <span className="pill blue">{lifeLabel(child)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card chart-card person-panel person-section-relations">
        <h3>Veze kroz vrijeme</h3>
        {relationRows.length === 0 ? (
          <p className="muted-text person-empty-state">Nema veza.</p>
        ) : (
          <div className="list compact-list">
            {relationRows.map((row) => (
              <div key={row.id} className="list-item">
                <div>
                  <h4>{row.status} - {row.other}</h4>
                  <p>{row.start} - {row.end}{row.notes ? ` | ${row.notes}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAllTaggedPhotos && (
        <div className="person-tagged-modal-backdrop" onClick={() => setShowAllTaggedPhotos(false)}>
          <div className="person-tagged-modal" onClick={(e) => e.stopPropagation()}>
            <div className="person-tagged-modal-head">
              <h3>Sve tagged fotografije</h3>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowAllTaggedPhotos(false)}
                aria-label="Zatvori"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="person-tagged-grid">
              {taggedPhotos.map((photo, index) => (
                <div key={`${photo.id}-${index}`} className="person-tagged-grid-item">
                  <img src={photo.src} alt="Tagged" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonDetailsView;









