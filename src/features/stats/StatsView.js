import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers, ChevronDown, X } from "lucide-react";
import { api, getApiErrorMessage } from "../../services/api";

const safeYear = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getSurname = (name = "") => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const avg = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
};

const buildCompareStats = (people) => {
  const list = Array.isArray(people) ? people : [];
  const now = new Date().getFullYear();
  const agesLiving = [];
  const childrenByParent = new Map();

  list.forEach((person) => {
    const birth = safeYear(person.birthYear);
    const isDeceased = Boolean(safeYear(person.deathYear));
    if (birth && !isDeceased) {
      const age = now - birth;
      if (age >= 0 && age <= 130) agesLiving.push(age);
    }
    const p1 = Number(person.parent || 0);
    const p2 = Number(person.parent2 || 0);
    if (p1) childrenByParent.set(p1, (childrenByParent.get(p1) || 0) + 1);
    if (p2) childrenByParent.set(p2, (childrenByParent.get(p2) || 0) + 1);
  });

  return {
    total: list.length,
    living: list.filter((p) => !p.deathYear).length,
    deceased: list.filter((p) => Boolean(p.deathYear)).length,
    pinned: list.filter((p) => Boolean(p.isPinned)).length,
    withPhoto: list.filter((p) => String(p.photo || "").trim()).length,
    maxChildren: list.reduce((max, p) => Math.max(max, childrenByParent.get(p.id) || 0), 0),
    avgLivingAge: avg(agesLiving),
  };
};

