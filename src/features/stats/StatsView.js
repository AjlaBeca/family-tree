import React, { useMemo } from "react";
import { Layers } from "lucide-react";

const safeYear = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const avg = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
};

const StatsView = ({
  stats,
  people,
  pinnedOnly,
  onPinnedOnlyChange,
  families,
  activeFamilyId,
  onFamilyChange,
  activeFamily,
}) => {
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

  const kpis = [
    { label: "Ukupno clanova", value: detailed.total },
    { label: "Zivi", value: detailed.living },
    { label: "Preminuli", value: detailed.deceased },
    { label: "Pinovani", value: detailed.pinned },
    { label: "Korijenski cvorovi", value: detailed.roots },
    { label: "List cvorovi", value: detailed.leaves },
    { label: "Maks djece po osobi", value: detailed.maxChildren },
    { label: "Najstariji zivi", value: detailed.oldestLiving ? `${detailed.oldestLiving} g` : "-" },
    { label: "Najmladji zivi", value: detailed.youngestLiving ? `${detailed.youngestLiving} g` : "-" },
    { label: "Prosjecna dob (zivi)", value: `${detailed.avgLivingAge.toFixed(1)} g` },
    { label: "Prosjecni zivotni vijek", value: `${detailed.avgLifespan.toFixed(1)} g` },
    { label: "Najranije rođenje", value: detailed.earliestBirth || "-" },
    { label: "Najkasnije rođenje", value: detailed.latestBirth || "-" },
    { label: "Najranija smrt", value: detailed.earliestDeath || "-" },
    { label: "Najkasnija smrt", value: detailed.latestDeath || "-" },
    { label: "Nasljedni rizik", value: detailed.hereditaryRisk },
    { label: "Rizični faktori", value: detailed.riskFactors },
  ];

  return (
    <div className="panel page stats-page">
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
        <label className="inline-check">
          <input
            type="checkbox"
            checked={Boolean(pinnedOnly)}
            onChange={(e) => onPinnedOnlyChange(e.target.checked)}
          />
          <span>Samo pinovani</span>
        </label>
      </div>

      <div className="stats-cards">
        {kpis.map((item) => (
          <div className="card stat-card" key={item.label}>
            <p className="stat-label">{item.label}</p>
            <p className="stat-value">{item.value}</p>
          </div>
        ))}
      </div>

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
              <div className="list-item" key={row.name}>
                <h4>{row.name}</h4>
                <span className="pill blue">{row.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card chart-card">
          <h3>Top roditelji po broju djece</h3>
          <div className="list compact-list">
            {detailed.topParents.length === 0 && <p className="muted-text">Nema podataka.</p>}
            {detailed.topParents.map((row) => (
              <div className="list-item" key={`${row.name}-${row.count}`}>
                <h4>{row.name}</h4>
                <span className="pill pink">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card chart-card">
        <h3>Rođenja po decenijama</h3>
        <div className="dist-chart">
          {detailed.decadeRows.length === 0 && <p className="muted-text">Nema podataka.</p>}
          {detailed.decadeRows.map(([decade, count]) => (
            <div className="dist-row" key={decade}>
              <span className="dist-label">{decade}</span>
              <div className="dist-track">
                <div className="dist-fill pink" style={{ width: `${(count / maxDecade) * 100}%` }} />
              </div>
              <strong className="dist-value">{count}</strong>
            </div>
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
    </div>
  );
};

export default StatsView;

