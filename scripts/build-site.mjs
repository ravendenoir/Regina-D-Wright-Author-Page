// Builds Regina's public site from data.json (written by Regina's admin) and
// content/descriptions.json: the homepage, /books/, /series/<slug>/, /books/<slug>/,
// sitemap.xml and robots.txt. Run automatically by .github/workflows/build-site.yml.
// The newsletter form and its script are copied in unchanged from scripts/*.html.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://reginadwright.com';
const AUTHOR = 'Regina D. Wright';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (rel, content) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };

const data = JSON.parse(read('data.json'));
const DESC = fs.existsSync(path.join(ROOT, 'content/descriptions.json')) ? JSON.parse(read('content/descriptions.json')) : {};
const seriesInfo = DESC.series || {};
const bookDesc = DESC.books || {};
const NEWSLETTER = read('scripts/newsletter-block.html');
const PAGE_SCRIPT = read('scripts/page-script.html');
const today = new Date().toISOString().slice(0, 10);
const socials = data.socials || {};
const profile = data.profile || {};

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'book';
const isoDate = (d) => { d = String(d || '').trim(); if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10); const us = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return us ? `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}` : ''; };
const fmt = (d, opts = { month: 'long', day: 'numeric', year: 'numeric' }) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }) : '');
const short = (d) => fmt(d, { month: 'short', day: 'numeric', year: 'numeric' });
const paras = (t, cls = '') => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p${cls ? ` class="${cls}"` : ''}>${esc(x)}</p>`).join('');
const snippet = (t, n = 155) => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; t = t.slice(0, n); return t.slice(0, t.lastIndexOf(' ')).replace(/[,;:\-–—]+$/, '') + '…'; };
const isSeries = (s) => s && !/^standalone$/i.test(s.trim());
const local = (u) => (u || '').startsWith(SITE) ? u.slice(SITE.length) : (u || '');
const abs = (u) => (/^https?:/.test(u || '') ? u : SITE + (u || ''));
// Lighter cover for grids: images/thumbs/<file> when it exists
const thumb = (u) => { const m = /^\/images\/([^/]+\.(jpe?g|png|webp))$/i.exec(u || ''); return m && fs.existsSync(path.join(ROOT, 'images/thumbs', m[1])) ? '/images/thumbs/' + m[1] : u; };
const amazon = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

// ---------- books ----------
const used = new Set();
const books = (data.catalog || []).filter((b) => b && b.title).map((b) => {
  let slug = slugify(b.title); let n = 2;
  while (used.has(slug)) slug = slugify(b.title) + '-' + n++;
  used.add(slug);
  const date = isoDate(b.publishDate);
  const series = (b.series || '').trim();
  return { ...b, slug, date, series, order: Number(b.seriesOrder) || null, released: !date || date <= today,
    url: `/books/${slug}/`, seriesSlug: isSeries(series) ? slugify(series) : '', cover: local(b.coverUrl),
    description: b.synopsis || b.description || (bookDesc[b.id] && bookDesc[b.id].description) || '' };
});
for (const b of books) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(b.coverUrl || '');
  if (m) { const ext = m[1].toLowerCase().replace('jpeg', 'jpg'); write(`books/${b.slug}/cover.${ext}`, Buffer.from(m[2], 'base64')); b.cover = `/books/${b.slug}/cover.${ext}`; }
}
const readingOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.date || '').localeCompare(b.date || '') || a.title.localeCompare(b.title);
const seriesMap = new Map();
for (const b of books) if (b.seriesSlug) { if (!seriesMap.has(b.seriesSlug)) seriesMap.set(b.seriesSlug, { name: b.series, slug: b.seriesSlug, books: [] }); seriesMap.get(b.seriesSlug).books.push(b); }
const seriesList = [...seriesMap.values()].map((s) => ({ ...s, books: s.books.sort(readingOrder), url: `/series/${s.slug}/`, info: seriesInfo[s.name] || {} }))
  .sort((a, b) => (a.books[0].date || '').localeCompare(b.books[0].date || ''));
const standalones = books.filter((b) => !b.seriesSlug).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
const seriesOf = (b) => seriesList.find((s) => s.slug === b.seriesSlug);
const seriesLine = (b) => (b.seriesSlug ? `${b.series}${b.order ? ', Book ' + b.order : ''}` : 'Standalone');
const statusPill = (b) => (b.released ? '<span class="pill now">Available now</span>' : `<span class="pill">Coming ${esc(short(b.date))}</span>`);

const person = { '@type': 'Person', name: AUTHOR, url: SITE + '/', ...(amazon(socials.amazon) ? { sameAs: [socials.amazon] } : {}) };

// ---------- layout ----------
const NAV = [['/', 'Home', 'home'], ['/books/', 'Books', 'books'], ['/books/#series', 'Series', 'series'], ['/#coming-soon', 'Coming Soon', ''], ['/#about', 'About', ''], ['/#newsletter', 'Newsletter', '']];
const nav = (current) => `<nav aria-label="Main"><ul>${NAV.map(([h, l, k]) => `<li><a href="${h}"${k && k === current ? ' aria-current="page"' : ''}>${l}</a></li>`).join('')}</ul></nav>`;
const SOCIAL_LABELS = { amazon: 'Amazon Author Page', goodreads: 'Goodreads', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', patreon: 'Patreon', discord: 'Discord' };
const socialLinks = Object.keys(SOCIAL_LABELS).filter((k) => /^https?:\/\/[^/]+\/.+/.test(socials[k] || ''));

const head = ({ title, description, canonical, image, jsonld = [] }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${AUTHOR}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:image" content="${esc(abs(image || '/assets/banner.png'))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/rdw-logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...j }).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
`;
const FOOTER = `<footer>
  <div class="site-footer-nav"><a href="/">Home</a><a href="/books/">All Books</a><a href="/#newsletter">Newsletter</a>${amazon(socials.amazon) ? `<a href="${esc(socials.amazon)}" target="_blank" rel="noopener">Amazon</a>` : ''}</div>
  <p>
    &copy; <span id="yr"></span> Regina D. Wright &nbsp;|&nbsp; All rights reserved<br>
    <span style="font-size:0.72rem;">This site contains affiliate links. As an Amazon Associate I earn from qualifying purchases.</span>
  </p>
</footer>
`;
const TOPBAR = `<header><div class="header-inner" style="padding:22px 24px 20px"><a href="/" style="font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:#fff;text-decoration:none">Regina D. Wright</a><p class="tagline" style="margin:4px 0 0;font-size:0.95rem">Stories of family, love, and coming home</p></div></header>`;
const inner = (opts, current, body) => head(opts) + TOPBAR + '\n' + nav(current) + '\n' + body + '\n' + FOOTER + `<script>document.getElementById('yr').textContent = new Date().getFullYear();</script>\n</body>\n</html>\n`;

