import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Search, RotateCcw, ChevronDown } from "lucide-react";

const parseYear = (value) => {
  const text = String(value || "").trim();
  const parsed = Number(text);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1000 || parsed > 3000) return null;
  return parsed;
};

const getSurname = (name = "") => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const SearchView = ({
  searchTerm,
  onSearchChange,
  people,
  tags,
  tagLinks,
  onSelectPerson,
  families,
  activeFamilyId,
  onFamilyChange,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [gender, setGender] = useState("all");
  const [lifeStatus, setLifeStatus] = useState("all");
  const [hasPhoto, setHasPhoto] = useState("all");
  const [hasBio, setHasBio] = useState("all");
  const [hasOccupation, setHasOccupation] = useState("all");
  const [hasBurial, setHasBurial] = useState("all");
  const [surnameFilter, setSurnameFilter] = useState("all");
  const [tagId, setTagId] = useState("0");
  const [birthFrom, setBirthFrom] = useState("");
  const [birthTo, setBirthTo] = useState("");
  const [sortBy, setSortBy] = useState("name-asc");
  const [openDropdown, setOpenDropdown] = useState("");
  const dropdownRootRef = useRef(null);
  const dropdownTypeaheadRef = useRef({ buffer: "", timer: null });

  const pageSize = 12;
  const sourcePeople = useMemo(() => (Array.isArray(people) ? people : []), [people]);

  useEffect(() => {
    const onDocumentPointerDown = (event) => {
      if (!dropdownRootRef.current?.contains(event.target)) {
        setOpenDropdown("");
      }
    };
    const onDocumentKeyDown = (event) => {
      if (event.key === "Escape") setOpenDropdown("");
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

  const tagIdsByPerson = useMemo(() => {
    const map = new Map();
    (tagLinks || []).forEach((link) => {
      const personId = Number(link.personId || 0);
      const tId = Number(link.tagId || 0);
      if (!personId || !tId) return;
      const set = map.get(personId) || new Set();
      set.add(tId);
      map.set(personId, set);
    });
    return map;
  }, [tagLinks]);

  const filteredPeople = useMemo(() => {
    const query = String(searchTerm || "").trim().toLowerCase();
    const minBirth = parseYear(birthFrom);
    const maxBirth = parseYear(birthTo);
    const selectedTagId = Number(tagId || 0);

    let next = sourcePeople.filter((person) => {
      const name = String(person.name || "").toLowerCase();
      const bio = String(person.bio || "").toLowerCase();
      const occupation = String(person.occupation || "").toLowerCase();
      const primarySchool = String(person.primarySchool || "").toLowerCase();
      const secondarySchool = String(person.secondarySchool || "").toLowerCase();
      const studies = String(person.studies || "").toLowerCase();
      const faculty = String(person.faculty || "").toLowerCase();
      const birthPlace = String(person.birthPlace || "").toLowerCase();
      const burial = String(person.burialPlace || "").toLowerCase();

      if (
        query &&
        !name.includes(query) &&
        !bio.includes(query) &&
        !occupation.includes(query) &&
        !primarySchool.includes(query) &&
        !secondarySchool.includes(query) &&
        !studies.includes(query) &&
        !faculty.includes(query) &&
        !birthPlace.includes(query) &&
        !burial.includes(query)
      ) {
        return false;
      }

      if (gender !== "all" && String(person.gender || "") !== gender) return false;
      if (lifeStatus === "alive" && person.deathYear) return false;
      if (lifeStatus === "deceased" && !person.deathYear) return false;
      if (hasPhoto === "yes" && !String(person.photo || "").trim()) return false;
      if (hasPhoto === "no" && String(person.photo || "").trim()) return false;
      if (hasBio === "yes" && !String(person.bio || "").trim()) return false;
      if (hasBio === "no" && String(person.bio || "").trim()) return false;
      if (hasOccupation === "yes" && !String(person.occupation || "").trim()) return false;
      if (hasOccupation === "no" && String(person.occupation || "").trim()) return false;
      if (hasBurial === "yes" && !String(person.burialPlace || "").trim()) return false;
      if (hasBurial === "no" && String(person.burialPlace || "").trim()) return false;
      if (surnameFilter !== "all") {
        if (getSurname(person.name || "").toLowerCase() !== surnameFilter) return false;
      }

      if (selectedTagId > 0) {
        const personTags = tagIdsByPerson.get(Number(person.id || 0));
        if (!personTags || !personTags.has(selectedTagId)) return false;
      }

      const birth = parseYear(person.birthYear);
      if (minBirth && (!birth || birth < minBirth)) return false;
      if (maxBirth && (!birth || birth > maxBirth)) return false;

      return true;
    });

    const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
    const byBirth = (a, b) => (parseYear(a.birthYear) || 0) - (parseYear(b.birthYear) || 0);

    if (sortBy === "name-desc") next = next.sort((a, b) => byName(b, a));
    if (sortBy === "birth-asc") next = next.sort((a, b) => byBirth(a, b));
    if (sortBy === "birth-desc") next = next.sort((a, b) => byBirth(b, a));
    if (sortBy === "recent") next = next.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    if (sortBy === "name-asc") next = next.sort((a, b) => byName(a, b));

    return next;
  }, [
    sourcePeople,
    searchTerm,
    gender,
    lifeStatus,
    hasPhoto,
    hasBio,
    hasOccupation,
    hasBurial,
    surnameFilter,
    tagId,
    birthFrom,
    birthTo,
    sortBy,
    tagIdsByPerson,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredPeople.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    gender,
    lifeStatus,
    hasPhoto,
    hasBio,
    hasOccupation,
    hasBurial,
    tagId,
    birthFrom,
    birthTo,
    sortBy,
    filteredPeople.length,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pagedPeople = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPeople.slice(start, start + pageSize);
  }, [filteredPeople, currentPage]);

  const resetFilters = () => {
    onSearchChange("");
    setGender("all");
    setLifeStatus("all");
    setHasPhoto("all");
    setHasBio("all");
    setHasOccupation("all");
    setHasBurial("all");
    setSurnameFilter("all");
    setTagId("0");
    setBirthFrom("");
    setBirthTo("");
    setSortBy("name-asc");
    setOpenDropdown("");
  };

  const selectedFamilyLabel = useMemo(() => {
    const selected = (families || []).find((family) => Number(family.id) === Number(activeFamilyId));
    return selected?.name || "Bez porodice";
  }, [families, activeFamilyId]);

  const selectedTagLabel = useMemo(() => {
    if (!Number(tagId || 0)) return "Tag: svi";
    const selected = (tags || []).find((tag) => Number(tag.id) === Number(tagId));
    return selected ? `Tag: ${selected.name}` : "Tag: svi";
  }, [tagId, tags]);

  const surnameOptions = useMemo(() => {
    const counts = new Map();
    sourcePeople.forEach((person) => {
      const surname = getSurname(person?.name || "");
      if (!surname) return;
      const key = surname.toLowerCase();
      counts.set(key, { key, label: surname, count: (counts.get(key)?.count || 0) + 1 });
    });
    return Array.from(counts.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, "bs", { sensitivity: "base" });
    });
  }, [sourcePeople]);

  const selectedSurnameLabel = useMemo(() => {
    if (surnameFilter === "all") return "Prezime: sva";
    const selected = surnameOptions.find((row) => row.key === surnameFilter);
    return selected ? `Prezime: ${selected.label}` : "Prezime: sva";
  }, [surnameFilter, surnameOptions]);

  const handleDropdownTypeahead = (event, keyName, options, onSelect) => {
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

    if (openDropdown !== keyName) {
      setOpenDropdown(keyName);
    }
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
  };

  const renderDropdown = ({ keyName, ariaLabel, value, label, options, onSelect }) => (
    <div className="search-dropdown" data-open={openDropdown === keyName ? "1" : "0"}>
      <button
        type="button"
        className="search-dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={openDropdown === keyName}
        onKeyDown={(event) => handleDropdownTypeahead(event, keyName, options, onSelect)}
        onClick={() => setOpenDropdown((prev) => (prev === keyName ? "" : keyName))}
      >
        <span>{label}</span>
        <ChevronDown className={`search-dropdown-chevron ${openDropdown === keyName ? "is-open" : ""}`} />
      </button>
      {openDropdown === keyName && (
        <div className="search-dropdown-menu" role="listbox" aria-label={`${ariaLabel} opcije`}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={String(value) === String(option.value)}
              className={`search-dropdown-option ${
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
    <div className="panel page search-page search-page-compact" ref={dropdownRootRef}>
      <div className="page-header">
        <div>
          <h2>Pretraga</h2>
          <p className="muted-text">Brza pretraga + napredni filteri.</p>
        </div>
        <div className="family-select compact search-family-dropdown">
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
          })}
        </div>
      </div>

      <div className="search-card">
        <Search className="w-4 h-4" />
        <input
          type="text"
          placeholder="Ime, biografija, zanimanje, rođenje, ukop..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="search-filters-grid">
        {renderDropdown({
          keyName: "gender",
          ariaLabel: "Spol",
          value: gender,
          label: gender === "M" ? "Spol: musko" : gender === "F" ? "Spol: zensko" : "Spol: svi",
          options: [
            { value: "all", label: "Spol: svi" },
            { value: "M", label: "Spol: musko" },
            { value: "F", label: "Spol: zensko" },
          ],
          onSelect: setGender,
        })}

        {renderDropdown({
          keyName: "lifeStatus",
          ariaLabel: "Status zivota",
          value: lifeStatus,
          label:
            lifeStatus === "alive"
              ? "Status: zivi"
              : lifeStatus === "deceased"
                ? "Status: umrli"
                : "Status: svi",
          options: [
            { value: "all", label: "Status: svi" },
            { value: "alive", label: "Status: zivi" },
            { value: "deceased", label: "Status: umrli" },
          ],
          onSelect: setLifeStatus,
        })}

        {renderDropdown({
          keyName: "hasPhoto",
          ariaLabel: "Fotografija",
          value: hasPhoto,
          label: hasPhoto === "yes" ? "Foto: ima" : hasPhoto === "no" ? "Foto: nema" : "Foto: sve",
          options: [
            { value: "all", label: "Foto: sve" },
            { value: "yes", label: "Foto: ima" },
            { value: "no", label: "Foto: nema" },
          ],
          onSelect: setHasPhoto,
        })}

        {renderDropdown({
          keyName: "hasBio",
          ariaLabel: "Biografija",
          value: hasBio,
          label: hasBio === "yes" ? "Bio: ima" : hasBio === "no" ? "Bio: nema" : "Bio: sve",
          options: [
            { value: "all", label: "Bio: sve" },
            { value: "yes", label: "Bio: ima" },
            { value: "no", label: "Bio: nema" },
          ],
          onSelect: setHasBio,
        })}

        {renderDropdown({
          keyName: "hasOccupation",
          ariaLabel: "Zanimanje",
          value: hasOccupation,
          label:
            hasOccupation === "yes"
              ? "Zanimanje: ima"
              : hasOccupation === "no"
                ? "Zanimanje: nema"
                : "Zanimanje: sve",
          options: [
            { value: "all", label: "Zanimanje: sve" },
            { value: "yes", label: "Zanimanje: ima" },
            { value: "no", label: "Zanimanje: nema" },
          ],
          onSelect: setHasOccupation,
        })}

        {renderDropdown({
          keyName: "hasBurial",
          ariaLabel: "Mjesto ukopa",
          value: hasBurial,
          label: hasBurial === "yes" ? "Ukop: ima" : hasBurial === "no" ? "Ukop: nema" : "Ukop: sve",
          options: [
            { value: "all", label: "Ukop: sve" },
            { value: "yes", label: "Ukop: ima" },
            { value: "no", label: "Ukop: nema" },
          ],
          onSelect: setHasBurial,
        })}

        {renderDropdown({
          keyName: "surnameFilter",
          ariaLabel: "Prezime",
          value: surnameFilter,
          label: selectedSurnameLabel,
          options: [
            { value: "all", label: "Prezime: sva" },
            ...surnameOptions.map((row) => ({
              value: row.key,
              label: `${row.label} (${row.count})`,
            })),
          ],
          onSelect: (next) => setSurnameFilter(String(next)),
        })}

        {renderDropdown({
          keyName: "tagId",
          ariaLabel: "Tag",
          value: tagId,
          label: selectedTagLabel,
          options: [
            { value: "0", label: "Tag: svi" },
            ...((tags || []).map((tag) => ({ value: String(tag.id), label: `Tag: ${tag.name}` }))),
          ],
          onSelect: (nextTag) => setTagId(String(nextTag)),
        })}

        {renderDropdown({
          keyName: "sortBy",
          ariaLabel: "Sortiranje",
          value: sortBy,
          label:
            sortBy === "name-desc"
              ? "Sort: ime Z-A"
              : sortBy === "birth-asc"
                ? "Sort: rodjenje rastuce"
                : sortBy === "birth-desc"
                  ? "Sort: rodjenje opadajuce"
                  : sortBy === "recent"
                    ? "Sort: najnoviji unos"
                    : "Sort: ime A-Z",
          options: [
            { value: "name-asc", label: "Sort: ime A-Z" },
            { value: "name-desc", label: "Sort: ime Z-A" },
            { value: "birth-asc", label: "Sort: rodjenje rastuce" },
            { value: "birth-desc", label: "Sort: rodjenje opadajuce" },
            { value: "recent", label: "Sort: najnoviji unos" },
          ],
          onSelect: setSortBy,
        })}

        <input
          type="number"
          placeholder="Rodjenje od"
          value={birthFrom}
          onChange={(e) => setBirthFrom(e.target.value)}
        />
        <input
          type="number"
          placeholder="Rodjenje do"
          value={birthTo}
          onChange={(e) => setBirthTo(e.target.value)}
        />

        <button type="button" className="btn-ghost small search-reset-btn" onClick={resetFilters}>
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      <div className="list search-results-list">
        {pagedPeople.map((person) => (
          <button key={person.id} className="list-item search-list-item" onClick={() => onSelectPerson(person)}>
            <div className="search-list-main">
              <div className="search-list-title-row">
                <h4>{person.name}</h4>
                <span className="search-list-years">
                  {person.birthYear || "?"}
                  {person.deathYear ? ` - ${person.deathYear}` : ""}
                </span>
              </div>
              <p className="search-list-sub">
                {String(person.occupation || "").trim() || "Bez zanimanja"}
                {" • "}
                {String(person.studies || "").trim() || "Bez studiranja"}
                {" • "}
                {String(person.faculty || "").trim() || "Bez fakulteta"}
                {" • "}
                {String(person.birthPlace || "").trim() || "Bez mjesta rođenja"}
                {" • "}
                {String(person.burialPlace || "").trim() || "Bez mjesta ukopa"}
              </p>
            </div>
            <div className="search-list-badges">
              <span className={`pill ${person.gender === "M" ? "blue" : "pink"}`}>
                {person.gender === "M" ? "Musko" : "Zensko"}
              </span>
            </div>
          </button>
        ))}
        {pagedPeople.length === 0 && <div className="empty">Nema rezultata.</div>}
      </div>

      <div className="pagination-row">
        <button
          type="button"
          className="btn-ghost small"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
        >
          Prethodna
        </button>
        <span className="muted-text">
          Stranica {currentPage} / {totalPages} ({filteredPeople.length} clanova)
        </span>
        <button
          type="button"
          className="btn-ghost small"
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        >
          Sljedeca
        </button>
      </div>
    </div>
  );
};

export default SearchView;
