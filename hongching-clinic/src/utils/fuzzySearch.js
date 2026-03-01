import { useState, useEffect } from 'react';

// Lightweight fuzzy search — no external dependencies
// Supports Chinese characters, pinyin-like partial matching

export function fuzzyMatch(query, text) {
  if (!query || !text) return { match: false, score: 0 };
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();

  // Exact match (highest score)
  if (t === q) return { match: true, score: 100 };

  // Starts with (high score)
  if (t.startsWith(q)) return { match: true, score: 90 };

  // Contains (medium score)
  if (t.includes(q)) return { match: true, score: 70 };

  // Character-by-character fuzzy (lower score)
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi === q.length) return { match: true, score: 40 + (q.length / t.length * 20) };

  return { match: false, score: 0 };
}

// Search across multiple fields of an object
export function fuzzySearchItems(items, query, fields, limit = 50) {
  if (!query?.trim() || !items?.length) return items?.slice(0, limit) || [];

  const results = [];
  for (const item of items) {
    let bestScore = 0;
    for (const field of fields) {
      const value = String(item[field] || '');
      const { match, score } = fuzzyMatch(query, value);
      if (match && score > bestScore) bestScore = score;
    }
    if (bestScore > 0) results.push({ item, score: bestScore });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map(r => r.item);
}

// Debounce hook for search input
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