const card = (b, withNum = false) => `<a class="card" href="${b.url}"><span class="cv"><img src="${esc(thumb(b.cover))}" alt="${esc(b.title)} by Regina D. Wright, book cover" loading="lazy" width="400" height="640">${withNum && b.order ? `<span class="num" aria-label="Book ${b.order}">${b.order}</span>` : ''}</span>${statusPill(b)}<span class="t">${esc(b.title)}</span><span class="m">${esc(withNum ? (b.released ? 'Published ' + short(b.date) : '') : seriesLine(b))}</span></a>`;

// ---------- homepage ----------
const released = books.filter((b) => b.released).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const upcoming = books.filter((b) => !b.released).sort((a, b) => a.date.localeCompare(b.date));
const featured = released.find((b) => b.isTopSeller) || released[0] || upcoming[0];
const comingSoon = upcoming.filter((b) => b !== featured).slice(0, 3);
const bioParas = String(profile.bio || '').replace(/\\n/g, '\n').split(/\n\n+/).map((x) => x.trim()).filter(Boolean);

const featuredHtml = featured ? `<section class="featured" id="featured">
  <div class="section-inner featured-grid">
    <a href="${featured.url}"><img class="featured-cover" src="${esc(featured.cover)}" alt="${esc(featured.title)} by Regina D. Wright, book cover" width="640" height="1024"></a>
    <div class="featured-text">
      <p class="section-label">${featured.released ? 'Now Available' : 'Coming ' + esc(fmt(featured.date))}</p>
      <h2>${esc(featured.title)}</h2>
      <p class="featured-series">${esc(seriesLine(featured))}${seriesOf(featured) ? ' · ' + esc(seriesOf(featured).info.setting || '') : ''}</p>
      ${paras(featured.description.split('\n').slice(0, 3).join('\n'), 'blurb')}
      <div class="featured-actions">
        ${amazon(featured.amazonUrl) ? `<a class="btn-solid" href="${esc(featured.amazonUrl)}" target="_blank" rel="noopener">${featured.released ? 'Read on Amazon' : 'Pre-Order on Amazon'}</a>` : ''}
        <a class="link-more" href="${featured.url}">More about ${esc(featured.title)} &rarr;</a>
      </div>
    </div>
  </div>
</section>` : '';

