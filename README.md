# Book Library

A personal book library web app that uses **each user's own Google Sheet as its database**. Scan a barcode with your
phone, laptop webcam or a USB scanner; the book is looked up and saved to a spreadsheet in your Google Drive.

- **Live app:** <https://dotmidi.github.io/book-library/>
- **For users:** [docs/user-guide.md](docs/user-guide.md)
- **Google Cloud setup (maintainer, once):** [docs/google-setup.md](docs/google-setup.md)

It's a static site with no backend and no server database, hosted free on GitHub Pages. Every user owns their data,
and nobody else ever has a copy.

## Architecture

```
Browser (installable PWA, static files on GitHub Pages)
 ├─ ui/        Svelte 5: Library · Add/Scan · Book · Edit · Stats · More · Import   (src/routes, src/components)
 ├─ auth/      Google Identity Services token model; full-page redirect on iPhone Home Screen
 ├─ store/     books in memory + IndexedDB cache + outbox of unsaved changes
 ├─ sheets/    schema, column resolution, row ⇄ book mapping, batched writes
 ├─ lookup/    region-aware chain: openBD · NDL · BnF · Open Library · Google Books · Crossref → manual form
 └─ scan/      camera (BarcodeDetector / zxing-wasm), feedback, scan session
        │                    │                              │
   Google OAuth      Sheets API + Drive API         openlibrary.org · Google Books
```

### Google permissions

Only two **non-sensitive** scopes, so Google verification isn't needed:

| Scope | Used for |
|---|---|
| `drive.file` | create and use the one "Book Library" spreadsheet (no access to anything else) |
| `drive.appdata` | `config.json` in the hidden app-data folder, holding the spreadsheet ID |

**Finding the sheet on any device:**
1. Read `config.json` from appdata.
2. If it's missing, search Drive for files this app created with the `appProperties.bookLibrary=1` marker.
   `drive.file` sees files the same OAuth client created on any device.
3. Only if both come up empty, create a new sheet.

So a second device never creates a duplicate.

**Tokens:**
- The token model has no refresh tokens; an access token lasts about 1 hour.
- The token is kept in `localStorage` until it expires, so reopening the app within the hour needs no tap.
- After it expires the app shows a **Reconnect** banner. Google's popup needs a user tap; for an already-consented user
  it closes by itself.
- Changes never wait on the network. They're written to an IndexedDB **outbox** first and flushed when the token is valid
  and the device is online.
- On an iPhone Home Screen app (standalone mode), popups are unreliable, so sign-in uses a full-page OAuth redirect
  instead (`src/lib/auth/google.ts`).

### The sheet

**Tab `Books`**, frozen header row:
`id, isbn13, isbn10, title, subtitle, authors, publisher, year, pages, language, cover_url, cover_preview, location, tags, notes, copies, status, lent_to, lent_since, date_added, needs_details`

| Column | Format |
|---|---|
| `authors` | separated by `; ` |
| `tags` | separated by `, ` |
| `language` | readable English name ("Dutch") |
| `status` | `owned` / `lent` / `wishlist` / `gone` (other hand-typed values are kept as they are) |
| `lent_since`, `date_added` | real date cells (`yyyy-mm-dd`) |
| `needs_details` | checkbox |
| `cover_preview` | `=IFERROR(IMAGE(INDEX(K:K,ROW())),"")`. It uses `ROW()`, so the same formula works on every row, and Sheets updates `K:K` if columns move. |
| `cover_url` | Open Library covers are stored by cover ID (`covers.openlibrary.org/b/id/<id>-M.jpg`), not by ISBN |

**Tab `_meta`** (hidden, protected with a warning) holds `schema_version`, `created_at`, `app_url` and `books_sheet_id`.

**Robust to hand edits** (`src/lib/sheets/mapping.ts`, `backend.ts`):

- **Columns:** every column carries a Sheets **developer-metadata tag** (`bl.field = title`). Tags move with the column
  and survive header renames. Each field is located by:
  1. its tag,
  2. otherwise the header name (case/accent-insensitive, with Dutch/Turkish aliases),
  3. otherwise the column is recreated after the last used column.
- **Unknown columns** are ignored and preserved.
- **The Books tab** is tagged too, so renaming it is fine.
- **Rows:**
  - Rows without an id get one, written back.
  - Duplicate ids are re-issued.
  - Rows with no title and no ISBN are skipped with a warning (More page).
  - Numbers typed into ISBN columns are repaired.
- **Writing:**
  - Strings are always written as `stringValue`, so a title starting with `=` never becomes a formula.
  - Updates write only the changed cells.
  - Before updating or deleting, the app re-reads the `id` column so sorted or inserted rows are handled.

**API budget:**
- Load: 3 reads.
- A flush: 1–2 reads + 1 `batchUpdate`, debounced 1.5 s and at least 3 s apart.
- Scanning 10 books ≈ 3–5 writes, well under the per-user limit of 60 reads + 60 writes per minute.

