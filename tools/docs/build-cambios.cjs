// tools/docs/build-cambios.cjs
// Genera la versión web de un documento de NOVEDADES de la API de PROPER
// a partir de su Markdown, reutilizando la hoja de estilos (identidad
// Puntos Plus) del contrato principal docs/api-proper.html.
//
// Uso:  node tools/docs/build-cambios.cjs 1.4
//   lee   docs/API-PROPER-CAMBIOS-v1.4.md
//   emite docs/api-proper-cambios-v1.4.html
//
// Conversor Markdown MÍNIMO — cubre solo lo que usan estos documentos:
// h1–h3, párrafos, tablas, listas (- y - [ ]), citas (>), bloques ```json
// y énfasis en línea (**negrita**, `código`).
const fs = require('fs');
const path = require('path');

const ver = process.argv[2];
if (!ver) { console.error('Falta la versión (ej. 1.4)'); process.exit(1); }
const root = path.join(__dirname, '..', '..');
const md = fs.readFileSync(path.join(root, 'docs', `API-PROPER-CAMBIOS-v${ver}.md`), 'utf8').replace(/\r\n/g, '\n');
const base = fs.readFileSync(path.join(root, 'docs', 'api-proper.html'), 'utf8');
const style = base.slice(base.indexOf('<style>'), base.indexOf('</style>') + 8);

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (t) => esc(t)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const json = (t) => esc(t)
  .replace(/("[^"\n]*")(\s*:)/g, '<span class="tok-key">$1</span>$2')
  .replace(/(:\s*)("[^"\n]*")/g, '$1<span class="tok-str">$2</span>')
  .replace(/(:\s*)(-?\d+(?:\.\d+)?)/g, '$1<span class="tok-num">$2</span>');

const lines = md.split('\n');
let i = 0, title = '', meta = [], intro = [], out = [], toc = [], sec = 0, open = false;
const closeSec = () => { if (open) { out.push('    </section>\n'); open = false; } };
const para = (buf) => `<p>${inline(buf.join(' '))}</p>`;

// Cabecera: h1 + líneas **Clave:** valor + párrafos hasta el primer h2
while (i < lines.length && !lines[i].startsWith('## ')) {
  const l = lines[i];
  if (l.startsWith('# ')) title = l.slice(2).trim();
  else if (/^\*\*[^*]+:\*\*/.test(l)) {
    const m = l.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    meta.push(`<span><b>${esc(m[1])}</b> ${inline(m[2])}</span>`);
  } else intro.push(l);
  i++;
}

function block(lines, start, target) {
  let j = start;
  while (j < lines.length) {
    const l = lines[j];
    if (l.startsWith('## ') || l.startsWith('# ')) break;
    if (l.trim() === '' || l.trim() === '---') { j++; continue; }
    if (l.startsWith('### ')) { target.push(`      <h3>${inline(l.slice(4).trim())}</h3>`); j++; continue; }
    if (l.startsWith('```')) {
      const buf = []; j++;
      while (j < lines.length && !lines[j].startsWith('```')) buf.push(lines[j++]);
      j++;
      target.push(`      <pre><code>${json(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (j < lines.length && lines[j].startsWith('|')) rows.push(lines[j++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      target.push('      <div class="table-wrap"><table>\n        <thead><tr>' +
        head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>\n        <tbody>\n' +
        body.map((r) => '          <tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('\n') +
        '\n        </tbody>\n      </table></div>');
      continue;
    }
    if (l.startsWith('> ')) {
      const buf = [];
      while (j < lines.length && lines[j].startsWith('>')) buf.push(lines[j++].replace(/^>\s?/, ''));
      target.push(`      <div class="callout c-ok"><p style="margin:0;">${inline(buf.join(' '))}</p></div>`);
      continue;
    }
    if (/^- /.test(l)) {
      const items = []; let checks = false;
      while (j < lines.length && (/^- /.test(lines[j]) || /^ {2,}\S/.test(lines[j]))) {
        if (/^- /.test(lines[j])) {
          let t = lines[j].slice(2);
          if (/^\[ \] /.test(t)) { checks = true; t = t.slice(4); }
          items.push(t);
        } else items[items.length - 1] += ' ' + lines[j].trim();
        j++;
      }
      target.push(`      <ul${checks ? ' class="checks"' : ''}>\n` +
        items.map((t) => `        <li>${inline(t)}</li>`).join('\n') + '\n      </ul>');
      continue;
    }
    const buf = [];
    while (j < lines.length && lines[j].trim() !== '' && !/^(#|\||>|- |```)/.test(lines[j])) buf.push(lines[j++].trim());
    target.push('      ' + para(buf));
  }
  return j;
}

// Introducción: párrafos y cita antes del primer h2
const introHtml = [];
block(intro, 0, introHtml);

while (i < lines.length) {
  const l = lines[i];
  if (l.startsWith('## ')) {
    closeSec(); sec++;
    const t = l.slice(3).replace(/^\d+\.\s*/, '').trim();
    toc.push(`    <a href="#c${sec}"><span class="n">${sec}</span>${esc(t)}</a>`);
    out.push(`    <section id="c${sec}">\n      <h2><span class="n">${String(sec).padStart(2, '0')}</span>${inline(t)}</h2>`);
    open = true; i++;
    i = block(lines, i, out);
  } else i++;
}
closeSec();

const html = `<title>Novedades API PROPER v${ver}</title>

${style}

<div class="shell">

  <header class="masthead">
    <div class="lockup">
      <div class="mark">P</div>
      <span class="lockup-name">Puntos&nbsp;Plus</span>
      <span class="lockup-x">⇄</span>
      <span class="lockup-partner">PROPER</span>
    </div>
    <h1>Novedades de la versión ${ver}</h1>
    <p class="standfirst">
      Solo lo que cambió en la API de integración: integraciones nuevas,
      modificaciones y correcciones. Todo es aditivo — lo que ya tienen
      integrado sigue funcionando sin tocarlo.
    </p>
    <div class="meta-row">
      ${meta.join('\n      ')}
    </div>
  </header>

  <nav class="toc" aria-label="Índice del documento">
    <div class="toc-label">Contenido</div>
${toc.join('\n')}
  </nav>

  <main>
${introHtml.join('\n')}

${out.join('\n')}
  </main>

  <footer class="foot">
    <p>
      <strong>Documento de novedades.</strong> Complementa al documento de
      integración v${ver}, que sigue siendo la referencia completa. Cualquier duda
      la resolvemos por el canal que les resulte más cómodo.
    </p>
    <p style="margin-bottom:0;">Puntos Plus · Gasolineras Turkaj · Chichicastenango, Guatemala</p>
  </footer>

</div>
`;
const dest = path.join(root, 'docs', `api-proper-cambios-v${ver}.html`);
fs.writeFileSync(dest, html);
console.log('OK →', path.relative(root, dest), `(${sec} secciones)`);