const comingHtml = comingSoon.length ? `<section id="coming-soon">
  <div class="section-inner" style="text-align:center">
    <p class="section-label">On the Way</p>
    <h2 class="section-title">Coming Soon</h2>
    <div class="section-divider" style="margin-left:auto;margin-right:auto"></div>
    <div class="cards">${comingSoon.map((b) => card(b)).join('')}</div>
    <p style="margin-top:32px"><a class="link-more" href="/books/">See every book and release date &rarr;</a></p>
  </div>
</section>` : '<div id="coming-soon"></div>';

const seriesHtml = `<section class="series-wrap" id="books">
  <div class="section-inner">
    <div style="text-align:center">
      <p class="section-label">My Books</p>
      <h2 class="section-title" id="series">Find Your Next Favorite Series</h2>
      <div class="section-divider" style="margin-left:auto;margin-right:auto"></div>
    </div>
    <div class="series-list">
${seriesList.map((s) => `      <a class="series-card" href="${s.url}">
        <span class="fan">${s.books.slice(0, 4).map((b) => `<img src="${esc(thumb(b.cover))}" alt="" loading="lazy" width="200" height="320">`).join('')}</span>
        <h3>${esc(s.name)}</h3>
        ${s.info.setting ? `<span class="setting">${esc(s.info.setting)}</span>` : ''}
        ${s.info.tagline ? `<span class="tag">${esc(s.info.tagline)}</span>` : ''}
        <span class="count">${s.books.length} ${s.books.length === 1 ? 'book' : 'books'} · <span style="color:var(--rose);font-weight:700">Reading order &rarr;</span></span>
      </a>`).join('\n')}
    </div>
    <p style="text-align:center;margin-top:36px"><a class="btn-line" href="/books/">Browse All Books</a></p>
  </div>
</section>`;

const aboutHtml = `<section id="about">
  <div class="section-inner">
    <div class="about-grid">
      <div class="about-portrait">
        <img src="${esc(local(profile.photoUrl) || '/assets/rdw-logo.png')}" alt="Regina D. Wright">
      </div>
      <div class="about-text">
        <p class="section-label">About the Author</p>
        <h2 class="section-title">Welcome to my corner of the world.</h2>
        <div class="section-divider"></div>
        ${bioParas.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
      </div>
    </div>
  </div>
</section>`;

const connectHtml = socialLinks.length ? `<section id="connect">
  <div class="section-inner">
    <p class="section-label">Find Me</p>
    <h2 class="section-title">Let's Connect</h2>
    <div class="section-divider" style="margin-left:auto;margin-right:auto;"></div>
    <p style="color:var(--text-muted);max-width:480px;margin:0 auto 32px;text-align:center;">I love hearing from readers. Find me online or send a note — I read everything.</p>
    <div class="connect-links">
      ${socialLinks.map((k) => `<a href="${esc(socials[k])}" target="_blank" rel="noopener" class="connect-btn">${SOCIAL_LABELS[k]}</a>`).join('\n      ')}
    </div>
  </div>
</section>` : '';