const StatsView = ({
  stats,
  people,
  pinnedOnly,
  onPinnedOnlyChange,
  families,
  activeFamilyId,
  onFamilyChange,
  activeFamily: _activeFamily,
}) => {
  const [compareFamilyId, setCompareFamilyId] = useState(0);
  const [comparePeopleRaw, setComparePeopleRaw] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [openDropdown, setOpenDropdown] = useState("");
  const [drilldown, setDrilldown] = useState({ isOpen: false, title: "", people: [] });
  const dropdownRootRef = useRef(null);

  useEffect(() => {
    setCompareFamilyId(0);
    setComparePeopleRaw([]);
    setCompareError("");
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

  useEffect(() => {
    const targetId = Number(compareFamilyId || 0);
    if (!targetId || targetId === Number(activeFamilyId || 0)) {
      setComparePeopleRaw([]);
      setCompareError("");
      return;
    }

    let cancelled = false;
    const loadComparePeople = async () => {
      setCompareLoading(true);
      setCompareError("");
      try {
        const rows = await api(`/api/people?familyId=${targetId}`);
        if (!cancelled) setComparePeopleRaw(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (!cancelled) {
          setComparePeopleRaw([]);
          setCompareError(getApiErrorMessage(err, "Ne mogu ucitati porodicu za poredjenje."));
        }
      } finally {
        if (!cancelled) setCompareLoading(false);
      }
    };

    loadComparePeople();
    return () => {
      cancelled = true;
    };
  }, [compareFamilyId, activeFamilyId]);

  const detailed = useMemo(() => {
    const now = new Date().getFullYear();
    const list = Array.isArray(people) ? people : [];

    let males = 0;
    let females = 0;
    let unknownGender = 0;
    let living = 0;
    let deceased = 0;
    let pinned = 0;
    let withSpouse = 0;
    let divorced = 0;
    let withPhoto = 0;
    let withBio = 0;
    let withBothParents = 0;
    let withOneParent = 0;
    let withNoParents = 0;
    let hereditaryRisk = 0;
    let riskFactors = 0;

    const agesLiving = [];
    const lifespans = [];
    const birthYears = [];
    const deathYears = [];
    const surnameMap = new Map();
    const decadeMap = new Map();
    const childrenByParent = new Map();

    list.forEach((person) => {
      const gender = String(person.gender || "").toUpperCase();
      if (gender === "M") males += 1;
      else if (gender === "F") females += 1;
      else unknownGender += 1;

      const birth = safeYear(person.birthYear);
      const death = safeYear(person.deathYear);

      if (birth) {
        birthYears.push(birth);
        const decade = `${Math.floor(birth / 10) * 10}s`;
        decadeMap.set(decade, (decadeMap.get(decade) || 0) + 1);
      }
      if (death) deathYears.push(death);

      if (death) deceased += 1;
      else living += 1;

      if (birth && !death) {
        const age = now - birth;
        if (age >= 0 && age <= 130) agesLiving.push(age);
      }
      if (birth && death) {
        const life = death - birth;
        if (life >= 0 && life <= 130) lifespans.push(life);
      }

      if (person.isPinned) pinned += 1;
      if (Number(person.spouse || 0) > 0) withSpouse += 1;
      if (Number(person.divorced || 0) > 0) divorced += 1;
      if (String(person.photo || "").trim()) withPhoto += 1;
      if (String(person.bio || "").trim()) withBio += 1;
      if (person.healthBadge === "hereditary") hereditaryRisk += 1;
      if (person.healthBadge === "risk") riskFactors += 1;

      const p1 = Number(person.parent || 0);
      const p2 = Number(person.parent2 || 0);
      const parentCount = (p1 ? 1 : 0) + (p2 ? 1 : 0);
      if (parentCount === 2) withBothParents += 1;
      else if (parentCount === 1) withOneParent += 1;
      else withNoParents += 1;

      if (p1) childrenByParent.set(p1, (childrenByParent.get(p1) || 0) + 1);
      if (p2) childrenByParent.set(p2, (childrenByParent.get(p2) || 0) + 1);

      const name = String(person.name || "").trim();
      if (name) {
        const surname = name.split(/\s+/).slice(-1)[0].toLowerCase();
        if (surname) surnameMap.set(surname, (surnameMap.get(surname) || 0) + 1);
      }
    });

    const roots = withNoParents;
    const leaves = list.filter((p) => !childrenByParent.get(p.id)).length;
    const maxChildren = list.reduce(
      (max, p) => Math.max(max, childrenByParent.get(p.id) || 0),
      0
    );

    const oldestLiving = agesLiving.length ? Math.max(...agesLiving) : 0;
    const youngestLiving = agesLiving.length ? Math.min(...agesLiving) : 0;
    const avgLivingAge = avg(agesLiving);
    const avgLifespan = avg(lifespans);

    const earliestBirth = birthYears.length ? Math.min(...birthYears) : null;
    const latestBirth = birthYears.length ? Math.max(...birthYears) : null;
    const earliestDeath = deathYears.length ? Math.min(...deathYears) : null;
    const latestDeath = deathYears.length ? Math.max(...deathYears) : null;

    const ageBuckets = [
      { label: "0-17", value: 0 },
      { label: "18-29", value: 0 },
      { label: "30-44", value: 0 },
      { label: "45-59", value: 0 },
      { label: "60-74", value: 0 },
      { label: "75+", value: 0 },
    ];
    agesLiving.forEach((age) => {
      if (age <= 17) ageBuckets[0].value += 1;
      else if (age <= 29) ageBuckets[1].value += 1;
      else if (age <= 44) ageBuckets[2].value += 1;
      else if (age <= 59) ageBuckets[3].value += 1;
      else if (age <= 74) ageBuckets[4].value += 1;
      else ageBuckets[5].value += 1;
    });

    const topSurnames = Array.from(surnameMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const topParents = list
      .map((p) => ({ name: p.name || "Bez imena", count: childrenByParent.get(p.id) || 0 }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const decadeRows = Array.from(decadeMap.entries())
      .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10));

    return {
      total: list.length,
      living,
      deceased,
      males,
      females,
      unknownGender,
      pinned,
      withSpouse,
      divorced,
      withPhoto,
      withBio,
      withBothParents,
      withOneParent,
      withNoParents,
      hereditaryRisk,
      riskFactors,
      roots,
      leaves,
      maxChildren,
      oldestLiving,
      youngestLiving,
      avgLivingAge,
      avgLifespan,
      earliestBirth,
      latestBirth,
      earliestDeath,
      latestDeath,
      ageBuckets,
      topSurnames,
      topParents,
      decadeRows,
    };
  }, [people]);

  const genderBase = detailed.males + detailed.females + detailed.unknownGender;
  const malePct = genderBase ? (detailed.males / genderBase) * 100 : 0;
  const femalePct = genderBase ? (detailed.females / genderBase) * 100 : 0;
  const unknownPct = genderBase ? (detailed.unknownGender / genderBase) * 100 : 0;
  const livingBase = detailed.living + detailed.deceased;
  const livingPct = livingBase ? (detailed.living / livingBase) * 100 : 0;
  const deceasedPct = livingBase ? (detailed.deceased / livingBase) * 100 : 0;

  const maxAgeBucket = Math.max(1, ...detailed.ageBuckets.map((row) => row.value || 0));
  const maxDecade = Math.max(1, ...detailed.decadeRows.map((row) => row[1] || 0));

  const genderDonutStyle = {
    background: `conic-gradient(#2563eb 0 ${malePct}%, #db2777 ${malePct}% ${malePct + femalePct}%, #94a3b8 ${malePct + femalePct}% 100%)`,
  };

  const livingDonutStyle = {
    background: `conic-gradient(#22c55e 0 ${livingPct}%, #ef4444 ${livingPct}% 100%)`,
  };

  const primaryKpis = [
    { label: "Ukupno clanova", value: detailed.total },
    { label: "Zivi", value: detailed.living },
    { label: "Preminuli", value: detailed.deceased },
    { label: "Pinovani", value: detailed.pinned },
    { label: "Prosjecna dob (zivi)", value: `${detailed.avgLivingAge.toFixed(1)} g` },
    { label: "Maks djece po osobi", value: detailed.maxChildren },
  ];

  const secondaryKpis = [
    { label: "Korijenski cvorovi", value: detailed.roots },
    { label: "List cvorovi", value: detailed.leaves },
    { label: "Najstariji zivi", value: detailed.oldestLiving ? `${detailed.oldestLiving} g` : "-" },
    { label: "Najmladji zivi", value: detailed.youngestLiving ? `${detailed.youngestLiving} g` : "-" },
    { label: "Prosjecni zivotni vijek", value: `${detailed.avgLifespan.toFixed(1)} g` },
    { label: "Najranije rođenje", value: detailed.earliestBirth || "-" },
    { label: "Najkasnije rođenje", value: detailed.latestBirth || "-" },
    { label: "Najranija smrt", value: detailed.earliestDeath || "-" },
    { label: "Najkasnija smrt", value: detailed.latestDeath || "-" },
    { label: "Nasljedni rizik", value: detailed.hereditaryRisk },
    { label: "Rizični faktori", value: detailed.riskFactors },
  ];

  const compareFamilies = useMemo(
    () => (families || []).filter((family) => Number(family.id) !== Number(activeFamilyId || 0)),
    [families, activeFamilyId]
  );

  const compareFamily = useMemo(
    () => (families || []).find((family) => Number(family.id) === Number(compareFamilyId || 0)) || null,
    [families, compareFamilyId]
  );

  const comparePeople = useMemo(
    () => (pinnedOnly ? comparePeopleRaw.filter((p) => p.isPinned) : comparePeopleRaw),
    [comparePeopleRaw, pinnedOnly]
  );

  const currentCompare = useMemo(() => buildCompareStats(people), [people]);
  const otherCompare = useMemo(() => buildCompareStats(comparePeople), [comparePeople]);

  const compareRows = useMemo(
    () => [
      { key: "total", label: "Ukupno clanova", decimals: 0 },
      { key: "living", label: "Zivi", decimals: 0 },
      { key: "deceased", label: "Preminuli", decimals: 0 },
      { key: "pinned", label: "Pinovani", decimals: 0 },
      { key: "withPhoto", label: "Sa fotografijom", decimals: 0 },
      { key: "maxChildren", label: "Maks djece po osobi", decimals: 0 },
      { key: "avgLivingAge", label: "Prosjecna dob (zivi)", decimals: 1, suffix: " g" },
    ],
    []
  );

  const peopleList = useMemo(() => (Array.isArray(people) ? people : []), [people]);

  const surnameMembersMap = useMemo(() => {
    const map = new Map();
    peopleList.forEach((person) => {
      const surname = getSurname(person.name || "");
      if (!surname) return;
      const key = surname.toLowerCase();
      const next = map.get(key) || [];
      next.push(person);
      map.set(key, next);
    });
    return map;
  }, [peopleList]);

  const childrenByParentMap = useMemo(() => {
    const map = new Map();
    peopleList.forEach((person) => {
      const p1 = Number(person.parent || 0);
      const p2 = Number(person.parent2 || 0);
      if (p1) map.set(p1, (map.get(p1) || 0) + 1);
      if (p2) map.set(p2, (map.get(p2) || 0) + 1);
    });
    return map;
  }, [peopleList]);

  const decadeMembersMap = useMemo(() => {
    const map = new Map();
    peopleList.forEach((person) => {
      const birth = safeYear(person.birthYear);
      if (!birth) return;
      const decade = `${Math.floor(birth / 10) * 10}s`;
      const next = map.get(decade) || [];
      next.push(person);
      map.set(decade, next);
    });
    return map;
  }, [peopleList]);

  const openDrilldown = (title, list) => {
    const sorted = [...(Array.isArray(list) ? list : [])].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
    setDrilldown({ isOpen: true, title, people: sorted });
  };

  const selectedFamilyLabel = useMemo(() => {
    const selected = (families || []).find((family) => Number(family.id) === Number(activeFamilyId));
    return selected?.name || "Bez porodice";
  }, [families, activeFamilyId]);

  const selectedCompareLabel = useMemo(() => {
    if (!compareFamilyId) return "Bez poredjenja";
    const selected = (families || []).find((family) => Number(family.id) === Number(compareFamilyId));
    return selected?.name || "Bez poredjenja";
  }, [families, compareFamilyId]);

  return (
    <div className="panel page stats-page" ref={dropdownRootRef}>
      <div className="stats-head">
        <div className="stats-head-title">
          <h2>Statistika porodice</h2>
        </div>
        <div className="stats-head-controls">
          <div className="family-select compact stats-family-dropdown">
            <Layers className="w-4 h-4" />
            <div className="stats-dropdown">
              <button
                type="button"
                className="stats-dropdown-trigger"
                aria-label="Aktivna porodica"
                aria-haspopup="listbox"
                aria-expanded={openDropdown === "family"}
                onClick={() => setOpenDropdown((prev) => (prev === "family" ? "" : "family"))}
              >
                <span>{selectedFamilyLabel}</span>
                <ChevronDown className={`stats-dropdown-chevron ${openDropdown === "family" ? "is-open" : ""}`} />
              </button>
              {openDropdown === "family" && (
                <div className="stats-dropdown-menu" role="listbox" aria-label="Porodice opcije">
                  {(families || []).map((family) => (
                    <button
                      key={family.id}
                      type="button"
                      role="option"
                      aria-selected={Number(activeFamilyId) === Number(family.id)}
                      className={`stats-dropdown-option ${
                        Number(activeFamilyId) === Number(family.id) ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        onFamilyChange(Number(family.id));
                        setOpenDropdown("");
                      }}
                    >
                      {family.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="stats-compare-picker stats-compare-picker-inline">
            <span>Poredi sa:</span>
            <div className="stats-dropdown stats-dropdown-compact">
              <button
                type="button"
                className="stats-dropdown-trigger stats-dropdown-trigger-compact"
                aria-label="Poredi sa porodicom"
                aria-haspopup="listbox"
                aria-expanded={openDropdown === "compare"}
                onClick={() => setOpenDropdown((prev) => (prev === "compare" ? "" : "compare"))}
              >
                <span>{selectedCompareLabel}</span>
                <ChevronDown className={`stats-dropdown-chevron ${openDropdown === "compare" ? "is-open" : ""}`} />
              </button>
              {openDropdown === "compare" && (
                <div className="stats-dropdown-menu" role="listbox" aria-label="Poredjenje opcije">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!compareFamilyId}
                    className={`stats-dropdown-option ${!compareFamilyId ? "is-selected" : ""}`}
                    onClick={() => {
                      setCompareFamilyId(0);
                      setOpenDropdown("");
                    }}
                  >
                    Bez poredjenja
                  </button>
                  {compareFamilies.map((family) => (
                    <button
                      key={family.id}
                      type="button"
                      role="option"
                      aria-selected={Number(compareFamilyId) === Number(family.id)}
                      className={`stats-dropdown-option ${
                        Number(compareFamilyId) === Number(family.id) ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        setCompareFamilyId(Number(family.id));
                        setOpenDropdown("");
                      }}
                    >
                      {family.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={Boolean(pinnedOnly)}
              onChange={(e) => onPinnedOnlyChange(e.target.checked)}
            />
            <span>Samo pinovani</span>
          </label>
        </div>
      </div>

      <div className="card stats-kpi-panel">
        <div className="stats-kpi-panel-head">
          <h3>Osnovna statistika</h3>
          <span className="stats-kpi-total">{detailed.total} clanova</span>
        </div>

        <div className="stats-cards stats-cards-primary">
          {primaryKpis.map((item) => (
            <div className="stat-card stat-card-primary" key={item.label}>
              <p className="stat-label">{item.label}</p>
              <p className="stat-value">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="stats-cards stats-cards-secondary">
          {secondaryKpis.map((item) => (
            <div className="stat-card stat-card-secondary" key={item.label}>
              <p className="stat-label">{item.label}</p>
              <p className="stat-value">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {(Boolean(compareFamilyId) || compareLoading || Boolean(compareError)) && (
        <div className="card stats-compare-panel">
          <div className="stats-compare-head">
            <h3>Poredjenje porodica</h3>
          </div>
          {compareLoading && <p className="muted-text">Ucitavanje poredjenja...</p>}
          {compareError && <p className="muted-text" style={{ color: "#b91c1c" }}>{compareError}</p>}

          {Boolean(compareFamilyId) && !compareLoading && !compareError && (
            <div className="stats-compare-grid">
              <div className="stats-compare-row stats-compare-head-row">
                <span>Metrika</span>
                <span>Aktivna</span>
                <span>{compareFamily?.name || "Druga porodica"}</span>
                <span>Razlika</span>
              </div>
              {compareRows.map((row) => {
                const decimals = row.decimals || 0;
                const currentValue = Number(currentCompare[row.key] || 0);
                const otherValue = Number(otherCompare[row.key] || 0);
                const delta = currentValue - otherValue;
                const suffix = row.suffix || "";
                const format = (val) => `${val.toFixed(decimals)}${suffix}`;
                return (
                  <div key={row.key} className="stats-compare-row">
                    <span>{row.label}</span>
                    <span>{format(currentValue)}</span>
                    <span>{format(otherValue)}</span>
                    <span className={delta > 0 ? "stats-delta-pos" : delta < 0 ? "stats-delta-neg" : ""}>
                      {(delta > 0 ? "+" : "") + format(delta)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="stats-grid-2">
        <div className="card chart-card">
          <h3>Polna struktura (prsten)</h3>
          <div className="donut-wrap">
            <div className="donut-chart" style={genderDonutStyle}>
              <div className="donut-hole">
                <strong>{genderBase}</strong>
                <small>ukupno</small>
              </div>
            </div>
            <div className="donut-legend">
              <div className="legend-item"><span className="dot blue" /> Muško {malePct.toFixed(1)}%</div>
              <div className="legend-item"><span className="dot pink" /> Žensko {femalePct.toFixed(1)}%</div>
              <div className="legend-item"><span className="dot gray" /> Nepoznato {unknownPct.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div className="card chart-card">
          <h3>Zivi vs preminuli</h3>
          <div className="donut-wrap">
            <div className="donut-chart" style={livingDonutStyle}>
              <div className="donut-hole">
                <strong>{livingBase}</strong>
                <small>ukupno</small>
              </div>
            </div>
            <div className="donut-legend">
              <div className="legend-item"><span className="dot green" /> Zivi {livingPct.toFixed(1)}%</div>
              <div className="legend-item"><span className="dot red" /> Preminuli {deceasedPct.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card chart-card">
        <h3>Dobne grupe (zivi)</h3>
        <div className="dist-chart">
          {detailed.ageBuckets.map((row) => (
            <div key={row.label} className="dist-row">
              <span className="dist-label">{row.label}</span>
              <div className="dist-track">
                <div className="dist-fill blue" style={{ width: `${(row.value / maxAgeBucket) * 100}%` }} />
              </div>
              <strong className="dist-value">{row.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-grid-2">
        <div className="card chart-card">
          <h3>Top prezimena</h3>
          <div className="list compact-list">
            {detailed.topSurnames.length === 0 && <p className="muted-text">Nema podataka.</p>}
            {detailed.topSurnames.map((row) => (
              <button
                type="button"
                className="list-item stats-clickable-row"
                key={row.name}
                onClick={() => {
                  const members = surnameMembersMap.get(String(row.name || "").toLowerCase()) || [];
                  openDrilldown(`Prezime: ${row.name}`, members);
                }}
              >
                <h4>{row.name}</h4>
                <span className="pill blue">{row.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card chart-card">
          <h3>Top roditelji po broju djece</h3>
          <div className="list compact-list">
            {detailed.topParents.length === 0 && <p className="muted-text">Nema podataka.</p>}
            {detailed.topParents.map((row) => (
              <button
                type="button"
                className="list-item stats-clickable-row"
                key={`${row.name}-${row.count}`}
                onClick={() => {
                  const members = peopleList.filter(
                    (person) =>
                      person.name === row.name &&
                      (childrenByParentMap.get(Number(person.id || 0)) || 0) === Number(row.count || 0)
                  );
                  openDrilldown(`Roditelj: ${row.name}`, members);
                }}
              >
                <h4>{row.name}</h4>
                <span className="pill pink">{row.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card chart-card">
        <h3>Rođenja po decenijama</h3>
        <div className="dist-chart">
          {detailed.decadeRows.length === 0 && <p className="muted-text">Nema podataka.</p>}
          {detailed.decadeRows.map(([decade, count]) => (
            <button
              type="button"
              className="dist-row stats-clickable-row stats-clickable-dist"
              key={decade}
              onClick={() => {
                const members = decadeMembersMap.get(decade) || [];
                openDrilldown(`Rođeni u ${decade}`, members);
              }}
            >
              <span className="dist-label">{decade}</span>
              <div className="dist-track">
                <div className="dist-fill pink" style={{ width: `${(count / maxDecade) * 100}%` }} />
              </div>
              <strong className="dist-value">{count}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="card chart-card">
        <h3>Brzi sažetak</h3>
        <p className="muted-text">
          Ukupno {detailed.total} osoba, od toga {detailed.living} zivih i {detailed.deceased} preminulih. Najsira poznata
          generacija ide od {detailed.earliestBirth || "-"} do {detailed.latestBirth || "-"}.
        </p>
      </div>
      {drilldown.isOpen && (
        <div
          className="stats-drilldown-backdrop"
          onClick={() => setDrilldown({ isOpen: false, title: "", people: [] })}
        >
          <div className="stats-drilldown-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stats-drilldown-head">
              <h3>{drilldown.title}</h3>
              <button
                type="button"
                className="btn-icon"
                aria-label="Zatvori"
                onClick={() => setDrilldown({ isOpen: false, title: "", people: [] })}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="stats-drilldown-list">
              {drilldown.people.length === 0 ? (
                <p className="muted-text">Nema podataka.</p>
              ) : (
                drilldown.people.map((person) => (
                  <div key={`dd-${person.id}`} className="stats-drilldown-item">
                    <span>{person.name || "Bez imena"}</span>
                    <small>
                      {person.birthYear || "?"}
                      {person.deathYear ? ` - ${person.deathYear}` : ""}
                    </small>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsView;


