import type { VideoClipRecord } from "@/types";

const CLIP_CACHE_NAME = "gridiron-film-clips-v1";
const CACHE_KEY_PREFIX = "https://gridiron-film.local/clip/";

const playbackUrls = new Map<string, string>();

export function isClipCacheSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

function cacheKeyForClip(clipId: string): string {
  return `${CACHE_KEY_PREFIX}${clipId}`;
}

async function openClipCache(): Promise<Cache | null> {
  if (!isClipCacheSupported()) return null;
  return caches.open(CLIP_CACHE_NAME);
}

export async function isClipCached(clipId: string): Promise<boolean> {
  const cache = await openClipCache();
  if (!cache) return false;
  const match = await cache.match(cacheKeyForClip(clipId));
  return Boolean(match);
}

export async function getCachedClipIds(
  clips: VideoClipRecord[],
): Promise<Set<string>> {
  const cache = await openClipCache();
  const cached = new Set<string>();
  if (!cache) return cached;

  await Promise.all(
    clips.map(async (clip) => {
      const match = await cache.match(cacheKeyForClip(clip.id));
      if (match) cached.add(clip.id);
    }),
  );

  return cached;
}

export async function cacheClip(clip: VideoClipRecord): Promise<boolean> {
  const cache = await openClipCache();
  if (!cache) return false;

  const key = cacheKeyForClip(clip.id);
  const existing = await cache.match(key);
  if (existing) return true;

  try {
    const response = await fetch(clip.blobUrl);
    if (!response.ok) return false;
    await cache.put(key, response.clone());
    return true;
  } catch {
    return false;
  }
}

export async function getClipPlaybackUrl(clip: VideoClipRecord): Promise<string> {
  const cachedUrl = playbackUrls.get(clip.id);
  if (cachedUrl) return cachedUrl;

  const cache = await openClipCache();
  if (!cache) return clip.blobUrl;

  const match = await cache.match(cacheKeyForClip(clip.id));
  if (!match) return clip.blobUrl;

  const blob = await match.blob();
  const objectUrl = URL.createObjectURL(blob);
  playbackUrls.set(clip.id, objectUrl);
  return objectUrl;
}

export async function cacheAllClips(
  clips: VideoClipRecord[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  let cachedCount = 0;

  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index]!;
    const cached = await cacheClip(clip);
    if (cached) cachedCount += 1;
    onProgress?.(index + 1, clips.length);
  }

  return cachedCount;
}

export function releaseClipPlaybackUrls(): void {
  for (const url of playbackUrls.values()) {
    URL.revokeObjectURL(url);
  }
  playbackUrls.clear();
}

export async function clearClipCache(): Promise<void> {
  releaseClipPlaybackUrls();
  if (!isClipCacheSupported()) return;
  await caches.delete(CLIP_CACHE_NAME);
}
