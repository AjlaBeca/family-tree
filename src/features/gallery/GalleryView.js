import React from "react";
import { Layers } from "lucide-react";

const GalleryView = ({
  people,
  families,
  activeFamilyId,
  onFamilyChange,
}) => (
  <div className="panel page">
    <div className="page-header">
      <div>
        <h2>Porodična galerija</h2>
        <p className="muted-text">Vizuelni album za aktivnu porodičnu grupu.</p>
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

    <div className="gallery">
      {people
        .filter((p) => p.photo)
        .map((person) => (
          <div key={person.id} className="card gallery-card">
            <img src={person.photo} alt={person.name} />
            <p>{person.name}</p>
          </div>
        ))}
      {people.filter((p) => p.photo).length === 0 && (
        <div className="empty">Još nema dodanih fotografija</div>
      )}
    </div>
  </div>
);

export default GalleryView;
