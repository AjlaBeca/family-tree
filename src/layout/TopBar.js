import React from "react";
import { Users, Plus, Upload, Download } from "lucide-react";

const TopBar = ({ onAddPerson, onImport, onExport }) => (
  <header className="topbar">
    <div className="brand">
      <div className="brand-icon">
        <Users className="w-6 h-6" />
      </div>
      <div>
        <p className="brand-title">Porodični atlas</p>
        <p className="brand-subtitle">Vizualizuj, istraži i sačuvaj svoje porijeklo</p>
      </div>
    </div>

    <div className="topbar-actions">
      <button onClick={onAddPerson} className="btn-primary">
        <Plus className="w-4 h-4" />
        Dodaj osobu
      </button>

      <label className="btn-ghost">
        <Upload className="w-4 h-4" />
        Import
        <input type="file" accept=".json" onChange={onImport} className="hidden" />
      </label>

      <button onClick={onExport} className="btn-ghost">
        <Download className="w-4 h-4" />
        Export
      </button>
    </div>
  </header>
);

export default TopBar;
