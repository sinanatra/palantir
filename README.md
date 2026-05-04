# Faces of Palantir

## Export CSV

1. Open Chrome and sign in to LinkedIn.
2. Go to `https://www.linkedin.com/company/palantir-technologies/people/`.
3. Open DevTools Console.
4. Open `people.js` and copy all its contents.
5. Paste the script in the Console and press Enter.
6. Wait for completion. It downloads `palantir_people.csv`.

## View Gallery

1. Start a local server in this folder:
   `python3 -m http.server`
2. Open `http://localhost:8000/index.html`
3. The page loads `palantir_people.csv` and shows photo, name, and profile link.

## Notes

- `people.js` strips trailing `’s profile`/`'s profile` from names.
- LinkedIn may still limit how many profiles are loaded in one session.
