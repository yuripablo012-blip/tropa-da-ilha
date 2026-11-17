#!/usr/bin/env node
/* Tropa da Ilha — gerador de criativos (vídeos e imagens de anúncio).
 *
 * Abre o jogo de verdade num navegador sem janela, um robô joga, a tela é gravada e sai um vídeo pronto
 * para anúncio: 1080x1920 (Reels, TikTok, Stories, Shorts), com a chamada no começo e a tela final "Jogue grátis".
 * Nada é desenhado à parte: tudo o que aparece é o jogo como ele está no index.html.
 *
 * Uso:   node ferramentas/criativos/gerar.js                 (gera todos)
 *        node ferramentas/criativos/gerar.js horda ilha      (só esses)
 *        SAIDA=/outra/pasta node ferramentas/criativos/gerar.js
 * Precisa de: Node, Playwright (Chromium) e ffmpeg.
 * Para criar um criativo novo, copie um item da lista CRIATIVOS lá embaixo e troque a chamada e as cenas.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const JOGO = 'file://' + path.join(RAIZ, 'index.html');
const SAIDA = process.env.SAIDA || path.join(RAIZ, 'criativos');
const SITE = 'piratadailha.online';
const TELA = { width: 360, height: 640 }, ESCALA = 3; // 360x640 x3 = 1080x1920
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const FEITOS = [];

/* ---------- camada do anúncio (chamada, endereço, tela final, dedo), desenhada por cima do jogo ---------- */
const CSS_AD = `
#ad { position: fixed; inset: 0; z-index: 9999; pointer-events: none; font-family: "Luckiest Guy", Impact, sans-serif; text-transform: uppercase; text-align: center; color: #fff; overflow: hidden; }
#ad .hook { position: absolute; left: 14px; right: 14px; top: 15%; font-size: 37px; line-height: 1.02; color: #ffd84a; -webkit-text-stroke: 2.4px #1d2230; paint-order: stroke fill; text-shadow: 0 5px 0 #1d2230, 0 10px 18px rgba(0,0,0,.55); transform: rotate(-3deg) scale(0); opacity: 0; transition: transform .35s cubic-bezier(.3,1.7,.5,1), opacity .25s; }
#ad .hook b { display: block; color: #fff; font-weight: 400; font-size: .72em; margin-top: 4px; }
#ad .hook.on { transform: rotate(-3deg) scale(1); opacity: 1; }
#ad .url { position: absolute; left: 50%; top: 13.5%; transform: translate(-50%, -8px); opacity: 0; transition: all .3s; background: rgba(13,18,30,.78); border: 2px solid rgba(255,255,255,.35); border-radius: 30px; padding: 6px 14px 3px; font-size: 14px; letter-spacing: .4px; white-space: nowrap; }
#ad .url.on { opacity: 1; transform: translate(-50%, 0); }
#ad .dedo { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: radial-gradient(rgba(255,255,255,.75), rgba(255,255,255,.28) 60%, rgba(255,255,255,0) 72%); border: 2.5px solid rgba(255,255,255,.9); box-shadow: 0 0 0 7px rgba(255,255,255,.16); opacity: 0; transition: opacity .2s; left: 50%; top: 88%; }
#ad .dedo.on { opacity: 1; }
#ad .fim { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; background: radial-gradient(ellipse at 50% 45%, rgba(8,26,52,.72), rgba(4,10,22,.94)); -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px); opacity: 0; transition: opacity .35s; }
#ad .fim.on { opacity: 1; }
#ad .fim img { width: 86%; max-width: 310px; transform: scale(.6); transition: transform .5s cubic-bezier(.3,1.7,.5,1); filter: drop-shadow(0 10px 14px rgba(0,0,0,.6)); }
#ad .fim.on img { transform: scale(1); }
#ad .fim .t { font-size: 26px; line-height: 1.08; -webkit-text-stroke: 1.6px #1d2230; paint-order: stroke fill; text-shadow: 0 4px 0 #1d2230; }
#ad .fim .b { font-size: 34px; padding: 14px 34px 9px; border-radius: 22px; border: 4px solid #1d2230; background: linear-gradient(#7be86f, #36b53a); box-shadow: 0 7px 0 #1d2230, 0 14px 18px rgba(0,0,0,.45), inset 0 -6px 0 rgba(0,0,0,.18); -webkit-text-stroke: 1.4px #1d2230; paint-order: stroke fill; animation: adpulsa 1s ease-in-out infinite; }
#ad .fim .u { font-size: 22px; color: #ffd84a; -webkit-text-stroke: 1.2px #1d2230; paint-order: stroke fill; letter-spacing: .5px; }
#ad .fim .s { font-family: "Nunito", system-ui, sans-serif; text-transform: none; font-weight: 900; font-size: 14px; opacity: .9; }
#ad .faixa { position: absolute; left: 50%; bottom: 17%; transform: translateX(-50%); display: none; flex-direction: column; align-items: center; gap: 7px; }
#ad .faixa.on { display: flex; }
#ad .faixa span { font-size: 30px; padding: 12px 30px 8px; border-radius: 20px; border: 4px solid #1d2230; background: linear-gradient(#7be86f, #36b53a); box-shadow: 0 7px 0 #1d2230, 0 14px 18px rgba(0,0,0,.5), inset 0 -6px 0 rgba(0,0,0,.18); -webkit-text-stroke: 1.4px #1d2230; paint-order: stroke fill; white-space: nowrap; }
#ad .faixa small { font-size: 19px; color: #ffd84a; -webkit-text-stroke: 1.2px #1d2230; paint-order: stroke fill; text-shadow: 0 3px 0 #1d2230; }
@keyframes adpulsa { 50% { transform: scale(1.07); } }
`;
async function camada(page) {
  await page.evaluate(([css, site]) => {
    if (document.getElementById('ad')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const ad = document.createElement('div'); ad.id = 'ad';
    ad.innerHTML = '<div class="hook"></div><div class="url">' + site + '</div><div class="dedo"></div><div class="faixa"><span>JOGUE GRÁTIS</span><small>' + site + '</small></div><div class="fim"><img alt=""><div class="t"></div><div class="b">JOGUE GRÁTIS</div><div class="u">' + site + '</div><div class="s">Direto no navegador, sem instalar nada</div></div>';
    document.body.appendChild(ad); ad.querySelector('.fim img').src = document.querySelector('.slogo').src;
    window.AD = {
      hook: (t, sub, seg) => { const h = ad.querySelector('.hook'); clearTimeout(window.__hk); if (t) { h.textContent = t; if (sub) { const b = document.createElement('b'); b.textContent = sub; h.appendChild(b); } } h.classList.toggle('on', !!t); ad.querySelector('.url').classList.toggle('on', !t); if (t && seg) window.__hk = setTimeout(() => window.AD.hook(''), seg * 1000); },
      cartaz: (t, sub) => { window.AD.limpa(); window.AD.hook(t, sub); ad.querySelector('.url').classList.remove('on'); ad.querySelector('.faixa').classList.add('on'); },
      url: (on) => ad.querySelector('.url').classList.toggle('on', !!on),
      dedo: (x, y) => { const d = ad.querySelector('.dedo'); if (x == null) { d.classList.remove('on'); return; } d.style.left = x + 'px'; d.style.top = y + 'px'; d.classList.add('on'); },
      fim: (t) => { ad.querySelector('.fim .t').textContent = t || ''; ad.querySelector('.hook').classList.remove('on'); ad.querySelector('.url').classList.remove('on'); ad.querySelector('.dedo').classList.remove('on'); ad.querySelector('.fim').classList.add('on'); },
      limpa: () => { ad.querySelectorAll('.on').forEach((e) => e.classList.remove('on')); },
    };
  }, [CSS_AD, SITE]);
}

/* ---------- gravação: quadros da tela + o instante de cada um ---------- */
async function gravador(page) {
  const cdp = await page.context().newCDPSession(page), quadros = [];
  cdp.on('Page.screencastFrame', (f) => { quadros.push({ d: Buffer.from(f.data, 'base64'), t: f.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  let ligado = false;
  return {
    quadros,
    liga: async () => { if (!ligado) { ligado = true; await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: TELA.width * ESCALA, maxHeight: TELA.height * ESCALA, everyNthFrame: 1 }); } },
    desliga: async () => { if (ligado) { ligado = false; await cdp.send('Page.stopScreencast'); await espera(120); } },
  };
}
function monta(partes, arq) { // partes: listas de quadros gravadas em separado, coladas uma atrás da outra
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'criativo-')); let n = 0, lista = '', total = 0;
  for (const q of partes) { for (let i = 0; i < q.length; i++) { const dur = i + 1 < q.length ? Math.max(.001, Math.min(.25, q[i + 1].t - q[i].t)) : 1 / 30; const f = path.join(dir, 'q' + String(++n).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, q[i].d); lista += "file '" + f + "'\nduration " + dur.toFixed(4) + '\n'; total += dur; } }
  fs.writeFileSync(path.join(dir, 'lista.txt'), lista);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'lista.txt'), '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-maxrate', '9M', '-bufsize', '18M', '-movflags', '+faststart', '-an', arq], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) throw new Error('ffmpeg: ' + (r.stderr || '').slice(0, 400));
  return { quadros: n, segundos: total, fps: n / total };
}

