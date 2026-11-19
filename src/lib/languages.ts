/**
 * Language codes (ISO 639-1, ISO 639-2/B "MARC" codes used by Open Library)
 * → readable English names. Everything stored in the sheet uses the name.
 */
const LANGS: [name: string, ...codes: string[]][] = [
  ['Dutch', 'nl', 'dut', 'nld', 'nederlands', 'flemish', 'vlaams'],
  ['Turkish', 'tr', 'tur', 'türkçe', 'turkce'],
  ['English', 'en', 'eng', 'engels', 'ingilizce'],
  ['German', 'de', 'ger', 'deu', 'deutsch', 'duits', 'almanca'],
  ['French', 'fr', 'fre', 'fra', 'français', 'francais', 'frans', 'fransızca'],
  ['Spanish', 'es', 'spa', 'español', 'espanol', 'spaans'],
  ['Italian', 'it', 'ita', 'italiano', 'italiaans'],
  ['Portuguese', 'pt', 'por', 'português', 'portugees'],
  ['Arabic', 'ar', 'ara'],
  ['Persian', 'fa', 'per', 'fas', 'farsi'],
  ['Kurdish', 'ku', 'kur'],
  ['Russian', 'ru', 'rus'],
  ['Polish', 'pl', 'pol'],
  ['Swedish', 'sv', 'swe'],
  ['Danish', 'da', 'dan'],
  ['Norwegian', 'no', 'nor', 'nb', 'nob', 'nn', 'nno'],
  ['Finnish', 'fi', 'fin'],
  ['Greek', 'el', 'gre', 'ell'],
  ['Hungarian', 'hu', 'hun'],
  ['Czech', 'cs', 'cze', 'ces'],
  ['Romanian', 'ro', 'rum', 'ron'],
  ['Bulgarian', 'bg', 'bul'],
  ['Croatian', 'hr', 'hrv'],
  ['Serbian', 'sr', 'srp'],
  ['Bosnian', 'bs', 'bos'],
  ['Albanian', 'sq', 'alb', 'sqi'],
  ['Ukrainian', 'uk', 'ukr'],
  ['Hebrew', 'he', 'heb', 'iw'],
  ['Japanese', 'ja', 'jpn'],
  ['Chinese', 'zh', 'chi', 'zho'],
  ['Korean', 'ko', 'kor'],
  ['Hindi', 'hi', 'hin'],
  ['Urdu', 'ur', 'urd'],
  ['Indonesian', 'id', 'ind'],
  ['Frisian', 'fy', 'fry', 'frysk'],
  ['Afrikaans', 'af', 'afr'],
  ['Latin', 'la', 'lat'],
  ['Esperanto', 'eo', 'epo'],
  ['Azerbaijani', 'az', 'aze'],
];

const LOOKUP = new Map<string, string>();
for (const [name, ...codes] of LANGS) {
  LOOKUP.set(name.toLowerCase(), name);
  for (const c of codes) LOOKUP.set(c.toLowerCase(), name);
}

export const COMMON_LANGUAGES = ['Dutch', 'Turkish', 'English', 'German', 'French', 'Spanish', 'Arabic', 'Kurdish'];

/** Normalise a code or name to a readable name; unknown input is returned trimmed. */
export function languageName(input: string | undefined | null): string {
  const s = String(input ?? '').trim();
  if (!s) return '';
  // Open Library keys look like "/languages/dut"; Google may send "nl-NL".
  const key = s.replace(/^\/languages\//, '').toLowerCase();
  return LOOKUP.get(key) ?? LOOKUP.get(key.split(/[-_]/)[0]) ?? s.charAt(0).toUpperCase() + s.slice(1);
}
