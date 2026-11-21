/**
 * English titles for books in other languages. The library shows the English
 * title; the book page shows the original.
 *
 * Machine translation comes from MyMemory (free, no key, CORS-enabled, about
 * 5,000 characters a day without an account — plenty for titles). Results are
 * cached on this device and saved in the sheet's `title_en` column, so each
 * title is only translated once.
 */
import type { Book } from './types';
import { languageCode } from './languages';
import { getLookup, putLookup } from './store/db';
import { Throttle } from './lookup/throttle';
import { fold } from './search';

const CJK_KANA = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
const HANGUL = /[가-힯]/;
const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN_LETTER = /[A-Za-z]/;

/** The language to translate from, or null when the title is (probably) English already. */
export function sourceLanguage(title: string, language: string): string | null {
  if (!title.trim()) return null;
  // The script beats the language field, which is sometimes wrong ("English" for a Japanese workbook).
  if (/[぀-ヿ]/.test(title)) return 'ja';
  if (HANGUL.test(title)) return 'ko';
  if (CJK_KANA.test(title)) return language === 'Chinese' ? 'zh' : 'ja';
  if (CYRILLIC.test(title)) return languageCode(language) || 'ru';
  const code = languageCode(language);
  return code && code !== 'en' ? code : null;
}

/**
 * Some sources give a parallel title: "ソードアート・オンラインabec画集 = SWORD ART ONLINE abec Art Works".
 * The part after " = " is the English title when the first part isn't in Latin script.
 * A dangling "Horimiya =" just loses the " =".
 */
export function splitParallelTitle(title: string): { title: string; english: string } {
  const m = /^(.*?)\s+=\s*(.*)$/.exec(title.trim());
  if (!m) return { title: title.trim(), english: '' };
  const [, first, second] = m;
  if (!second) return { title: first.trim(), english: '' };
  if (!LATIN_LETTER.test(first) || (CJK_KANA.test(first) && !CJK_KANA.test(second))) {
    if (!CJK_KANA.test(second) && LATIN_LETTER.test(second)) return { title: first.trim(), english: second.trim() };
  }
  return { title: title.trim(), english: '' };
}

/** "Gazi Mustafa Kemal Atatürk." is no translation of "Gazi Mustafa Kemal Atatürk". */
const sameWords = (a: string, b: string) => fold(a).replace(/[^\p{L}\p{N}]+/gu, '') === fold(b).replace(/[^\p{L}\p{N}]+/gu, '');

const mymemory = new Throttle(1100);
const anilist = new Throttle(2100); // AniList allows 30 requests/minute

/** Japanese words where a series name ends and the book type begins (fan book, art book, guide…). */
const BOOK_WORDS = /(?:TVアニメ|テレビアニメ|公式|プレミアム|オフィシャル|アニメーション|原画集|画集|イラスト集|ファンブック|ガイド|設定資料集|アートワークス|ビジュアル|資料集|art works|artworks|official|season\s*\d)/i;

/** Spaces, middle dots and full-width forms don't matter when comparing Japanese names. */
const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s・･:：\-‐–—~〜]+/g, '');

/** Where the series name could end: before the first book-type word, or at the first space / colon. */
export function seriesNameCandidates(title: string): string[] {
  const t = title.normalize('NFKC').trim();
  const out = new Set<string>();
  const word = BOOK_WORDS.exec(t);
  if (word && word.index > 1) out.add(t.slice(0, word.index).trim());
  const sep = /[\s:：]/.exec(t);
  if (sep && sep.index > 1) out.add(t.slice(0, sep.index).trim());
  return [...out].filter((c) => c.length >= 2 && c !== t).sort((a, b) => b.length - a.length);
}

interface AniListTitle {
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
}

async function anilistByNative(name: string): Promise<AniListTitle[]> {
  const query = `query($s:String){Page(perPage:5){media(search:$s){title{english romaji native}}}}`;
  const res = await anilist.fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { s: name } }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: { Page?: { media?: { title?: AniListTitle }[] } } };
  return (json.data?.Page?.media ?? []).map((m) => m.title ?? {});
}

/**
 * The official English name of the anime/manga a Japanese title starts with
 * (よふかしのうた公式ファンブック → "Call of the Night" + "公式ファンブック"), from AniList.
 */
async function officialSeriesName(title: string): Promise<{ english: string; rest: string } | null> {
  const flat = title.normalize('NFKC');
  for (const cand of seriesNameCandidates(title)) {
    const hits = await anilistByNative(cand);
    const hit = hits.find((h) => h.native && h.english && squash(h.native) === squash(cand));
    if (hit?.english) return { english: hit.english, rest: flat.slice(flat.indexOf(cand) + cand.length).trim() };
  }
  return null;
}

/**
 * An English title: official anime/manga names from AniList where the title
 * starts with one, machine translation (MyMemory) for everything else.
 */
export async function translateTitle(text: string, from: string): Promise<string> {
  const key = `tr2:${from}:${text}`;
  const cached = (await getLookup(key)) as unknown as { translation?: string } | undefined;
  if (cached?.translation !== undefined) return cached.translation;
  let out = '';
  const official = from === 'ja' ? await officialSeriesName(text).catch(() => null) : null;
  if (official) {
    const rest = CJK_KANA.test(official.rest) ? await machineTranslate(official.rest, from) : '';
    out = [official.english, rest || official.rest].filter(Boolean).join(' ');
  } else {
    out = await machineTranslate(text, from);
  }
  // Nothing to gain from a "translation" that's the same words.
  if (sameWords(out, text)) out = '';
  await putLookup({ isbn: key, metadata: null, sources: [], at: Date.now(), translation: out } as never);
  return out;
}

/** Machine translation into English ('' when it can't be translated or nothing changes). */
async function machineTranslate(text: string, from: string): Promise<string> {
  const key = `tr1:${from}:${text}`;
  const cached = (await getLookup(key)) as unknown as { translation?: string } | undefined;
  if (cached?.translation !== undefined) return cached.translation;
  const res = await mymemory.fetch(`https://api.mymemory.translated.net/get?${new URLSearchParams({ q: text, langpair: `${from}|en` })}`);
  if (!res.ok) throw new Error(`translation failed (${res.status})`);
  const json = (await res.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string }; quotaFinished?: boolean };
  if (json.quotaFinished || Number(json.responseStatus) !== 200) throw new Error('translation quota used up for today');
  let out = (json.responseData?.translatedText ?? '').trim();
  if (/MYMEMORY WARNING|INVALID LANGUAGE PAIR/i.test(out)) throw new Error('translation unavailable');
  // Nothing to gain from a "translation" that's the same words.
  if (sameWords(out, text)) out = '';
  await putLookup({ isbn: key, metadata: null, sources: [], at: Date.now(), translation: out } as never);
  return out;
}

/** Books whose English title is still to be worked out. */
export function needsTranslation(b: Book): boolean {
  return !b.title_en && !!sourceLanguage(b.title, b.language);
}
