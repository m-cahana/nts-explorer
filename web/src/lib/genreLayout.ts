import type { Track, GenreGroup, GridLayout } from '../types';

const MIN_GROUP_SIZE = 5;

/** Count how often each genre appears across all tracks (lowercased). */
export function buildGenreFrequency(tracks: Track[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const track of tracks) {
    if (!track.nts_genres) continue;
    for (const g of track.nts_genres) {
      const key = g.toLowerCase();
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
  }
  return freq;
}

/** Pick primary genre for a track: highest global frequency, ties broken alphabetically. */
export function assignPrimaryGenre(track: Track, freq: Map<string, number>): string {
  if (!track.nts_genres || track.nts_genres.length === 0) return 'uncategorized';
  if (track.nts_genres.length === 1) return track.nts_genres[0].toLowerCase();

  let best = '';
  let bestCount = -1;
  for (const g of track.nts_genres) {
    const key = g.toLowerCase();
    const count = freq.get(key) ?? 0;
    if (count > bestCount || (count === bestCount && key < best)) {
      best = key;
      bestCount = count;
    }
  }
  return best || 'uncategorized';
}

/** Group tracks by primary genre. Groups smaller than minGroupSize merge into "other". */
export function groupByPrimaryGenre(
  tracks: Track[],
  freq: Map<string, number>,
  minGroupSize: number = MIN_GROUP_SIZE,
): Map<string, Track[]> {
  const groups = new Map<string, Track[]>();

  for (const track of tracks) {
    const genre = assignPrimaryGenre(track, freq);
    if (!groups.has(genre)) groups.set(genre, []);
    groups.get(genre)!.push(track);
  }

  // Merge small groups into "other"
  const result = new Map<string, Track[]>();
  for (const [genre, groupTracks] of groups) {
    if (groupTracks.length >= minGroupSize) {
      result.set(genre, groupTracks);
    } else {
      if (!result.has('other')) result.set('other', []);
      result.get('other')!.push(...groupTracks);
    }
  }

  return result;
}

/** Build a tag frequency vector from all nts_genres tags across the group's tracks. */
export function buildTagProfile(tracks: Track[]): Map<string, number> {
  const profile = new Map<string, number>();
  for (const track of tracks) {
    if (!track.nts_genres) continue;
    for (const g of track.nts_genres) {
      const key = g.toLowerCase();
      profile.set(key, (profile.get(key) ?? 0) + 1);
    }
  }
  return profile;
}

/** Cosine similarity between two tag-count vectors. */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [key, valA] of a) {
    magA += valA * valA;
    const valB = b.get(key);
    if (valB !== undefined) dot += valA * valB;
  }
  for (const [, valB] of b) {
    magB += valB * valB;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Order genres by similarity: start from largest, greedily pick most similar next. "other"/"uncategorized" go last. */
export function orderGenresBySimilarity(groups: GenreGroup[]): GenreGroup[] {
  const special = groups.filter(g => g.genre === 'other' || g.genre === 'uncategorized');
  const normal = groups.filter(g => g.genre !== 'other' && g.genre !== 'uncategorized');

  if (normal.length === 0) return [...special];

  // Start with the largest group
  normal.sort((a, b) => b.tracks.length - a.tracks.length);

  const ordered: GenreGroup[] = [];
  const visited = new Set<string>();

  ordered.push(normal[0]);
  visited.add(normal[0].genre);

  while (ordered.length < normal.length) {
    const current = ordered[ordered.length - 1];
    let bestSim = -1;
    let bestGroup: GenreGroup | null = null;

    for (const candidate of normal) {
      if (visited.has(candidate.genre)) continue;
      const sim = cosineSimilarity(current.tagProfile, candidate.tagProfile);
      if (sim > bestSim) {
        bestSim = sim;
        bestGroup = candidate;
      }
    }

    if (bestGroup) {
      ordered.push(bestGroup);
      visited.add(bestGroup.genre);
    }
  }

  return [...ordered, ...special];
}

/** Orchestrator: produces a flat ordered track list with genre group boundaries. */
export function computeGridLayout(tracks: Track[]): GridLayout {
  const freq = buildGenreFrequency(tracks);
  const groupMap = groupByPrimaryGenre(tracks, freq);

  // Build GenreGroup objects with tag profiles
  const genreGroups: GenreGroup[] = [];
  for (const [genre, groupTracks] of groupMap) {
    genreGroups.push({
      genre,
      displayLabel: genre,
      tracks: groupTracks,
      tagProfile: buildTagProfile(groupTracks),
    });
  }

  // Order by similarity
  const orderedGroups = orderGenresBySimilarity(genreGroups);

  // Build flat track list and group boundaries
  const flatTracks: Track[] = [];
  const groupBoundaries: number[] = [];

  for (const group of orderedGroups) {
    groupBoundaries.push(flatTracks.length);
    flatTracks.push(...group.tracks);
  }

  return { orderedGroups, flatTracks, groupBoundaries };
}
