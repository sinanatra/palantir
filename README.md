# Faces of Palantir

## Export CSV

1. Open Chrome and sign in to LinkedIn.
2. Go to `https://www.linkedin.com/company/palantir-technologies/people/`.
3. Open DevTools Console.
4. Open `people.js` and copy all its contents.
5. Paste the script in the Console and press Enter.
6. Wait for completion. It downloads `palantir_people.csv`.

## Export From Search Pages (1..100)

1. Open this kind of URL while signed in:
   `https://www.linkedin.com/search/results/people/?origin=COMPANY_PAGE_CANNED_SEARCH&currentCompany=%5B%2220708%22%5D&page=1`
2. Open DevTools Console.
3. Open `people_search_pages.js` and copy all its contents.
4. Paste in Console and press Enter.
5. It fetches pages `1..100` and downloads `palantir_people_search_pages.csv`.

## View Gallery

1. Start a local server in this folder:
   `python3 -m http.server`
2. Open `http://localhost:8000/index.html`
3. The page loads `palantir_people.csv` and shows photo, name, and profile link.

## Notes

- `people.js` strips trailing `’s profile`/`'s profile` from names.
- LinkedIn may still limit how many profiles are loaded in one session.
