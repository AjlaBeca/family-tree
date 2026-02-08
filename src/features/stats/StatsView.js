import React from "react";
import { Layers } from "lucide-react";

const StatsView = ({
  stats,
  families,
  activeFamilyId,
  onFamilyChange,
  activeFamily,
}) => (
  <div className="panel page">
    <div className="page-header">
      <div>
        <h2>Statistika porodice</h2>
        <p className="muted-text">{activeFamily ? activeFamily.name : "Sve porodice"}</p>
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

    <div className="stats-cards">
      <div className="card stat-card">
        <p className="stat-label">Ukupno članova</p>
        <p className="stat-value">{stats.total}</p>
      </div>
      <div className="card stat-card">
        <p className="stat-label">Živi</p>
        <p className="stat-value">{stats.living}</p>
      </div>
      <div className="card stat-card">
        <p className="stat-label">Muško</p>
        <p className="stat-value">{stats.males}</p>
      </div>
      <div className="card stat-card">
        <p className="stat-label">Žensko</p>
        <p className="stat-value">{stats.females}</p>
      </div>
    </div>

    <div className="card chart-card">
      <h3>Raspodjela po spolu</h3>
      <div className="bar-chart">
        <div className="bar" style={{ height: `${(stats.males / stats.total) * 100}%` }}>
          <span>{stats.males}</span>
        </div>
        <div className="bar alt" style={{ height: `${(stats.females / stats.total) * 100}%` }}>
          <span>{stats.females}</span>
        </div>
      </div>
      <div className="legend">
        <div className="legend-item">
          <span className="dot blue" /> Muško
        </div>
        <div className="legend-item">
          <span className="dot pink" /> Žensko
        </div>
      </div>
    </div>
  </div>
);

export default StatsView;

