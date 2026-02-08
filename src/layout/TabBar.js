import React from "react";
import { Home, BarChart3, ImageIcon, Search } from "lucide-react";

const tabs = [
  { id: "tree", label: "Stablo", icon: Home },
  { id: "stats", label: "Statistika", icon: BarChart3 },
  { id: "gallery", label: "Galerija", icon: ImageIcon },
  { id: "search", label: "Pretraga", icon: Search },
];

const TabBar = ({ activeTab, onChange }) => (
  <nav className="tabbar">
    <div className="tab-group">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`tab-btn ${activeTab === tab.id ? "is-active" : ""}`}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </div>
  </nav>
);

export default TabBar;