const home = head({
  title: 'Regina D. Wright | Sweet Small-Town BWWM Romance Author',
  description: 'Regina D. Wright writes sweet, closed-door BWWM small-town romance about family, food, baseball and second chances. Start with Save Room, The Marigold Brothers Book 1.'.replace('Start with Save Room, The Marigold Brothers Book 1.', featured ? `Start with ${featured.title}${featured.seriesSlug ? ', ' + seriesLine(featured) : ''}.` : ''),
  canonical: '/', image: '/assets/banner.png',
  jsonld: [{ ...person, description: 'Author of sweet, closed-door BWWM small-town romance.', jobTitle: 'Author' }]
}) + `
<!-- ── HERO BANNER ── -->
<div class="hero-banner">
  <img src="assets/banner.png" alt="Regina D. Wright — author banner" loading="eager">
</div>

<!-- ── INTRO ── -->
<div class="intro">
  <h1>Regina D. Wright</h1>
  <p class="tagline">Stories of family, love, and coming home</p>
  <p class="promise">Sweet, closed-door small-town romance with Black heroines, the men who show up for them, and the families, kitchens and ballparks that hold them together.</p>
  <div class="ctas">
    <a href="/books/" class="header-cta">Browse the Books</a>
    <a href="#newsletter" class="btn-ghost">Join the Newsletter</a>
  </div>
</div>

${nav('home')}

${featuredHtml}

${comingHtml}

${seriesHtml}

${aboutHtml}

${NEWSLETTER}
${connectHtml}

${FOOTER}
${PAGE_SCRIPT}

</body>
</html>
`;
write('index.html', home);

// ---------- /books/ ----------
const groupHtml = (s) => `<section class="group">
  <div class="group-head"><h2>${esc(s.name)}</h2>${s.info.tagline ? `<span class="tag">${esc(s.info.tagline)}</span>` : ''}<a class="link-more" href="${s.url}">Reading order &rarr;</a></div>
  <div class="cards">${s.books.map((b) => card(b, true)).join('')}</div>
</section>`;
write('books/index.html', inner({
  title: 'Books by Regina D. Wright | Series Reading Order and Release Dates',
  description: `All ${books.length} books by Regina D. Wright: sweet, closed-door BWWM small-town romance${seriesList.length ? ' in ' + seriesList.map((s) => s.name).join(', ') : ''}. Reading order and release dates.`,
  canonical: '/books/', image: featured?.cover,
  jsonld: [{ '@type': 'CollectionPage', name: 'Books by Regina D. Wright', url: SITE + '/books/', author: person,
    mainEntity: { '@type': 'ItemList', numberOfItems: books.length, itemListElement: books.map((b, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + b.url, name: b.title })) } }]
}, 'books', `<main class="page">
  <p class="crumbs"><a href="/">Home</a> / Books</p>
  <h1>Books by Regina D. Wright</h1>
  <p class="lede">Sweet, closed-door small-town romance about family, food, baseball and second chances. Every series below is listed in reading order, with release dates for the books still on the way.</p>
  <div id="series"></div>
  ${seriesList.map(groupHtml).join('\n')}
  ${standalones.length ? `<section class="group"><div class="group-head"><h2>Standalones</h2></div><div class="cards">${standalones.map((b) => card(b)).join('')}</div></section>` : ''}
</main>`));

// ---------- /series/<slug>/ ----------
for (const s of seriesList) {
  const first = s.books[0];
  const soon = s.books.filter((b) => !b.released).length;
  write(`series/${s.slug}/index.html`, inner({
    title: `${s.name} Series Reading Order | Regina D. Wright`,
    description: s.info.intro ? snippet(`${s.name} reading order: ${s.info.intro}`) : `All ${s.books.length} books in ${s.name} by Regina D. Wright, in reading order.`,
    canonical: s.url, image: first?.cover,
    jsonld: [{ '@type': 'BookSeries', name: s.name, url: SITE + s.url, author: person, ...(s.info.intro ? { description: s.info.intro } : {}),
      hasPart: s.books.map((b) => ({ '@type': 'Book', name: b.title, url: SITE + b.url, ...(b.order ? { position: b.order } : {}) })) }]
  }, 'series', `<main class="page">
  <p class="crumbs"><a href="/">Home</a> / <a href="/books/">Books</a> / ${esc(s.name)}</p>
  <h1>${esc(s.name)}</h1>
  ${s.info.tagline ? `<p class="lede muted">${esc(s.info.tagline)}</p>` : ''}
  ${s.info.intro ? `<p class="lede">${esc(s.info.intro)}</p>` : ''}
  <p class="lede" style="font-size:0.95rem;color:var(--text-muted)">${s.books.length} ${s.books.length === 1 ? 'book' : 'books'} in reading order${soon ? `, ${soon} coming soon` : ''}.${first ? ` Start with <a href="${first.url}" style="color:var(--rose)">${esc(first.title)}</a>.` : ''}</p>
  <div class="cards" style="margin-top:36px">${s.books.map((b) => card(b, true)).join('')}</div>
</main>`));
}

