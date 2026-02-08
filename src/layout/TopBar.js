import React from "react";
import {
  Users,
  Plus,
  Upload,
  Download,
  Home,
  BarChart3,
  ImageIcon,
  Search,
} from "lucide-react";

const tabs = [
  { id: "tree", label: "Stablo", icon: Home },
  { id: "stats", label: "Statistika", icon: BarChart3 },
  { id: "gallery", label: "Galerija", icon: ImageIcon },
  { id: "search", label: "Pretraga", icon: Search },
];

const TopBar = ({ onAddPerson, onImport, onExport, activeTab, onTabChange }) => (
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

    <nav className="topbar-nav">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`nav-btn ${activeTab === tab.id ? "is-active" : ""}`}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </nav>

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
