# Book Library: how it works

Book Library keeps a list of your books. You add a book by scanning the barcode on the back. Your list is saved in a
spreadsheet in **your own Google Drive**.

**Open the app:** <https://dotmidi.github.io/book-library/>

## 1. Put it on your iPhone's Home Screen

1. Open the link above in **Safari**.
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen** → **Add**.
3. From now on, open Book Library from its icon, like any other app.

On a computer, just bookmark the page. In Chrome or Edge you can also click the **Install** icon in the address bar.

## 2. Sign in

1. Tap **Sign in with Google** and choose your Google account.
2. Google asks whether Book Library may *"see, edit, create and delete only the specific Google Drive files you use with
   this app"* and *"its own configuration data"*. Tick both boxes and tap **Continue**.

   The app can **only** see the one spreadsheet it creates. It can't see your other files, email or photos.
3. The first time, the app creates a spreadsheet called **Book Library** in your Google Drive. You'll see a green
   message when it's ready.

About once an hour, Google asks the app to check in again. If you see **"Your Google connection timed out"**, tap
**Reconnect**. You usually won't have to type anything. Nothing you added is lost in the meantime.

## 3. Add books

Tap **Add** at the bottom.

### With the camera (phone or laptop)

1. Tap **Scan with camera** and allow camera access the first time.
2. Hold the **barcode on the back of the book** inside the white frame. When it's read you hear a beep and the frame
   flashes green.
3. A card appears with the cover, title and author. Tap **Save**, or **Edit** to change something first.
4. The camera keeps running. Just hold up the next book.

Tip: switch on **Save automatically after each scan** to add a pile of books without tapping Save each time. You can
still tap **Undo** on any card.

### With a USB or Bluetooth barcode scanner (computer)

Open the **Add** page and scan. The scanner "types" the number into the ISBN box and the book is looked up straight away.

### By typing

Type the ISBN (the 10 or 13-digit number above or below the barcode) and press **Enter**. Dashes don't matter.

### If the book isn't found

Many Dutch and Turkish books aren't in the online book databases. You'll see **"We couldn't find details for this
book"**. Then either:

- Tap **Fill in details**, type the title and author, and tap **Save**. Only the title is needed.
- Or tap **Save with ISBN only** and fill it in later. The book gets a yellow **Needs details** label.

### Books without a barcode

On the Add page, tap **Add a book without an ISBN** and type the details.

### Already have it?

If you scan a book that's already in your library, the app says so. Tap **Add another copy** if you really have two.

### CDs and vinyl

Scan the barcode on a CD or record the same way. It's looked up in MusicBrainz, a free music database, and gets the
category **CD** or **Vinyl**. If a barcode isn't a book, CD or record the app knows (single comic issues, for example),
the app says so.

### Wishlist: books you want but haven't bought

In a shop, switch on **Add to my wishlist** on the Add page and scan. Those books go to your **Wishlist** instead of
your library. When you buy one, open it and tap **Bought it**. Scanning it again also offers **Bought it**.

## 4. Your library

- **Library** has two shelves at the top: **My books** and **Wishlist**. Search by title, author or ISBN.
- **Filters:**
  - **location** (with country flags); "No location set" finds books you still need to sort
  - **category** (Novel, Manga, Comic, Artbook, CD, Vinyl…)
  - **tag**
- **Sorting:** recently added, title, author or year. Switch between **Covers** and **List**.
- **Location** can be a country (picked from the list; its flag shows on the book's page, e.g. 🇹🇷 Turkey) or anything else ("Living room").
- **Changing many books at once:**
  1. Tap **Select**, then tap books, or use **Select all shown** after filtering.
  2. Then set the location or category, add or remove a tag, move them to or from the wishlist, or delete them.
- Tap a book to see its details, **Edit** it, or **Delete** it.
- **Lending:** on a book's page, tap **Lend this book** and type who has it. When it comes back, tap **It's back**.
- **Stats** shows how many books you own, by language, location and category, and how many you added each month.
- **Volumes:** manga and series volumes are written as "Title, Vol. 2", so they sort together.

## Friends

The **Friends** tab lets you look at each other's libraries. It's optional, and off until you turn it on.

**To share yours:**
1. Type the name friends should see.
2. Tap **Start sharing**.
3. Send the link to your friends. When they open it, your library appears in their Friends tab.

What sharing means:
- Anyone with the link can **look** at everything in your sheet, including notes and who you lent books to. They can't
  change anything.
- Tap **Stop sharing** at any time; the link stops working right away.

**To add a friend's library:** open the link they sent you, or paste their link or code under **Add a friend's library**.

## Importing an existing list

**More → Import books from a CSV file.** From Google Sheets: **File → Download → Comma-separated values (.csv)**.

- Columns are matched by name (title, author, ISBN, location, category…).
- Rows without an ISBN can be matched by **title and author** to find covers and details. Only clear matches are used.

## 5. Where your data lives

Everything is stored in the spreadsheet **Book Library** in your Google Drive. It belongs to you.

- Open it from the app: **More → Open my sheet in Google Sheets**, or find it in Google Drive.
- You can edit it directly in Google Sheets, for example to fix a title. Tap **More → Reload from my sheet** (or reopen
  the app) to see the change.
- Please don't delete the `id` column or the hidden `_meta` tab. Renaming or moving columns is fine.
- Deleting the spreadsheet deletes your list, so don't do that unless you mean it.

## 6. Download your list as Excel

**More → Download as Excel (.xlsx)**. Or, in Google Sheets: **File → Download → Microsoft Excel (.xlsx)**.

## 7. Using another phone or computer

Open the app, sign in with the **same Google account**, and your whole library is there. The app finds your existing
spreadsheet; it won't make a second one.

## Questions

| Problem | What to do |
|---|---|
| The camera doesn't start | Allow camera access: iPhone **Settings → Safari → Camera → Allow**, or the camera icon in your browser's address bar. |
| The barcode isn't read | Use more light, hold the book 10–20 cm away and keep it still. You can always type the number. |
| The Google window doesn't open or closes immediately | **More → Use full-page sign-in**, then try again. |
| "X changes not saved yet" | You're offline or need to reconnect. The changes are kept on your phone and saved automatically later. |
