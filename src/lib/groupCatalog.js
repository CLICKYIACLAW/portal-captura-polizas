export function normalizeGroupName(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findGroupNameMatches(query, catalog) {
  const normalizedQuery = normalizeGroupName(query);
  if (!normalizedQuery) return [];

  const seen = new Set();
  const matches = [];

  for (const entry of catalog || []) {
    const name = String(entry ?? '');
    const normalized = normalizeGroupName(name);
    if (!normalized || seen.has(normalized)) continue;

    let rank = null;
    if (normalized === normalizedQuery) {
      rank = 'exact';
    } else if (normalized.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalized)) {
      rank = 'prefix';
    } else if (normalized.includes(normalizedQuery) || normalizedQuery.includes(normalized)) {
      rank = 'substring';
    }

    if (rank) {
      seen.add(normalized);
      matches.push({ name, rank });
    }
  }

  const rankOrder = { exact: 0, prefix: 1, substring: 2 };
  matches.sort((a, b) => rankOrder[a.rank] - rankOrder[b.rank]);

  return matches;
}
