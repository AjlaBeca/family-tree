export const api = async (path, options = {}) => {
  const res = await fetch(path, options);
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Zahtjev nije uspio (${res.status})`);
  }
  return res.json();
};

export const getApiErrorMessage = (err, fallback) => {
  const msg = String(err?.message || "");
  if (msg.toLowerCase().includes("failed to fetch")) {
    return "API nije dostupan. Pokreni backend sa `npm run server`.";
  }
  return fallback;
};
