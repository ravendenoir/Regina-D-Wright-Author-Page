// Small, safe Markdown renderer for blog posts. Blog Desk carries an identical copy for its preview.
// Supports: ## / ### headings (a line that is bold all the way through is also a heading), paragraphs (single line breaks kept), **bold**, *italic*,
// [links](https://...) (a line that is only a link becomes a button), ![images](/images/blog/...), > quotes, - lists, 1. lists, --- dividers.
export function md(src) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeUrl = (u) => (/^(https?:\/\/|\/|#|mailto:)/i.test(u) ? u : '');
  const inline = (t) => esc(t)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => (safeUrl(u) ? `<img src="${u}" alt="${a}" loading="lazy">` : m))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t2, u) => (safeUrl(u) ? `<a href="${u}"${/^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : ''}>${t2}</a>` : m))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  const blocks = String(src || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((b) => b.replace(/^\n+|\n+$/g, '')).filter((b) => b.trim());
  return blocks.map((b) => {
    const lines = b.split('\n');
    if (/^#{1,3}\s/.test(b) && lines.length === 1) { const lvl = Math.max(2, b.match(/^#+/)[0].length); return `<h${lvl}>${inline(b.replace(/^#+\s*/, ''))}</h${lvl}>`; }
    if (/^(-{3,}|\*{3,})$/.test(b.trim())) return '<hr>';
    const bold = /^\*\*([^*\n]+)\*\*$/.exec(b.trim());
    if (bold) return `<h2>${inline(bold[1])}</h2>`;
    const only = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(b.trim());
    if (only && safeUrl(only[2])) return `<p class="post-cta"><a class="btn-line" href="${esc(only[2])}"${/^https?:/i.test(only[2]) ? ' target="_blank" rel="noopener"' : ''}>${esc(only[1])}</a></p>`;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    if (lines.every((l) => /^>\s?/.test(l))) return `<blockquote><p>${lines.map((l) => inline(l.replace(/^>\s?/, ''))).join('<br>')}</p></blockquote>`;
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(b.trim());
    if (img && safeUrl(img[2])) return `<figure><img src="${esc(img[2])}" alt="${esc(img[1])}" loading="lazy">${img[1] ? `<figcaption>${esc(img[1])}</figcaption>` : ''}</figure>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n');
}