### Lookups

The ISBN's registration group tells us where the book was published (`src/lib/isbnRegion.ts`: 978-4 Japan, 978-90/94
Dutch, 978-605/975/9944 Turkish, 978-89/979-11 Korean, …). The app uses that to:

1. ask region **specialists** first, and skip specialists for other regions, so they cost nothing;
2. pre-fill the **language** when no source gives one, including books nobody knows. This makes manual entry of Dutch
   and Turkish books quicker.

| Source | Used for | Format | Notes |
|---|---|---|---|
| openBD | 978-4 (Japan) | JSON | covers most books sold in Japan, sometimes with a cover |
| NDL Search | 978-4 (Japan) | XML | National Diet Library; no covers (blocked for other sites) |
| BnF SRU | 978-2, 979-10 (French) | XML | Bibliothèque nationale de France |
| Open Library | all | JSON | `jscmd=data` (+ `jscmd=details` for the language), 1 request/s, backoff on 429 |
| Google Books | all | JSON | referrer-restricted API key |
| Crossref | all, **last resort** | JSON | academic / museum / art books; only asked when nothing else found the book |

- How results combine: the first source to find the book wins, and later sources only fill empty fields. So a Japanese
  title from openBD is never replaced by a romanised one from Google.
- The chain stops as soon as authors, language, cover, pages, year and publisher are all filled in.
- All sources allow browser (CORS) requests, so there's no proxy.
- Results are cached in IndexedDB. A "not found" result is cached for a day.
- Checked and not used:
  - Library of Congress: behind a bot check.
  - DNB (German national library): refuses browser requests.
  - Wikidata: too sparse, and needs hyphenated ISBNs.

## Local development

You need Node 22+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_BOOKS_API_KEY` in `.env.local` (see docs/google-setup.md). Then:

```bash
npm run dev
```

That serves <http://localhost:5173>, which must be an authorised origin of the OAuth client.

| Command | What it does |
|---|---|
| `npm test` | unit tests (Vitest) |
| `npm run check` | type-check (svelte-check) |
| `npm run build` | production build into `dist/` |
| `npm run icons` | regenerate the PNG icons |

The camera needs HTTPS or `localhost`. To test on a phone, use the deployed site, or `npx vite --host` behind an HTTPS
tunnel that is added as an authorised origin.

## Deployment

On every push to `main`, `.github/workflows/deploy.yml`:
1. runs the tests,
2. builds with `BASE_PATH` from GitHub Pages,
3. deploys to GitHub Pages.

One-time repo setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables:** add `GOOGLE_CLIENT_ID` and `GOOGLE_BOOKS_API_KEY`.

## Adding a metadata provider

1. Create `src/lib/lookup/myprovider.ts` implementing `MetadataProvider` (`src/lib/lookup/provider.ts`):

   ```ts
   export class MyProvider implements MetadataProvider {
     id = 'myprovider';
     name = 'My Catalogue';
     async lookup(isbn13: string, signal?: AbortSignal): Promise<BookMetadata | null> {
       const res = await fetch(`https://example.org/isbn/${isbn13}`, { signal });
       if (res.status === 404) return null;               // not found → next provider
       if (!res.ok) throw new Error(`HTTP ${res.status}`); // error → next provider
       const j = await res.json();
       return { title: j.title, authors: j.authors, language: languageName(j.lang) /* … */ };
     }
   }
   ```

   Return `null` for "not found" and throw for errors; the chain handles both. Use a `Throttle` if the API has rate
   limits.
2. Add it to `defaultProviders()` in `src/lib/lookup/service.ts`, in the order it should be tried. Earlier providers
   win; later ones only fill blank fields.
   - For a regional catalogue, set `prefixes = ['97889', '97911']`. It is then asked first for those ISBNs and never
     for others.
   - For a sparse fallback, set `lastResort = true`. It is then only asked when nothing else found the book.
3. The API must allow CORS. If it doesn't, put a tiny Cloudflare Worker in front of it.
4. Add a mapping test in `tests/lookup.test.ts`.

## Project layout

```
src/
  lib/isbn.ts               ISBN-10/13 parsing & checksums
  lib/sheets/schema.ts      columns, aliases, A1 helpers
  lib/sheets/mapping.ts     pure row ⇄ book mapping (unit-tested)
  lib/sheets/backend.ts     find/create/repair/load/write the spreadsheet
  lib/google/               fetch wrappers for Drive & Sheets
  lib/auth/google.ts        sign-in, token storage, redirect flow
  lib/store/                app state, IndexedDB, outbox coalescing
  lib/lookup/               providers, throttle, fallback chain
  lib/scan/                 camera scanner, beep, scan session
  routes/, components/      UI
public/privacy.html         privacy policy (linked from the consent screen)
tests/                      Vitest unit tests
```
