import React from "react";
import { Layers, Search } from "lucide-react";

const SearchView = ({
  searchTerm,
  onSearchChange,
  filteredPeople,
  onSelectPerson,
  families,
  activeFamilyId,
  onFamilyChange,
}) => (
  <div className="panel page">
    <div className="page-header">
      <div>
        <h2>Pretraga</h2>
        <p className="muted-text">Pretraži unutar aktivne porodične grupe.</p>
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

    <div className="search-card">
      <Search className="w-4 h-4" />
      <input
        type="text"
        placeholder="Pretraži po imenu..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>

    <div className="list">
      {filteredPeople.map((person) => (
        <button
          key={person.id}
          className="list-item"
          onClick={() => onSelectPerson(person)}
        >
          <div>
            <h4>{person.name}</h4>
            <p>
              {person.birthYear} {person.deathYear && `- ${person.deathYear}`}
            </p>
          </div>
          <span className={`pill ${person.gender === "M" ? "blue" : "pink"}`}>
            {person.gender === "M" ? "Muško" : "Žensko"}
          </span>
        </button>
      ))}
    </div>
  </div>
);

export default SearchView;
