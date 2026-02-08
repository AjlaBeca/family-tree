import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "../services/api";
import { sanitizePeople } from "../features/tree/tree-model";
import { getVisiblePeople } from "../features/tree/tree-visibility";
import TopBar from "../layout/TopBar";
import TreeView from "../features/tree/TreeView";
import StatsView from "../features/stats/StatsView";
import SearchView from "../features/search/SearchView";
import GalleryView from "../features/gallery/GalleryView";
import PersonModal from "../features/people/PersonModal";

const FamilyTreeApp = () => {
  const [activeTab, setActiveTab] = useState("tree");
  const [families, setFamilies] = useState([]);
  const [activeFamilyId, setActiveFamilyId] = useState(null);
  const [people, setPeople] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagLinks, setTagLinks] = useState([]);
  const [activeTagId, setActiveTagId] = useState(0);
  const [focusPersonId, setFocusPersonId] = useState(null);
  const [expandMode, setExpandMode] = useState("both");
  const [maxDepth, setMaxDepth] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
      setErrorMessage(getApiErrorMessage(err, "Ne mogu učitati porodice."));
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
      setErrorMessage(getApiErrorMessage(err, "Ne mogu učitati osobe."));
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
      setErrorMessage(getApiErrorMessage(err, "Ne mogu učitati oznake."));
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
      setErrorMessage(getApiErrorMessage(err, "Ne mogu učitati oznake osoba."));
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
    }
  }, [activeFamilyId, loadTags, loadTagLinks]);

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
    });
    setEditMode(false);
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

  const savePerson = async ({ person, tagIds = [] }) => {
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
        await loadTagLinks(activeFamilyId);
      }
      await loadPeople(activeFamilyId);
      if (isNew && saved?.id) {
        setFocusPersonId(saved.id);
      }
      setShowModal(false);
      setSelectedPerson(null);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu sačuvati osobu."));
    } finally {
      setLoading(false);
    }
  };

  const deletePerson = async () => {
    if (!selectedPerson?.id) return;
    if (window.confirm("Jeste li sigurni da želite obrisati ovu osobu?")) {
      try {
        setLoading(true);
        await api(`/api/people/${selectedPerson.id}`, { method: "DELETE" });
        await loadPeople(activeFamilyId);
        await loadTagLinks(activeFamilyId);
        setShowModal(false);
      } catch (err) {
        setErrorMessage(getApiErrorMessage(err, "Ne mogu obrisati osobu."));
      } finally {
        setLoading(false);
      }
    }
  };

  const exportTree = () => {
    const dataStr = JSON.stringify(people, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `porodica-${activeFamilyId || "sve"}.json`;
    link.click();
  };

  const importTree = (e) => {
    const file = e.target.files[0];
    if (!file || !activeFamilyId) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!Array.isArray(imported)) throw new Error("Neispravan format datoteke");
        await api("/api/people/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId: activeFamilyId, people: imported }),
        });
        await loadPeople(activeFamilyId);
      } catch {
        alert("Neispravan format datoteke");
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
    if (!window.confirm("Obrisati ovu porodicu i sve njene članove?")) return;
    try {
      setLoading(true);
      await api(`/api/families/${activeFamilyId}`, { method: "DELETE" });
      setActiveFamilyId(null);
      setPeople([]);
      await loadFamilies();
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Ne mogu obrisati porodicu."));
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const living = people.filter((p) => !p.deathYear).length;
    const deceased = people.filter((p) => p.deathYear).length;
    const males = people.filter((p) => p.gender === "M").length;
    const females = people.filter((p) => p.gender === "F").length;
    return { total: people.length, living, deceased, males, females };
  }, [people]);

  const filteredPeople = useMemo(
    () => people.filter((p) => (p.name || "").toLowerCase().includes(searchTerm.toLowerCase())),
    [people, searchTerm]
  );

  const activeFamily = families.find((f) => f.id === activeFamilyId);
  const focusPerson = people.find((p) => p.id === focusPersonId);

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
    const basePeople = filterPeopleByTag(people);
    return getVisiblePeople(basePeople, focusPersonId, expandMode, maxDepth);
  }, [filterPeopleByTag, people, focusPersonId, expandMode, maxDepth]);

  return (
    <div className="app-shell">
      <TopBar
        onAddPerson={addNewPerson}
        onImport={importTree}
        onExport={exportTree}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <main className="content">
        {errorMessage && <div className="alert">{errorMessage}</div>}
        {loading && <div className="loading">Učitavanje...</div>}

        {activeTab === "tree" && (
          <TreeView
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
            newFamilyName={newFamilyName}
            onNewFamilyNameChange={setNewFamilyName}
            onAddFamily={addFamily}
            onDeleteFamily={deleteFamily}
            activeFamily={activeFamily}
            stats={stats}
            people={people}
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
            onEditPerson={(person) => {
              setSelectedPerson(person);
              setEditMode(true);
              setShowModal(true);
            }}
          />
        )}

        {activeTab === "stats" && (
          <StatsView
            stats={stats}
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
            activeFamily={activeFamily}
          />
        )}

        {activeTab === "search" && (
          <SearchView
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filteredPeople={filteredPeople}
            onSelectPerson={(person) => {
              setSelectedPerson(person);
              setEditMode(true);
              setShowModal(true);
            }}
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
          />
        )}

        {activeTab === "gallery" && (
          <GalleryView
            people={people}
            families={families}
            activeFamilyId={activeFamilyId}
            onFamilyChange={handleFamilyChange}
          />
        )}
      </main>

      <PersonModal
        isOpen={showModal}
        person={selectedPerson}
        people={people}
        tags={tags}
        selectedTagIds={selectedPerson ? tagMap.get(selectedPerson.id) || [] : []}
        onCreateTag={createTag}
        editMode={editMode}
        onClose={() => setShowModal(false)}
        onSave={savePerson}
        onDelete={deletePerson}
        onChange={setSelectedPerson}
      />
    </div>
  );
};

export default FamilyTreeApp;



