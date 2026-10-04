// Geographic qualifiers are user constraints, not generic route suggestions.
// Defend against an inconsistent model scope or a query shortened to a brand.
export function scopedPlaceQuery(title: string, query: string) {
  const geographic = (text: string) =>
    /\bdowntown\b/i.test(text) ||
    /\b(?:near|around|close to)\s+(?!(?:me|the route|my route|the way|my destination|my start|closing|opening)\b)\S/i.test(
      text,
    ) ||
    /\bin\s+(?!(?:the morning|the afternoon|the evening|the route|a |an |the area)\b)[A-Z][\p{L}]/u.test(
      text,
    );
  if (geographic(query)) return query;
  if (geographic(title)) return title;
  return null;
}

export function geographicAnchor(query: string) {
  const match = query.match(/\b(?:near|around|close to|in)\s+(.+?)\s*$/i);
  if (match && scopedPlaceQuery(query, query)) return match[1].trim();
  const downtown = query.match(/\bdowntown\b.*$/i);
  return downtown?.[0] ?? null;
}