// ---------- /books/<slug>/ ----------
for (const b of books) {
  const s = seriesOf(b);
  const i = s ? s.books.indexOf(b) : -1;
  const prev = i > 0 ? s.books[i - 1] : null;
  const next = s && i < s.books.length - 1 ? s.books[i + 1] : null;
  const buy = amazon(b.amazonUrl);
  write(`books/${b.slug}/index.html`, inner({
    title: `${b.title}${s ? ` (${s.name}${b.order ? ' Book ' + b.order : ''})` : ''} by Regina D. Wright`,
    description: b.description ? snippet(b.description) : `${b.title} by Regina D. Wright, ${seriesLine(b)}. ${b.released ? 'Available now' : 'Coming ' + fmt(b.date)} on Amazon.`,
    canonical: b.url, image: b.cover,
    jsonld: [{ '@type': 'Book', name: b.title, url: SITE + b.url, author: person, image: abs(b.cover),
      ...(b.description ? { description: snippet(b.description, 300) } : {}),
      ...(b.released && b.date ? { datePublished: b.date } : {}),
      ...(buy ? { sameAs: buy } : {}),
      ...(s ? { isPartOf: { '@type': 'BookSeries', name: s.name, url: SITE + s.url }, ...(b.order ? { position: b.order } : {}) } : {}) }]
  }, 'books', `<main class="page">
  <p class="crumbs"><a href="/">Home</a> / <a href="/books/">Books</a>${s ? ` / <a href="${s.url}">${esc(s.name)}</a>` : ''} / ${esc(b.title)}</p>
  <div class="book-detail">
    <img class="cover" src="${esc(b.cover)}" alt="${esc(b.title)} by Regina D. Wright, book cover" width="640" height="1024">
    <div class="book-info">
      ${statusPill(b)}
      <h1 style="margin-top:12px">${esc(b.title)}</h1>
      <p class="series-line">by Regina D. Wright${s ? ` · <a href="${s.url}">${esc(s.name)}${b.order ? ', Book ' + b.order : ''}</a>` : ''}</p>
      <span class="closed-door">Sweet, closed-door romance</span>
      ${b.description ? `<div class="synopsis">${paras(b.description)}</div>` : ''}
      <dl class="facts">
        <dt>Series</dt><dd>${s ? `<a href="${s.url}" style="color:var(--rose)">${esc(s.name)}</a>${b.order ? ', Book ' + b.order : ''}` : 'Standalone'}</dd>
        ${b.date ? `<dt>${b.released ? 'Published' : 'Release date'}</dt><dd>${esc(fmt(b.date))}</dd>` : ''}
      </dl>
      ${buy ? `<a class="btn-solid" href="${esc(buy)}" target="_blank" rel="noopener">${b.released ? 'Read on Amazon' : 'Pre-Order on Amazon'}</a>` : ''}
      ${prev || next ? `<div class="prevnext">${prev ? `<a href="${prev.url}">&larr; ${esc(prev.title)}</a>` : ''}${next ? `<a href="${next.url}">${esc(next.title)} &rarr;</a>` : ''}</div>` : ''}
    </div>
  </div>
</main>`));
}

// ---------- clean up pages for removed books/series ----------
for (const dir of ['books', 'series']) {
  const keep = new Set(dir === 'books' ? books.map((b) => b.slug) : seriesList.map((s) => s.slug));
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) continue;
  for (const name of fs.readdirSync(base)) { const p = path.join(base, name); if (fs.statSync(p).isDirectory() && !keep.has(name)) fs.rmSync(p, { recursive: true }); }
}

// ---------- sitemap + robots ----------
const urls = ['/', '/books/', ...seriesList.map((s) => s.url), ...books.map((b) => b.url)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built homepage, ${books.length} book pages, ${seriesList.length} series pages, /books/, sitemap (${urls.length} URLs).`);
