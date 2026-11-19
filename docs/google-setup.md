# Google Cloud setup (one time, ~15 minutes)

The app signs people in with Google and talks to the Sheets and Drive APIs straight from the browser. For that it needs a
**Google Cloud project** with an **OAuth client ID**. You (the maintainer) do this once; the people using the app never
see any of it.

Google's console moves things around now and then. If a button has a slightly different name, look for the closest match.
In 2025 the OAuth screens moved into a section called **Google Auth Platform** (Branding, Audience, Clients, Data Access).

You will need:

- The address the app is served from, e.g. `https://dotmidi.github.io/book-library/`.
  - Its **origin** is the part without the path: `https://dotmidi.github.io`.
- A Google account to own the project (your normal account is fine).

---

## 1. Create the project

1. Go to <https://console.cloud.google.com/>.
2. Accept the terms of service if this is your first time.
3. Click the project picker at the top → **New project**.
4. Name it `Book Library`. Leave "Location" as *No organization*. Click **Create**.
5. Make sure the new project is selected in the project picker.

## 2. Enable the APIs

Go to **APIs & Services → Library** and enable each of these (search, open, click **Enable**):

1. **Google Sheets API**
2. **Google Drive API**
3. **Books API** (for the book lookup fallback)

## 3. Configure the consent screen (Google Auth Platform)

Open **APIs & Services → OAuth consent screen**. The first time, this shows **Get started**.

1. **App information**
   - App name: `Book Library`
   - User support email: your email
2. **Audience**: choose **External**.
3. **Contact information**: your email.
4. Agree to the Google API Services User Data Policy → **Create**.

Then fill in the remaining pages in the left menu:

### Branding

- App name: `Book Library`
- User support email: your email
- **App logo: leave empty.** Uploading a logo triggers Google's brand verification, which we want to avoid.
- Application home page: `https://dotmidi.github.io/book-library/`
- Application privacy policy link: `https://dotmidi.github.io/book-library/privacy.html`
- Application terms of service: leave empty
- Authorized domains: add `dotmidi.github.io`. If Google refuses that, add `github.io`.
- Developer contact: your email
- **Save**

### Data Access (scopes)

Click **Add or remove scopes** and tick exactly these two (use the filter box):

| Scope | Shown as |
|---|---|
| `https://www.googleapis.com/auth/drive.file` | See, edit, create, and delete only the specific Google Drive files you use with this app |
| `https://www.googleapis.com/auth/drive.appdata` | See, create, and delete its own configuration data in your Google Drive |

Both appear under **Your non-sensitive scopes**. Click **Update**, then **Save**.

> **Don't** add `…/auth/drive` or `…/auth/spreadsheets`. Those are sensitive or restricted and would require Google's
> review (weeks, sometimes a paid security assessment).

### Audience → Publish

1. On the **Audience** page, the publishing status says **Testing**. Click **Publish app** → **Confirm**.
2. The status becomes **In production**.

Why: in *Testing*, only listed test users can sign in, and Google expires their sign-in after 7 days. Because the app
only uses non-sensitive scopes, publishing does **not** need Google's verification. Users won't see an "unverified app"
warning.

## 4. Create the OAuth client ID

**Google Auth Platform → Clients → Create client**:

1. Application type: **Web application**
2. Name: `Book Library web`
3. **Authorized JavaScript origins**: add
   - `https://dotmidi.github.io`
   - `http://localhost:5173` (for local development)
4. **Authorized redirect URIs** (used by the iPhone Home Screen full-page sign-in): add
   - `https://dotmidi.github.io/book-library/`
   - `http://localhost:5173/`

   The trailing slash matters: it must exactly match the page address.
5. **Create**. Copy the **Client ID**, which looks like `1234567890-abc123.apps.googleusercontent.com`.

   You don't need the client secret. Browser apps can't keep secrets, and this flow doesn't use one.

## 5. Create the Books API key

**APIs & Services → Credentials → Create credentials → API key**.

Then open the new key (**Edit API key**) and restrict it:

1. **Application restrictions → Websites**. Add:
   - `https://dotmidi.github.io/*`
   - `http://localhost:5173/*`
2. **API restrictions → Restrict key**. Select only **Books API**.
3. **Save**. Copy the key (`AIza…`).

The key is visible to anyone who opens the app; that's normal for browser API keys. The restrictions mean it only works
for the Books API, from your site.

## 6. Give the values to the app

### For the deployed site (GitHub Pages)

In the GitHub repo: **Settings → Secrets and variables → Actions → Variables tab → New repository variable**:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the client ID from step 4 |
| `GOOGLE_BOOKS_API_KEY` | the API key from step 5 |

Then re-run the deploy: **Actions → Deploy to GitHub Pages → Run workflow**, or push any commit.

With the `gh` CLI:

```bash
gh variable set GOOGLE_CLIENT_ID --body "1234567890-abc.apps.googleusercontent.com"
```

```bash
gh variable set GOOGLE_BOOKS_API_KEY --body "AIza..."
```

### For local development

Copy `.env.example` to `.env.local` and fill in the same two values. Then run `npm run dev`.

## 7. Using another domain (Cloudflare Pages, custom domain)

Add the new origin to **Authorized JavaScript origins**, the page address to **Authorized redirect URIs**, the domain to
**Authorized domains** (Branding), and `https://your-domain/*` to the API key's website restrictions.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Error 400: redirect_uri_mismatch` | The page address isn't in **Authorized redirect URIs** exactly (check the trailing `/`). |
| `Error 400: origin_mismatch` / `idpiframe_initialization_failed` | The origin isn't in **Authorized JavaScript origins**. |
| `Access blocked: app has not completed verification` | You added a sensitive scope or a logo. Remove it, keep only the two scopes above. |
| Sign-in works, then "Google refused access" | Sheets or Drive API not enabled in step 2. |
| Book lookups only come from Open Library | Books API not enabled, or the key's website restriction doesn't match your domain. |
| Users get logged out after 7 days | The app is still in *Testing*: publish it (step 3, Audience). |
