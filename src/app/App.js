import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getApiErrorMessage } from "../services/api";
import { sanitizePeople } from "../features/tree/tree-model";
import { getVisiblePeople } from "../features/tree/tree-visibility";
import TopBar from "../layout/TopBar";
import TreeView from "../features/tree/TreeView";
import StatsView from "../features/stats/StatsView";
import SearchView from "../features/search/SearchView";
import GalleryView from "../features/gallery/GalleryView";
import PersonModal from "../features/people/PersonModal";
import RelationshipsView from "../features/relationships/RelationshipsView";
import PersonDetailsView from "../features/people/PersonDetailsView";
import ConfirmDialog from "../components/ConfirmDialog";

const FamilyTreeApp = () => {
  const TAB_IDS = ["tree", "stats", "gallery", "search", "relationships", "person"];
  const initialTabResetState = TAB_IDS.reduce((acc, tab) => ({ ...acc, [tab]: 0 }), {});
  const [activeTab, setActiveTab] = useState("tree");
  const [tabResetById, setTabResetById] = useState(initialTabResetState);
  const [families, setFamilies] = useState([]);
  const [activeFamilyId, setActiveFamilyId] = useState(null);
  const [people, setPeople] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagLinks, setTagLinks] = useState([]);
  const [personHealthMap, setPersonHealthMap] = useState({});
  const [relationships, setRelationships] = useState([]);
  const [searchPinnedOnly, setSearchPinnedOnly] = useState(false);
  const [statsPinnedOnly, setStatsPinnedOnly] = useState(false);
  const [galleryPinnedOnly, setGalleryPinnedOnly] = useState(false);
  const [activeTagId, setActiveTagId] = useState(0);
  const [focusPersonId, setFocusPersonId] = useState(null);
  const [expandMode, setExpandMode] = useState("both");
  const [maxDepth, setMaxDepth] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedProfilePersonId, setSelectedProfilePersonId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Potvrdi",
    cancelLabel: "Otkaži",
    isDanger: true,
  });
  const confirmResolverRef = useRef(null);

  const bumpTabReset = useCallback((tabId) => {
    setTabResetById((prev) => ({ ...prev, [tabId]: (prev[tabId] || 0) + 1 }));
  }, []);

  const handleTabChange = useCallback(
    (tab) => {
      if (!tab) return;
      setActiveTab(tab);
      bumpTabReset(tab);
      if (tab === "tree") setSelectedProfilePersonId(null);
    },
    [bumpTabReset]
  );

  const handleBrandClick = useCallback(() => {
    setActiveTab("tree");
    setSelectedProfilePersonId(null);
    bumpTabReset("tree");
  }, [bumpTabReset]);

  const requestConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({
        isOpen: true,
        title: options?.title || "Potvrda",
        message: options?.message || "Jeste li sigurni?",
        confirmLabel: options?.confirmLabel || "Potvrdi",
        cancelLabel: options?.cancelLabel || "Otkaži",
        isDanger: options?.isDanger !== false,
      });
    });
  }, []);

  const closeConfirmDialog = useCallback((result) => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    if (confirmResolverRef.current) {
      confirmResolverRef.current(Boolean(result));
      confirmResolverRef.current = null;
    }
  }, []);

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await api("/api/families");
      setFamilies(data);
      if (data.length > 0 && !activeFamilyId) {
        setActiveFamilyId(data[0].id);
        setExpandMode("all");
        setFocusPersonId(null);
      }
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu uÃ„Âitati porodice."));
    } finally {
      setLoading(false);
    }
  }, [activeFamilyId]);

  const loadPeople = useCallback(async (familyId) => {
    if (!familyId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await api(`/api/people?familyId=${familyId}`);
      const mapped = data.map((p) => ({ ...p, key: p.id }));
      setPeople(sanitizePeople(mapped));
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu uÃ„Âitati osobe."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTags = useCallback(async (familyId) => {
    if (!familyId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await api(`/api/tags?familyId=${familyId}`);
      setTags(data);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu uÃ„Âitati oznake."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTagLinks = useCallback(async (familyId) => {
    if (!familyId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await api(`/api/tag-links?familyId=${familyId}`);
      setTagLinks(data);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu uÃ„Âitati oznake osoba."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRelationships = useCallback(async (familyId) => {
    if (!familyId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await api(`/api/relationships?familyId=${familyId}`);
      setRelationships(data);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu uÃ„Âitati veze."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPersonHealth = useCallback(async (familyId) => {
    if (!familyId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const rows = await api(`/api/person-health?familyId=${familyId}`);
      const nextMap = {};
      rows.forEach((row) => {
        nextMap[row.personId] = row;
      });
      setPersonHealthMap(nextMap);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu uÃ„Âitati zdravstvene podatke."));
    } finally {
      setLoading(false);
    }
  }, []);

  const createTag = useCallback(
    async (name) => {
      if (!activeFamilyId || !name.trim()) return null;
      try {
        const tag = await api("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId: activeFamilyId, name: name.trim() }),
        });
        await loadTags(activeFamilyId);
        return tag;
      } catch (err) {
        setErrorMessage(getApiErrorMessage(err, "Ne mogu dodati oznaku."));
        return null;
      }
    },
    [activeFamilyId, loadTags]
  );

  useEffect(() => {
    loadFamilies();
  }, [loadFamilies]);

  useEffect(() => {
    if (activeFamilyId) loadPeople(activeFamilyId);
  }, [activeFamilyId, loadPeople]);

  useEffect(() => {
    if (activeFamilyId) {
      loadTags(activeFamilyId);
      loadTagLinks(activeFamilyId);
      loadRelationships(activeFamilyId);
      loadPersonHealth(activeFamilyId);
    }
  }, [activeFamilyId, loadTags, loadTagLinks, loadRelationships, loadPersonHealth]);

  const handleFamilyChange = (familyId) => {
    setActiveFamilyId(familyId);
    setExpandMode("all");
    setFocusPersonId(null);
    setActiveTagId(0);
  };

  useEffect(() => {
    if (people.length > 0 && !focusPersonId) {
      setFocusPersonId(people[0].id);
    }
  }, [people, focusPersonId]);

  const addNewPerson = () => {
    if (!activeFamilyId) return;
    setSelectedPerson({
      id: 0,
      key: 0,
      familyId: activeFamilyId,
      name: "",
      gender: "M",
      birthYear: "",
      deathYear: "",
      photo: "",
      bio: "",
      parent: 0,
      parent2: 0,
      spouse: 0,
      divorced: 0,
      isPinned: 0,
      pinColor: "#f59e0b",
    });
    setEditMode(false);
    setShowModal(true);
  };

  const openPersonEditor = (person) => {
    if (!person) return;
    setSelectedPerson(person);
    setEditMode(true);
    setShowModal(true);
  };

  const upsertPerson = async (person) => {
    if (!person) return null;
    const payload = { ...person, familyId: activeFamilyId };
    delete payload.key;

    if (person.id) {
      return api(`/api/people/${person.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    return api("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const updatePersonQuick = async (personId, changes) => {
    if (!activeFamilyId || !personId || !changes) return;
    const base = people.find((p) => p.id === personId);
    if (!base) return;

    try {
      setLoading(true);
      await api(`/api/people/${personId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          ...changes,
          familyId: activeFamilyId,
        }),
      });
      await loadPeople(activeFamilyId);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu ažurirati osobu."));
    } finally {
      setLoading(false);
    }
  };

  const syncSpouse = async (person) => {
    if (!person?.spouse) return;
    const spouse = people.find((p) => p.id === person.spouse);
    if (!spouse) return;
    if (spouse.spouse === person.id) return;
    await api(`/api/people/${spouse.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...spouse,
        spouse: person.id,
        divorced: person.divorced ? 1 : 0,
        familyId: activeFamilyId,
      }),
    });
  };

  const savePerson = async ({ person, tagIds = [], health = {} }) => {
    if (!person) return;
    const isNew = !person.id;
    try {
      setLoading(true);
      const saved = await upsertPerson(person);
      await syncSpouse(saved);
      const personId = saved?.id || person.id;
      if (personId) {
        await api(`/api/people/${personId}/tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId: activeFamilyId, tagIds }),
        });
        await api(`/api/people/${personId}/health`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: activeFamilyId,
            hereditaryConditions: health.hereditaryConditions || "",
            riskFactors: health.riskFactors || "",
            notes: health.notes || "",
          }),
        });
        await loadTagLinks(activeFamilyId);
        await loadPersonHealth(activeFamilyId);
      }
      await loadPeople(activeFamilyId);
      if (isNew && saved?.id) {
        setFocusPersonId(saved.id);
      }
      setShowModal(false);
      setSelectedPerson(null);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu saÃ„Âuvati osobu."));
    } finally {
      setLoading(false);
    }
  };

  const deletePerson = async () => {
    if (!selectedPerson?.id) return;
    const ok = await requestConfirm({
      title: "Obriši osobu",
      message: "Jeste li sigurni da Å¾elite obrisati ovu osobu?",
      confirmLabel: "Obriši",
      isDanger: true,
    });
    if (!ok) return;
    try {
      setLoading(true);
      await api(`/api/people/${selectedPerson.id}`, { method: "DELETE" });
      await loadPeople(activeFamilyId);
      await loadTagLinks(activeFamilyId);
      await loadRelationships(activeFamilyId);
      await loadPersonHealth(activeFamilyId);
      setShowModal(false);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu obrisati osobu."));
    } finally {
      setLoading(false);
    }
  };

  const exportTree = async () => {
    if (!activeFamilyId) return;
    try {
      setLoading(true);
      const payload = await api(`/api/export?familyId=${activeFamilyId}`);
      const dataStr = JSON.stringify(payload, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `porodica-v2-${activeFamilyId}.json`;
      link.click();
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu uraditi export."));
    } finally {
      setLoading(false);
    }
  };

  const importTree = (e) => {
    const file = e.target.files[0];
    if (!file || !activeFamilyId) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        setLoading(true);
        if (Array.isArray(imported)) {
          await api("/api/people/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ familyId: activeFamilyId, people: imported }),
          });
        } else if (imported && String(imported.schemaVersion || "").startsWith("2")) {
          await api("/api/import/v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ familyId: activeFamilyId, payload: imported }),
          });
        } else {
          throw new Error("Neispravan format datoteke.");
        }
        await loadPeople(activeFamilyId);
        await loadTags(activeFamilyId);
        await loadTagLinks(activeFamilyId);
        await loadRelationships(activeFamilyId);
        await loadPersonHealth(activeFamilyId);
      } catch (err) {
        setErrorMessage(
          getApiErrorMessage(err, "Neispravan format datoteke ili nevalidni podaci.")
        );
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const addFamily = async () => {
    if (!newFamilyName.trim()) return;
    try {
      setLoading(true);
      const family = await api("/api/families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFamilyName.trim() }),
      });
      setFamilies((prev) => [family, ...prev]);
      setActiveFamilyId(family.id);
      setNewFamilyName("");
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu kreirati porodicu."));
    } finally {
      setLoading(false);
    }
  };

  const deleteFamily = async () => {
    if (!activeFamilyId) return;
    const ok = await requestConfirm({
      title: "Obriši porodicu",
      message: "Obrisati ovu porodicu i sve njene članove?",
      confirmLabel: "Obriši porodicu",
      isDanger: true,
    });
    if (!ok) return;
    try {
      setLoading(true);
      await api(`/api/families/${activeFamilyId}`, { method: "DELETE" });
      setActiveFamilyId(null);
      setPeople([]);
      setPersonHealthMap({});
      await loadFamilies();
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu obrisati porodicu."));
    } finally {
      setLoading(false);
    }
  };

  const createRelationship = async (payload) => {
    if (!activeFamilyId) return;
    try {
      setLoading(true);
      await api("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, familyId: activeFamilyId }),
      });
      await loadRelationships(activeFamilyId);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu dodati vezu."));
    } finally {
      setLoading(false);
    }
  };

  const updateRelationship = async (relationshipId, payload) => {
    if (!activeFamilyId || !relationshipId) return;
    try {
      setLoading(true);
      await api(`/api/relationships/${relationshipId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, familyId: activeFamilyId }),
      });
      await loadRelationships(activeFamilyId);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu saÃ„Âuvati vezu."));
    } finally {
      setLoading(false);
    }
  };

  const deleteRelationship = async (relationshipId) => {
    if (!relationshipId) return;
    const ok = await requestConfirm({
      title: "Obriši vezu",
      message: "Obrisati ovu vezu?",
      confirmLabel: "Obriši",
      isDanger: true,
    });
    if (!ok) return;
    try {
      setLoading(true);
      await api(`/api/relationships/${relationshipId}`, { method: "DELETE" });
      await loadRelationships(activeFamilyId);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu obrisati vezu."));
    } finally {
      setLoading(false);
    }
  };

  const peopleWithMeta = useMemo(
    () =>
      people.map((person) => {
        const health = personHealthMap[person.id] || {};
        const hereditaryConditions = String(health.hereditaryConditions || "").trim();
        const riskFactors = String(health.riskFactors || "").trim();
        return {
          ...person,
          hereditaryConditions,
          riskFactors,
          healthBadge: hereditaryConditions ? "hereditary" : riskFactors ? "risk" : "",
        };
      }),
    [people, personHealthMap]
  );

  const searchBasePeople = useMemo(
    () => (searchPinnedOnly ? peopleWithMeta.filter((p) => p.isPinned) : peopleWithMeta),
    [peopleWithMeta, searchPinnedOnly]
  );

  const filteredPeople = useMemo(
    () =>
      searchBasePeople.filter((p) =>
        (p.name || "").toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [searchBasePeople, searchTerm]
  );

  const statsSourcePeople = useMemo(
    () => (statsPinnedOnly ? peopleWithMeta.filter((p) => p.isPinned) : peopleWithMeta),
    [peopleWithMeta, statsPinnedOnly]
  );

  const stats = useMemo(() => {
    const living = statsSourcePeople.filter((p) => !p.deathYear).length;
    const deceased = statsSourcePeople.filter((p) => p.deathYear).length;
    const males = statsSourcePeople.filter((p) => p.gender === "M").length;
    const females = statsSourcePeople.filter((p) => p.gender === "F").length;
    return { total: statsSourcePeople.length, living, deceased, males, females };
  }, [statsSourcePeople]);

  const galleryPeople = useMemo(
    () => (galleryPinnedOnly ? peopleWithMeta.filter((p) => p.isPinned) : peopleWithMeta),
    [peopleWithMeta, galleryPinnedOnly]
  );

  const activeFamily = families.find((f) => f.id === activeFamilyId);
  const focusPerson = peopleWithMeta.find((p) => p.id === focusPersonId);

  const tagMap = useMemo(() => {
    const map = new Map();
    tagLinks.forEach((link) => {
      const list = map.get(link.personId) || [];
      list.push(link.tagId);
      map.set(link.personId, list);
    });
    return map;
  }, [tagLinks]);

  const filterPeopleByTag = useCallback(
    (list) => {
      if (!activeTagId) return list;
      const tagged = new Set(
        tagLinks.filter((link) => link.tagId === activeTagId).map((link) => link.personId)
      );
      if (tagged.size === 0) return [];

      const byId = new Map(list.map((p) => [p.id, p]));
      const childrenByParent = new Map();
      list.forEach((p) => {
        if (p.parent) {
          if (!childrenByParent.has(p.parent)) childrenByParent.set(p.parent, []);
          childrenByParent.get(p.parent).push(p.id);
        }
        if (p.parent2) {
          if (!childrenByParent.has(p.parent2)) childrenByParent.set(p.parent2, []);
          childrenByParent.get(p.parent2).push(p.id);
        }
      });

      const include = new Set(tagged);
      Array.from(tagged).forEach((id) => {
        const person = byId.get(id);
        if (!person) return;
        if (person.parent) include.add(person.parent);
        if (person.parent2) include.add(person.parent2);
        if (person.spouse) include.add(person.spouse);
        const kids = childrenByParent.get(id) || [];
        kids.forEach((kid) => include.add(kid));
      });

      return list.filter((p) => include.has(p.id));
    },
    [activeTagId, tagLinks]
  );

  const visiblePeople = useMemo(() => {
    const basePeople = filterPeopleByTag(peopleWithMeta);
    return getVisiblePeople(basePeople, focusPersonId, expandMode, maxDepth);
  }, [filterPeopleByTag, peopleWithMeta, focusPersonId, expandMode, maxDepth]);

  return (
    <div className="app-shell">
      <TopBar
        onAddPerson={addNewPerson}
        onImport={importTree}
        onExport={exportTree}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onBrandClick={handleBrandClick}
      />

      <main className="content">
        {errorMessage && <div className="alert">{errorMessage}</div>}
        {loading && <div className="loading">UÃ„Âitavanje...</div>}

        {activeTab === "tree" && (
          <TreeView
            key={`tree-${tabResetById.tree || 0}-${activeFamilyId || 0}`}
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
            newFamilyName={newFamilyName}
            onNewFamilyNameChange={setNewFamilyName}
            onAddFamily={addFamily}
            onDeleteFamily={deleteFamily}
            activeFamily={activeFamily}
            stats={stats}
            people={peopleWithMeta}
            visiblePeople={visiblePeople}
            focusPersonId={focusPersonId}
            onFocusChange={setFocusPersonId}
            focusPerson={focusPerson}
            expandMode={expandMode}
            onExpandModeChange={setExpandMode}
            maxDepth={maxDepth}
            onMaxDepthChange={setMaxDepth}
            tags={tags}
            activeTagId={activeTagId}
            onTagChange={setActiveTagId}
            onAddPerson={addNewPerson}
            onImport={importTree}
            onExport={exportTree}
            onOpenPersonDetails={(person) => {
              if (!person?.id) return;
              setSelectedProfilePersonId(person.id);
              setActiveTab("person");
            }}
            onEditPerson={(person) => {
              openPersonEditor(person);
            }}
          />
        )}

        {activeTab === "person" && (
          <PersonDetailsView
            key={`person-${tabResetById.person || 0}-${selectedProfilePersonId || 0}`}
            personId={selectedProfilePersonId}
            people={peopleWithMeta}
            tags={tags}
            tagLinks={tagLinks}
            personHealthMap={personHealthMap}
            relationships={relationships}
            activeFamilyId={activeFamilyId}
            onBackToTree={() => {
              setActiveTab("tree");
              setSelectedProfilePersonId(null);
            }}
            onEditPerson={openPersonEditor}
          />
        )}

        {activeTab === "stats" && (
          <StatsView
            key={`stats-${tabResetById.stats || 0}-${activeFamilyId || 0}`}
            stats={stats}
            people={statsSourcePeople}
            pinnedOnly={statsPinnedOnly}
            onPinnedOnlyChange={setStatsPinnedOnly}
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
            activeFamily={activeFamily}
          />
        )}

        {activeTab === "search" && (
          <SearchView
            key={`search-${tabResetById.search || 0}-${activeFamilyId || 0}`}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            pinnedOnly={searchPinnedOnly}
            onPinnedOnlyChange={setSearchPinnedOnly}
            filteredPeople={filteredPeople}
            onSelectPerson={openPersonEditor}
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
          />
        )}

        {activeTab === "gallery" && (
          <GalleryView
            key={`gallery-${tabResetById.gallery || 0}-${activeFamilyId || 0}`}
            people={galleryPeople}
            pinnedOnly={galleryPinnedOnly}
            onPinnedOnlyChange={setGalleryPinnedOnly}
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
            tags={tags}
            tagLinks={tagLinks}
            onOpenPersonDetails={(person) => {
              if (!person?.id) return;
              setSelectedProfilePersonId(person.id);
              setActiveTab("person");
            }}
            onTogglePin={(person) =>
              updatePersonQuick(person.id, { isPinned: person.isPinned ? 0 : 1 })
            }
            onReplacePhoto={(person, photo) =>
              updatePersonQuick(person.id, { photo: photo || "" })
            }
            onRemovePhoto={(person) => updatePersonQuick(person.id, { photo: "" })}
            onRequestConfirm={requestConfirm}
          />
        )}

        {activeTab === "relationships" && (
          <RelationshipsView
            key={`relationships-${tabResetById.relationships || 0}-${activeFamilyId || 0}`}
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
            people={peopleWithMeta}
            relationships={relationships}
            onCreateRelationship={createRelationship}
            onUpdateRelationship={updateRelationship}
            onDeleteRelationship={deleteRelationship}
            onReloadRelationships={() => loadRelationships(activeFamilyId)}
          />
        )}
      </main>

      <PersonModal
        isOpen={showModal}
        person={selectedPerson}
        people={peopleWithMeta}
        tags={tags}
        selectedTagIds={selectedPerson ? tagMap.get(selectedPerson.id) || [] : []}
        personHealth={selectedPerson ? personHealthMap[selectedPerson.id] || null : null}
        onCreateTag={createTag}
        editMode={editMode}
        onClose={() => setShowModal(false)}
        onSave={savePerson}
        onDelete={deletePerson}
        onChange={setSelectedPerson}
      />
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        isDanger={confirmDialog.isDanger}
        onConfirm={() => closeConfirmDialog(true)}
        onCancel={() => closeConfirmDialog(false)}
      />
    </div>
  );
};

export default FamilyTreeApp;










