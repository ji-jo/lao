/** Google Fonts catalog + on-demand CSS loader. */

export type TextFont = {
  id: string;
  /** CSS font-family stack used when applying the face. */
  stack: string;
  source: "local" | "google";
};

/** Bundled faces (fontsource) — always available, no network. */
export const LOCAL_TEXT_FONTS: TextFont[] = [
  {
    id: "Geist",
    stack: "Geist, 'Geist Variable', system-ui, sans-serif",
    source: "local",
  },
  {
    id: "Geist Mono",
    stack: "'Geist Mono', 'Geist Mono Variable', ui-monospace, monospace",
    source: "local",
  },
];

const CACHE_KEY = "lao:google-fonts:v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Curated fallback when the API key is missing or the request fails. */
const FALLBACK_GOOGLE: string[] = [
  "Inter",
  "Space Grotesk",
  "Playfair Display",
  "IBM Plex Mono",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Raleway",
  "Merriweather",
  "Source Code Pro",
  "Nunito",
  "Oswald",
  "Rubik",
  "Work Sans",
  "DM Sans",
  "Libre Baskerville",
  "Fira Code",
  "JetBrains Mono",
];

let memoryCatalog: string[] | null = null;
let inflight: Promise<string[]> | null = null;
const loaded = new Set<string>();

function googleStack(family: string): string {
  const quoted = family.includes(" ") ? `'${family}'` : family;
  return `${quoted}, system-ui, sans-serif`;
}

export function textFontStack(id: string): string {
  const local = LOCAL_TEXT_FONTS.find((f) => f.id === id);
  if (local) return local.stack;
  return googleStack(id);
}

/** Inject a stylesheet for a Google face (no-op for local / already loaded). */
export function ensureFontLoaded(family: string): void {
  if (!family || LOCAL_TEXT_FONTS.some((f) => f.id === family)) return;
  if (loaded.has(family) || typeof document === "undefined") return;
  loaded.add(family);

  const id = `lao-gf-${family.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  if (document.getElementById(id)) return;

  const familyParam = family.trim().replace(/\s+/g, "+");
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

function readCache(): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; families: string[] };
    if (!parsed?.families?.length) return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.families;
  } catch {
    return null;
  }
}

function writeCache(families: string[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), families }),
    );
  } catch {
    /* quota / private mode */
  }
}

async function fetchGoogleFamilies(): Promise<string[]> {
  const key = import.meta.env.VITE_GOOGLE_FONTS_API_KEY as string | undefined;
  if (!key) return FALLBACK_GOOGLE;

  const url =
    `https://www.googleapis.com/webfonts/v1/webfonts` +
    `?key=${encodeURIComponent(key)}` +
    `&sort=popularity` +
    `&fields=items.family`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Fonts API ${res.status}`);
  const data = (await res.json()) as { items?: { family: string }[] };
  const families = (data.items ?? [])
    .map((i) => i.family)
    .filter((f): f is string => typeof f === "string" && f.length > 0);
  return families.length ? families : FALLBACK_GOOGLE;
}

/** Popularity-sorted Google family names (cached). Local faces are separate. */
export async function listGoogleFontFamilies(): Promise<string[]> {
  if (memoryCatalog) return memoryCatalog;
  const cached = readCache();
  if (cached) {
    memoryCatalog = cached;
    return cached;
  }
  if (!inflight) {
    inflight = fetchGoogleFamilies()
      .then((families) => {
        memoryCatalog = families;
        writeCache(families);
        return families;
      })
      .catch(() => {
        memoryCatalog = FALLBACK_GOOGLE;
        return FALLBACK_GOOGLE;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
