import React, { useEffect, useMemo, useState } from "react";
import { Layers, Search } from "lucide-react";

const SearchView = ({
  searchTerm,
  onSearchChange,
  pinnedOnly,
  onPinnedOnlyChange,
  filteredPeople,
  onSelectPerson,
  families,
  activeFamilyId,
  onFamilyChange,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredPeople.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pinnedOnly, filteredPeople.length]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pagedPeople = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPeople.slice(start, start + pageSize);
  }, [filteredPeople, currentPage]);

  return (
    <div className="panel page search-page">
      <div className="page-header">
        <div>
          <h2>Pretraga</h2>
          <p className="muted-text">Pretraži unutar aktivne porodične grupe.</p>
        </div>
        <div className="family-select compact">
          <Layers className="w-4 h-4" />
          <select value={activeFamilyId || ""} onChange={(e) => onFamilyChange(Number(e.target.value))}>
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="search-card">
        <Search className="w-4 h-4" />
        <input
          type="text"
          placeholder="Pretraži po imenu..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <label className="inline-check">
          <input
            type="checkbox"
            checked={Boolean(pinnedOnly)}
            onChange={(e) => onPinnedOnlyChange(e.target.checked)}
          />
          <span>Samo pinovani</span>
        </label>
      </div>

      <div className="list">
        {pagedPeople.map((person) => (
          <button key={person.id} className="list-item" onClick={() => onSelectPerson(person)}>
            <div>
              <h4>{person.name}</h4>
              <p>
                {person.birthYear}
                {person.deathYear ? ` - ${person.deathYear}` : ""}
              </p>
            </div>
            <span className={`pill ${person.gender === "M" ? "blue" : "pink"}`}>
              {person.gender === "M" ? "Muško" : "Žensko"}
            </span>
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
          Stranica {currentPage} / {totalPages} ({filteredPeople.length} članova)
        </span>
        <button
          type="button"
          className="btn-ghost small"
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        >
          Sljedeća
        </button>
      </div>
    </div>
  );
};

export default SearchView;
