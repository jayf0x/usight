const REGISTRY = 'https://tracesof.net/uebersicht-widgets/widgets.json';

let _cache = null;

async function fetchAll() {
  if (_cache) return _cache;
  const res = await fetch(REGISTRY, { headers: { 'User-Agent': 'usight-cli' } });
  if (!res.ok) throw new Error(`Registry unavailable (HTTP ${res.status})`);
  const { widgets } = await res.json();
  _cache = widgets;
  return widgets;
}

// Exact id match first, then case-insensitive name match
export async function findWidget(query) {
  const widgets = await fetchAll();
  const q = query.toLowerCase();
  return (
    widgets.find(w => w.id.toLowerCase() === q) ||
    widgets.find(w => w.name.toLowerCase() === q) ||
    null
  );
}

// All widgets whose id or name contains the query
export async function searchRegistry(query) {
  const widgets = await fetchAll();
  const q = query.toLowerCase();
  return widgets.filter(w =>
    w.id.toLowerCase().includes(q) || w.name.toLowerCase().includes(q)
  );
}
