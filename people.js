(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const esc = (s) => {
    s = String(s ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function absUrl(href) {
    if (!href) return "";
    if (href.startsWith("http")) return href;
    if (href.startsWith("/")) return `https://www.linkedin.com${href}`;
    return "";
  }

function extractPhoto(scope) {
    if (!scope) return "";
    const img = scope.querySelector("img.evi-image:not(.org-people-profile-card__cover-photo)");
    return img ? (img.currentSrc || img.src || "") : "";
  }

  function findCard(anchor) {
    const structural = anchor.closest("li, article, section");
    if (structural) return structural;
    let node = anchor.parentElement;
    for (let i = 0; i < 8 && node; i++) {
      if (node.querySelector?.('a[href*="/in/"]') &&
          (node.querySelector?.("img") || node.querySelector?.('[style*="background-image"]'))) return node;
      node = node.parentElement;
    }
    return anchor.parentElement || anchor;
  }

  const byUrl = new Map();

  function collect() {
    document.querySelectorAll('a[href*="/in/"]').forEach((a) => {
      const profile_url = absUrl(a.getAttribute("href") || a.href).split("?")[0];
      if (!profile_url) return;
      const card = findCard(a);
      if (!card) return;

      let photo = extractPhoto(card);
      if (!photo) {
        let node = a.parentElement;
        for (let i = 0; i < 8 && node && !photo; i++) { photo = extractPhoto(node); node = node.parentElement; }
      }

      let name =
        card.querySelector(".org-people-profile-card__profile-title")?.textContent ||
        card.querySelector(".artdeco-entity-lockup__title")?.textContent ||
        a.getAttribute("aria-label") || a.textContent || "";
      let desc =
        card.querySelector(".artdeco-entity-lockup__subtitle")?.textContent ||
        card.querySelector(".org-people-profile-card__profile-position")?.textContent ||
        card.querySelector(".t-14.t-black--light")?.textContent || "";

      name = norm(name).replace(/^View\s+/i, "").replace(/['']s profile$/i, "");
      desc = norm(desc);
      if (!name) return;

      const existing = byUrl.get(profile_url);
      if (!existing) { byUrl.set(profile_url, { name, desc, photo, profile_url }); return; }
      if (!existing.name && name) existing.name = name;
      if (!existing.desc && desc) existing.desc = desc;
      if (!existing.photo && photo) existing.photo = photo;
    });
  }

  function clickMore() {
    document.querySelectorAll("button, a").forEach((el) => {
      const t = norm(el.innerText).toLowerCase();
      if (t.includes("show more") || t.includes("see more") || t.includes("next")) el.click();
    });
  }

  const scroller =
    document.querySelector(".scaffold-finite-scroll__content")?.parentElement ||
    document.scrollingElement;

  let stable = 0, lastCount = 0;
  for (let i = 0; i < 500 && stable < 5; i++) {
    collect(); clickMore();
    if (scroller === document.scrollingElement || scroller === document.body || scroller === document.documentElement) {
      window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
    } else {
      scroller.scrollTop = scroller.scrollHeight;
    }
    await sleep(1200); collect(); await sleep(500); collect();
    const n = byUrl.size;
    console.log(`pass ${i + 1}: ${n} profiles`);
    if (n === lastCount) stable++; else stable = 0;
    lastCount = n;
  }

  // --- Fetch photos as data URLs using LinkedIn session ---
  const people = [...byUrl.values()].sort((a, b) => a.name.localeCompare(b.name));
  const withPhotoUrls = people.filter(p => p.photo).length;
  console.log(`Scraping done. ${people.length} profiles, ${withPhotoUrls} have photo URLs.`);

  function toDataUrl(url) {
    if (!url) return Promise.resolve("");
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 100;
          canvas.height = img.naturalHeight || 100;
          canvas.getContext("2d").drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch { resolve(""); }
      };
      img.onerror = () => resolve("");
      img.src = url;
    });
  }

  let fetched = 0, photoFailed = 0;
  const BATCH = 5;
  for (let i = 0; i < people.length; i += BATCH) {
    await Promise.all(people.slice(i, i + BATCH).map(async (p) => {
      const dataUrl = await toDataUrl(p.photo);
      if (dataUrl) { p.photo = dataUrl; fetched++; }
      else { p.photo = ""; photoFailed++; }
    }));
    console.log(`Photos: ${fetched + photoFailed}/${people.length} (${fetched} ok, ${photoFailed} failed)`);
    await sleep(150);
  }

  // --- Export CSV ---
  const rows = [["name", "desc", "photo", "profile_url"]];
  people.forEach((p) => rows.push([p.name, p.desc, p.photo, p.profile_url]));
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "palantir_people.csv";
  a.click();
  URL.revokeObjectURL(a.href);

  console.log(`Done. ${people.length} profiles, ${fetched} photos. palantir_people.csv downloaded.`);
})();
