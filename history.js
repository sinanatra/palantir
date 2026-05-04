// Paste this into the browser console while logged into LinkedIn.
// It will open a scraper tab, visit each profile, extract work history,
// and download palantir_history.csv when done.

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const esc = s => {
    s = String(s ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // --- UI panel (built via DOM API — LinkedIn blocks innerHTML via Trusted Types) ---
  const el = tag => document.createElement(tag);
  const css = (node, s) => { node.style.cssText = s; return node; };

  const panel = css(el('div'), [
    'position:fixed', 'bottom:20px', 'right:20px', 'z-index:999999',
    'background:#000', 'color:#fff', 'padding:16px',
    'font-family:monospace', 'font-size:11px', 'width:300px',
    'border:1px solid #444', 'line-height:1.6',
  ].join(';'));

  const title = el('b'); title.textContent = 'Palantir History Scraper';
  const logEl = css(el('div'), 'margin:8px 0');
  logEl.textContent = 'Select palantir_people.csv to begin.';

  const fileInput = el('input');
  fileInput.type = 'file'; fileInput.accept = '.csv';
  css(fileInput, 'display:block;margin:8px 0');

  const stopBtn = css(el('button'), 'display:none;background:#c00;color:#fff;border:none;padding:4px 10px;cursor:pointer;margin-right:6px');
  stopBtn.textContent = 'Stop';

  const dlBtn = css(el('button'), 'display:none;background:#0a0;color:#fff;border:none;padding:4px 10px;cursor:pointer');
  dlBtn.textContent = 'Download CSV';

  panel.appendChild(title);
  panel.appendChild(logEl);
  panel.appendChild(fileInput);
  panel.appendChild(stopBtn);
  panel.appendChild(dlBtn);
  document.body.appendChild(panel);

  const log = msg => { logEl.textContent = msg; console.log('[PalHistory]', msg); };

  // --- CSV parse (same as people.js) ---
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
        continue;
      }
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // --- Wait for file upload ---
  const people = await new Promise(resolve => {
    fileInput.onchange = e => {
      const reader = new FileReader();
      reader.onload = ev => {
        const rows = parseCsv(ev.target.result);
        const headers = rows[0].map(h => norm(h));
        const nameIdx = headers.indexOf('name');
        const urlIdx = headers.indexOf('profile_url');
        const list = rows.slice(1)
          .map(r => ({ name: norm(r[nameIdx]), profile_url: norm(r[urlIdx]) }))
          .filter(p => p.profile_url);
        resolve(list);
      };
      reader.readAsText(e.target.files[0]);
    };
  });

  log(`${people.length} profiles loaded. Opening scraper tab...`);
  await sleep(500);

  // --- Open scraper window ---
  const scraper = window.open('https://www.linkedin.com', '_pal_scraper');
  if (!scraper) {
    log('Popup blocked — allow popups for linkedin.com and retry.');
    return;
  }
  await sleep(3000);

  let stopped = false;
  stopBtn.style.display = 'inline';
  stopBtn.onclick = () => { stopped = true; log('Stopping after current profile...'); };

  // --- Wait for experience section to appear ---
  async function waitForExp(win, profileId, maxMs = 15000) {
    await sleep(1200); // let navigation start and old DOM clear
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      try {
        const url = win.location.href;
        if (!url.includes(profileId)) { await sleep(400); continue; }
        const anchor = win.document.querySelector('#experience');
        if (anchor) {
          // Confirm the section has actual list items, not just the anchor
          const section = anchor.closest('section') || anchor.parentElement;
          if (section && section.querySelector('li')) return true;
        }
      } catch (_) { /* navigation in progress */ }
      await sleep(400);
    }
    return false;
  }

  // Get aria-hidden span texts from item, optionally excluding a nested subtree
  function spansOf(el, exclude) {
    return [...el.querySelectorAll('span[aria-hidden="true"]')]
      .filter(s => !exclude || !exclude.contains(s))
      .map(s => norm(s.textContent))
      .filter(Boolean);
  }

  // --- Extract experience from a profile document ---
  function extractJobs(doc, person) {
    const jobs = [];

    // #experience is just an anchor div — find the containing section
    const anchor = doc.querySelector('#experience');
    if (!anchor) { console.log('  [dbg] no #experience anchor'); return jobs; }

    const section = anchor.closest('section') || anchor.parentElement?.closest('section') || anchor.parentElement;
    if (!section) { console.log('  [dbg] no section found'); return jobs; }

    const topList = section.querySelector('ul');
    if (!topList) { console.log('  [dbg] no ul in section'); return jobs; }

    const topItems = topList.querySelectorAll(':scope > li');
    console.log(`  [dbg] ${topItems.length} top-level items`);

    for (const item of topItems) {
      const nestedUl = item.querySelector('ul');

      if (nestedUl) {
        // Multiple roles at same company: header texts are those outside the nested ul
        const headerTexts = spansOf(item, nestedUl);
        const company = headerTexts[0] || '';
        for (const role of nestedUl.querySelectorAll(':scope > li')) {
          const job = parseItem(role, company, person);
          if (job) jobs.push(job);
        }
      } else {
        const job = parseItem(item, null, person);
        if (job) jobs.push(job);
      }
    }

    return jobs;
  }

  function parseItem(item, knownCompany, person) {
    const texts = spansOf(item);
    if (!texts.length) return null;

    let title = texts[0] || '';
    let company = knownCompany || '';
    let startDate = '', endDate = '';

    if (!knownCompany && texts[1]) {
      company = norm(texts[1].split('·')[0]);
    }

    for (const t of texts) {
      const m = t.match(/([A-Za-z]+\.?\s?\d{4}|\d{4})\s*[–\-]\s*([A-Za-z]+\.?\s?\d{4}|\d{4}|Present)/i);
      if (m) { startDate = m[1]; endDate = m[2]; break; }
    }

    if (/palantir/i.test(company)) return null;

    return { profile_url: person.profile_url, name: person.name, title, company, start_date: startDate, end_date: endDate };
  }

  // --- Main scrape loop ---
  const allJobs = [];

  for (let i = 0; i < people.length; i++) {
    if (stopped) break;

    const person = people[i];
    const profileId = person.profile_url.replace(/\/$/, '').split('/').pop();
    log(`[${i + 1}/${people.length}] ${person.name}`);

    try {
      scraper.location.href = person.profile_url;

      const found = await waitForExp(scraper, profileId);
      if (!found) {
        console.warn(`  No experience section: ${person.name}`);
        await sleep(2000);
        continue;
      }

      // Scroll to trigger lazy-loaded content
      scraper.scrollTo(0, scraper.document.body.scrollHeight * 0.4);
      await sleep(800);
      scraper.scrollTo(0, scraper.document.body.scrollHeight);
      await sleep(1000);

      const jobs = extractJobs(scraper.document, person);
      allJobs.push(...jobs);
      console.log(`  → ${jobs.length} previous jobs`);

    } catch (err) {
      console.error(`  Error: ${person.name}`, err);
    }

    // ~2-3s between profiles to avoid rate limiting
    await sleep(2000 + Math.random() * 1000);
  }

  try { scraper.close(); } catch (_) {}

  // --- Build CSV ---
  const headers = ['name', 'profile_url', 'title', 'company', 'start_date', 'end_date'];
  const csvRows = [headers, ...allJobs.map(j => headers.map(h => j[h] || ''))];
  const csvContent = csvRows.map(r => r.map(esc).join(',')).join('\n');

  log(`Done — ${allJobs.length} job records from ${people.length} profiles.`);

  dlBtn.style.display = 'inline';
  dlBtn.onclick = () => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'palantir_history.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  dlBtn.click();
})();