/* ---------- preparo do jogo ---------- */
async function abre(navegador) {
  const ctx = await navegador.newContext({ viewport: TELA, deviceScaleFactor: ESCALA, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', (e) => erros.push(e.message)); page.erros = erros;
  await page.goto(JOGO); await page.waitForFunction(() => typeof P !== 'undefined' && document.getElementById('splash').classList.contains('hidden'), null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready); await camada(page); return page;
}
// jogador de mostruário: canhão e ilha evoluídos de acordo com a fase
async function jogador(page, { fase = 20, nivel, tier, vila, moedas = 0, ela = false } = {}) {
  await page.evaluate(([fase, nivel, tier, vila, moedas, ela]) => {
    Object.assign(P, { gender: ela ? 'f' : 'm', tut: 1, mute: true, presente: 1, level: fase, sel: fase, wins: fase, dmg: nivel, rate: nivel, hp: nivel, tier, coins: moedas, startCards: 0, hlv: Math.max(1, Math.round(fase / 3)), offSeen: { p1: 1, p1v: 1, p2: 1, p2v: 1, p3: 1, p3v: 1 } });
    P.vila = { i: 0, b: {}, t: Date.now(), v9: 1, z0: 1, inf: 1 }; VDEF.forEach((d, i) => { P.vila.b[d.k] = Math.max(1, vila + ((i * 5) % 7) - 3); });
    document.getElementById('genOv').classList.add('hidden'); document.getElementById('bemOv').classList.add('hidden'); if (typeof setGender === 'function') setGender(P.gender); showMenu();
  }, [fase, nivel != null ? nivel : Math.round(fase * .9) + 4, tier != null ? tier : Math.min(8, Math.floor(fase / 12)), vila != null ? vila : Math.max(2, Math.round(fase / 3)), moedas, ela]);
}

/* ---------- cenas ---------- */
// batalha: o robô segura o dedo na tela e mira no inimigo mais perto; poderes = [{ t: segundos, id: 'rate' | 'dmg' | 'heart' }]
// Durante o "aquece" (não gravado) o robô não atira, para a ponte encher. Com chefe: true vai direto para a onda do chefe,
// espera ele entrar e o traz para o meio da ponte, e o robô mira nele.
async function cenaBatalha(page, rec, { fase = 20, aquece = 4.3, dur = 8, poderes = [], chefe = false, hook, sub, hookDur = 3, foto } = {}) {
  await page.evaluate((chefe) => { startLevel(); document.getElementById('hint').classList.add('hidden'); if (chefe) { G.waves = [G.waves[G.waves.length - 1]]; G.wi = -1; G.spawnQ = []; G.enemies = []; nextWave(); } }, chefe);
  const Y = TELA.height * .88; await page.mouse.move(TELA.width / 2, Y);
  if (chefe) { await page.waitForFunction(() => G && G.enemies.some((e) => e.boss || e.t === 'boss'), null, { timeout: 15000 }).catch(() => {}); await page.evaluate(() => { const b = G.enemies.find((e) => e.boss || e.t === 'boss'); if (b) b.y = H * .34; }); }
  const fila = poderes.slice().sort((a, b) => a.t - b.t); let t0 = 0, gravando = false, escolha = null;
  const ini = Date.now();
  for (;;) {
    const agora = (Date.now() - ini) / 1000;
    if (!gravando && agora >= aquece) { gravando = true; t0 = Date.now(); await page.mouse.down(); await page.evaluate(([h, s, d]) => { AD.limpa(); AD.hook(h, s, d); }, [hook || '', sub || '', hookDur]); await rec.liga(); }
    const t = gravando ? (Date.now() - t0) / 1000 : -1;
    if (gravando && t >= dur) break;
    const s = await page.evaluate((chefe) => { if (!G) return { s: 'fim' }; const vivos = G.enemies.filter((e) => !e.dead && e.t !== 'barrel').sort((a, b) => b.y - a.y), perto = vivos[0], bs = chefe && vivos.find((e) => e.boss || e.t === 'boss'), en = bs && !(perto && perto.y > H * .55) ? bs : perto; return { s: G.state, x: en ? en.x / W : null }; }, chefe);
    if (s.s === 'fim' || s.s === 'end') break;
    if (s.s === 'pick') { // mostra as cartas um instante e escolhe
      await page.mouse.up(); await page.evaluate(() => { AD.dedo(null); AD.hook(''); }); await espera(950);
      await page.evaluate((id) => { G.pickT = 0; const c = document.querySelector('#cards [data-pw="' + id + '"]') || document.querySelector('#cards [data-pw]'); if (c) c.click(); }, escolha || 'rate');
      await espera(120); await page.mouse.move(TELA.width / 2, Y); if (gravando) await page.mouse.down(); continue;
    }
    if (gravando && fila.length && t >= fila[0].t) { escolha = fila.shift().id; await page.mouse.up(); await page.evaluate(() => { G.charge = 1; }); await espera(60); const b = await page.evaluate(() => { const r = document.getElementById('spBtn').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.evaluate(([x, y]) => AD.dedo(x, y), b); await espera(220); await page.touchscreen.tap(b[0], b[1]); await espera(150); continue; }
    if (gravando && s.x != null) { const x = Math.max(.14, Math.min(.86, s.x)) * TELA.width; await page.mouse.move(x, Y, { steps: 2 }); await page.evaluate(([x, y]) => AD.dedo(x, y), [x, Y]); }
    await espera(70);
  }
  await page.mouse.up();
  if (foto) await fotos(page, foto);
}
// um passo de roteiro fora da batalha (menu, canhão, ilha)
async function passo(page, p) {
  if (p.pagina) { await page.evaluate((pg) => { if (G) showMenu(); showPage(pg); }, p.pagina); if (p.pagina === 'vila') { await page.waitForFunction(() => VS.rdy, null, { timeout: 60000 }); await espera(700); } else await espera(350); }
  if (p.js) await page.evaluate(p.js);
  if (p.ficha) { await page.evaluate((k) => openVSheet(k), p.ficha); await espera(p.pausa || 600); }
  if (p.zoom) await page.evaluate(([f, dur]) => new Promise((ok) => { const s0 = VS.S, s1 = s0 * f, t0 = performance.now(); (function q() { const u = Math.min(1, (performance.now() - t0) / (dur * 1000)), e = u * u * (3 - 2 * u), ns = s0 + (s1 - s0) * e, k = ns / VS.S; VS.px *= k; VS.py *= k; VS.S = ns; VS.cam = null; if (u < 1) requestAnimationFrame(q); else ok(); })(); }), [p.zoom, p.dur || 2]);
  if (p.toca) for (let i = 0; i < (p.vezes || 1); i++) {
    const c = await page.evaluate((sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.offsetParent && !x.disabled); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, p.toca);
    if (!c) break; await page.evaluate(([x, y]) => AD.dedo(x, y), c); await espera(170); await page.touchscreen.tap(c[0], c[1]); await espera(p.pausa != null ? p.pausa : 380);
  }
  if (p.semDedo) await page.evaluate(() => AD.dedo(null));
  if (p.hook != null) await page.evaluate(([h, s, d]) => AD.hook(h, s, d), [p.hook, p.sub || '', p.hookDur || 0]);
  if (p.foto) await fotos(page, p.foto);
  if (p.espera) await espera(p.espera * 1000);
}
// roteiro: "antes" acontece sem gravar; "passos" são gravados
async function cenaRoteiro(page, rec, { antes = [], passos = [], hook, sub, hookDur = 3 } = {}) {
  for (const p of antes) await passo(page, p);
  await page.evaluate(([h, s, d]) => { AD.limpa(); AD.hook(h, s, d); }, [hook || '', sub || '', hookDur]); await espera(60); await rec.liga();
  for (const p of passos) await passo(page, p);
}
// imagem parada: o que está na tela, com a chamada e o botão por cima. foto = { nome, titulo, sub }
async function fotos(page, { nome, titulo, sub }) {
  const antes = await page.evaluate(() => { const st = G ? G.state : null; if (G && G.state === 'run') G.state = 'pause'; return st; }); // congela a batalha para a foto
  await page.evaluate(([t, s]) => AD.cartaz(t, s), [titulo, sub || '']); await espera(450);
  const arq = path.join(SAIDA, 'tropa_' + nome + '.jpg'); await page.screenshot({ path: arq, type: 'jpeg', quality: 92 }); FEITOS.push(arq);
  await page.evaluate((st) => { AD.limpa(); if (G && st === 'run') G.state = 'run'; }, antes);
}
// tela final: logo, "Jogue grátis" e o endereço, por cima do jogo desfocado
async function cenaFim(page, rec, { texto = 'Defenda a ponte e construa sua ilha!', dur = 2.8 } = {}) { await page.evaluate((t) => AD.fim(t), texto); await rec.liga(); await espera(dur * 1000); }

/* ---------- os criativos ---------- */
/* Cada criativo: nome do arquivo, o jogador de mostruário e as cenas, na ordem.
   Cenas: ['batalha', {...}]  ['roteiro', {...}]  ['fim', {...}]. Textos curtos: a chamada fica 3 segundos na tela. */
const MELHORA = (k) => [{ toca: '[data-buy="' + k + '"]', vezes: 2, pausa: 330 }];
const CRIATIVOS = [
  { nome: 'horda', jogador: { fase: 40, nivel: 24 }, cenas: [
    ['batalha', { hook: 'Defenda a ponte!', sub: 'Segure e atire', dur: 11, poderes: [{ t: 3.2, id: 'rate' }, { t: 7, id: 'dmg' }] }],
    ['fim', { texto: 'Quantas fases você aguenta?' }]] },
  { nome: 'chefe', jogador: { fase: 30, nivel: 44 }, cenas: [
    ['batalha', { chefe: true, aquece: 1.5, hook: 'Você derrota o chefe?', dur: 10.5, poderes: [{ t: 3.2, id: 'dmg' }, { t: 6.8, id: 'rate' }] }],
    ['fim', { texto: 'A cada fase o chefe fica mais forte' }]] },
  { nome: 'ilha', jogador: { fase: 20, vila: 2, moedas: 5e8 }, cenas: [
    ['roteiro', { antes: [{ pagina: 'vila' }], hook: 'Construa sua ilha pirata!', passos: [{ zoom: 1.22, dur: 2.6 }, { ficha: 'tes', pausa: 900 }, { toca: '#vShBuy', vezes: 9, pausa: 360 }, { espera: .5 }, { toca: '#vShClose', pausa: 200, semDedo: true }, { zoom: .86, dur: 1.8 }, { espera: .4 }] }],
    ['fim', { texto: 'Ganhe moedas na batalha e construa sua ilha' }]] },
  { nome: 'canhao', jogador: { fase: 18, moedas: 5e8 }, cenas: [
    ['roteiro', { antes: [{ js: 'P.dmg = P.rate = P.hp = SK().cap - 2; save()' }, { pagina: 'cannon' }], hook: 'Evolua seu canhão!', passos: [{ espera: 1.2 }, ...MELHORA('dmg'), ...MELHORA('rate'), ...MELHORA('hp'), { espera: .5 }, { toca: '#shBtn', pausa: 2600, semDedo: true }] }],
    ['batalha', { dur: 4.5, poderes: [{ t: 1, id: 'rate' }] }],
    ['fim', { texto: 'Canhão mais forte, fases mais altas' }]] },
  { nome: 'completo', jogador: { fase: 36, nivel: 22, vila: 5, moedas: 5e8 }, cenas: [
    ['batalha', { hook: 'Atire. Ganhe moedas.', sub: 'Construa sua ilha!', dur: 5.6, poderes: [{ t: 3.1, id: 'dmg' }] }],
    ['roteiro', { antes: [{ pagina: 'vila' }, { zoom: 1.15, dur: .1 }], passos: [{ ficha: 'tes', pausa: 500 }, { toca: '#vShBuy', vezes: 6, pausa: 330 }, { toca: '#vShClose', pausa: 150, semDedo: true }, { zoom: .9, dur: 1.2 }] }],
    ['batalha', { chefe: true, aquece: 1.5, dur: 4.4, poderes: [{ t: 1, id: 'rate' }] }],
    ['fim', { texto: 'Defenda a ponte e construa sua ilha!' }]] },
  // imagens paradas (para anúncio de imagem e capa): sai um .jpg em vez de vídeo
  { nome: 'imagens', jogador: { fase: 40, nivel: 24, vila: 9, moedas: 5e8 }, soFotos: true, cenas: [
    ['batalha', { dur: 1.1, foto: { nome: 'img_batalha', titulo: 'Defenda a ponte!', sub: 'Jogo de pirata no navegador' } }],
    ['batalha', { chefe: true, aquece: 1.5, dur: 1.3, foto: { nome: 'img_chefe', titulo: 'Você derrota o chefe?' } }],
    ['roteiro', { antes: [{ pagina: 'vila' }, { zoom: 1.1, dur: .1 }, { espera: .5 }], passos: [{ foto: { nome: 'img_ilha', titulo: 'Construa sua ilha pirata!' } }] }]] },
];

(async () => {
  const quais = process.argv.slice(2), lista = CRIATIVOS.filter((c) => !quais.length || quais.includes(c.nome));
  if (!lista.length) { console.log('Criativos disponíveis: ' + CRIATIVOS.map((c) => c.nome).join(', ')); process.exit(1); }
  fs.mkdirSync(SAIDA, { recursive: true });
  const nav = await chromium.launch();
  for (const c of lista) {
    const page = await abre(nav), partes = [];
    await jogador(page, c.jogador);
    for (const [tipo, op] of c.cenas) {
      const rec = await gravador(page);
      if (tipo === 'batalha') await cenaBatalha(page, rec, Object.assign({ fase: c.jogador.fase }, op));
      else if (tipo === 'roteiro') await cenaRoteiro(page, rec, op);
      else if (tipo === 'fim') await cenaFim(page, rec, op);
      await rec.desliga(); partes.push(rec.quadros);
    }
    if (!c.soFotos) {
      const arq = path.join(SAIDA, 'tropa_' + c.nome + '.mp4'), r = monta(partes, arq); FEITOS.push(arq);
      console.log(c.nome + ': ' + r.segundos.toFixed(1) + ' s, ' + r.quadros + ' quadros (' + r.fps.toFixed(0) + ' por segundo na gravação), ' + (fs.statSync(arq).size / 1e6).toFixed(1) + ' MB');
    }
    if (page.erros.length) console.log('  ERROS no jogo durante ' + c.nome + ': ' + JSON.stringify(page.erros.slice(0, 3)));
    await page.context().close();
  }
  await nav.close();
  console.log('\nProntos em ' + SAIDA + ':\n' + FEITOS.map((f) => '  ' + path.basename(f)).join('\n'));
})().catch((e) => { console.error('Falhou: ' + e.message); process.exit(1); });
