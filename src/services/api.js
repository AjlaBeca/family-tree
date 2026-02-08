export const api = async (path, options = {}) => {
  const res = await fetch(path, options);
  if (!res.ok) {
    const raw = await res.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === "string" && parsed.error.trim()) {
        message = parsed.error.trim();
      }
    } catch {
      // keep raw text
    }
    throw new Error(message || `Zahtjev nije uspio (${res.status})`);
  }
  return res.json();
};

export const getApiErrorMessage = (err, fallback) => {
  const msg = String(err?.message || "");
  if (msg.toLowerCase().includes("failed to fetch")) {
    return "API nije dostupan. Pokreni backend sa `npm run server`.";
  }
  if (msg.includes("Cannot GET /api/gallery/photos")) {
    return "Backend nema novu gallery rutu. Restartuj backend (`npm run server`) ili pokreni `npm run dev`.";
  }
  if (
    msg.toLowerCase().includes("payload too large") ||
    msg.toLowerCase().includes("entity too large") ||
    msg.includes("413")
  ) {
    return "Slika ili paket slika je prevelik za upload. Smanji veličinu slike ili dodaj manje slika odjednom.";
  }
  if (msg.includes("<!DOCTYPE html")) {
    return fallback || "Server je vratio HTML umjesto API odgovora. Provjeri da backend radi i da je ruta ispravna.";
  }
  return msg || fallback;
};



