#!/usr/bin/env node
/* Tropa da Ilha — gerador de criativos (vídeos e imagens de anúncio).
 *
 * Abre o jogo de verdade num navegador sem janela, um robô joga, a tela é gravada e sai um vídeo pronto
 * para anúncio: 1080x1920 (Reels, TikTok, Stories, Shorts), com a chamada no começo e a tela final "Jogue grátis".
 * Nada é desenhado à parte: tudo o que aparece é o jogo como ele está no index.html.
 *
 * Uso:   node ferramentas/criativos/gerar.js                 (gera todos)
 *        node ferramentas/criativos/gerar.js horda ilha      (só esses)
 *        node ferramentas/criativos/gerar.js --sem-legenda curioso_6_formas   (sem o texto de cima; a etiqueta "link na bio" continua no final)
 *        node ferramentas/criativos/gerar.js --sem-legenda --sem-link curioso_6_formas   (só o jogo, sem nenhum texto por cima)
 *        node ferramentas/criativos/gerar.js --sem-legenda --sem-chamada historia_1_dia  (sem headline nem legenda; fica só o link no final)
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
const SEM_LEGENDA = process.argv.includes('--sem-legenda'); // sem a caixa de legenda (o texto de cima) nem o anel de destaque
const SEM_LINK = process.argv.includes('--sem-link');       // sem a etiqueta "Jogue grátis · link na bio"
const SEM_CHAMADA = process.argv.includes('--sem-chamada'); // sem a headline grande do começo
const SUFIXO = (SEM_LEGENDA && SEM_LINK ? '_limpo' : SEM_LEGENDA ? '_sem_legenda' : SEM_LINK ? '_sem_link' : '') + (SEM_CHAMADA ? '_sem_headline' : '');

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
#ad .leg { position: absolute; left: 22px; right: 22px; top: 18.5%; font-family: "Nunito", system-ui, sans-serif; text-transform: none; font-weight: 900; font-size: 25px; line-height: 1.52; opacity: 0; transform: scale(.75); transition: transform .22s cubic-bezier(.3,1.6,.5,1), opacity .15s; }
#ad .leg.on { opacity: 1; transform: scale(1); }
#ad .leg span { background: #fff; color: #111; padding: 5px 13px; border-radius: 9px; -webkit-box-decoration-break: clone; box-decoration-break: clone; box-shadow: 0 4px 10px rgba(0,0,0,.35); }
#ad .anel { position: absolute; border: 4px solid #ffd84a; border-radius: 20px; box-shadow: 0 0 0 3px rgba(29,34,48,.9), 0 0 16px #ffd84a; display: none; animation: adpulsa .7s ease-in-out infinite; }
#ad .anel.on { display: block; }
#ad .tag { position: absolute; left: 50%; top: 61%; transform: translate(-50%, 0) scale(0); transition: transform .3s cubic-bezier(.3,1.7,.5,1); font-size: 21px; white-space: nowrap; padding: 10px 20px 6px; border-radius: 18px; border: 3px solid #1d2230; background: linear-gradient(#7be86f, #36b53a); box-shadow: 0 5px 0 #1d2230, 0 10px 14px rgba(0,0,0,.45); -webkit-text-stroke: 1.1px #1d2230; paint-order: stroke fill; }
#ad .tag.on { transform: translate(-50%, 0) scale(1); }
@keyframes adpulsa { 50% { transform: scale(1.07); } }
`;
async function camada(page) {
  await page.evaluate(([css, site, semLeg, semLink, semChamada]) => {
    if (document.getElementById('ad')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const ad = document.createElement('div'); ad.id = 'ad';
    ad.innerHTML = '<div class="hook"></div><div class="url">' + site + '</div><div class="anel"></div><div class="leg"><span></span></div><div class="tag"></div><div class="dedo"></div><div class="faixa"><span>JOGUE GRÁTIS</span><small>' + site + '</small></div><div class="fim"><img alt=""><div class="t"></div><div class="b">JOGUE GRÁTIS</div><div class="u">' + site + '</div><div class="s">Direto no navegador, sem instalar nada</div></div>';
    document.body.appendChild(ad); ad.querySelector('.fim img').src = document.querySelector('.slogo').src;
    window.AD = {
      hook: (t, sub, seg) => { const h = ad.querySelector('.hook'); clearTimeout(window.__hk); if (t) { h.textContent = t; if (sub) { const b = document.createElement('b'); b.textContent = sub; h.appendChild(b); } } h.classList.toggle('on', !!t); ad.querySelector('.url').classList.toggle('on', !t && !window.AD.org); if (t && seg) window.__hk = setTimeout(() => window.AD.hook(''), seg * 1000); },
      cartaz: (t, sub) => { window.AD.limpa(); window.AD.hook(t, sub); ad.querySelector('.url').classList.remove('on'); ad.querySelector('.faixa').classList.add('on'); },
      url: (on) => ad.querySelector('.url').classList.toggle('on', !!on),
      troca: (t) => String(t).replace('{pegos}', (window.__ouro || { k: 0 }).k).replace('{renda}', window.__renda || '').replace('{moedas}', typeof G !== 'undefined' && G ? fmtN(G.earned) : ''), // valores tirados do jogo na hora
      leg: (t) => { const l = ad.querySelector('.leg'); l.classList.remove('on'); if (!t) return; l.querySelector('span').textContent = window.AD.troca(t); void l.offsetWidth; l.classList.add('on'); }, // legenda no estilo do Instagram
      anel: (sel) => { const a = ad.querySelector('.anel'), e = sel && document.querySelector(sel); if (!e) { a.classList.remove('on'); return; } const r = e.getBoundingClientRect(); a.style.left = (r.left - 7) + 'px'; a.style.top = (r.top - 7) + 'px'; a.style.width = (r.width + 6) + 'px'; a.style.height = (r.height + 6) + 'px'; a.classList.add('on'); }, // destaca um pedaço da tela
      tag: (t) => { const g = ad.querySelector('.tag'); g.textContent = t || ''; g.classList.toggle('on', !!t); },
      dedo: (x, y) => { const d = ad.querySelector('.dedo'); if (x == null) { d.classList.remove('on'); return; } d.style.left = x + 'px'; d.style.top = y + 'px'; d.classList.add('on'); },
      fim: (t) => { ad.querySelector('.fim .t').textContent = t || ''; ad.querySelector('.hook').classList.remove('on'); ad.querySelector('.url').classList.remove('on'); ad.querySelector('.dedo').classList.remove('on'); ad.querySelector('.fim').classList.add('on'); },
      limpa: () => { ad.querySelectorAll('.on').forEach((e) => e.classList.remove('on')); },
    };
    if (semLeg) { window.AD.leg = window.AD.anel = () => {}; }
    if (semLink) { window.AD.tag = () => {}; }
    if (semChamada) { window.AD.hook = () => {}; }
  }, [CSS_AD, SITE, SEM_LEGENDA, SEM_LINK, SEM_CHAMADA]);
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
    P.vila = { i: Math.max(0, Math.floor((vila - 3) / 9)), b: {}, t: Date.now(), v9: 1, z0: 1, inf: 1 }; /* categoria da vila de acordo com o nível, para a janela "A vila evoluiu" não abrir em cima da cena */ VDEF.forEach((d, i) => { P.vila.b[d.k] = Math.max(1, vila + ((i * 5) % 7) - 3); });
    document.getElementById('genOv').classList.add('hidden'); document.getElementById('bemOv').classList.add('hidden'); if (typeof setGender === 'function') setGender(P.gender); showMenu();
  }, [fase, nivel != null ? nivel : Math.round(fase * .9) + 4, tier != null ? tier : Math.min(8, Math.floor(fase / 12)), vila != null ? vila : Math.max(2, Math.round(fase / 3)), moedas, ela]);
}

/* ---------- cenas ---------- */
// mostra uma legenda / etiqueta / destaque (roda dentro da página)
const MOSTRA = (l) => { if (l.tag != null) AD.tag(l.tag); if (l.texto != null) AD.leg(l.texto); if (l.anel !== undefined) AD.anel(l.anel); };
// onda de ouro: a onda rara dos 8 piratas dourados entra agora; conta quantos tesouros foram pegos e quantos fugiram
const ONDA_DE_OURO = () => {
  window.__ouro = { k: 0, f: 0 };
  if (!window.__af) { window.__af = addFloat; addFloat = function (x, y, t) { if (/TESOURO!/.test(t)) window.__ouro.k++; else if (/tesouro fugiu/i.test(t)) window.__ouro.f++; return window.__af.apply(this, arguments); }; }
  const gw = Array.from({ length: 8 }, (_, i) => ({ t: 'enemy', kind: 'gold', delay: .4 + i * .32 })); gw.gold = true; G.waves.splice(G.wi + 1, 0, gw); nextWave();
};
// acelerador: roda o jogo n vezes mais rápido (para mostrar uma fase inteira em poucos segundos); mira e usa os poderes sozinho
async function acelerador(page, n) {
  await page.evaluate((n) => {
    window.__ac = n; if (window.__acOn) return; window.__acOn = 1; const ids = ['rate', 'dmg', 'dmg']; let k = 0;
    (function q() {
      try {
        if (window.__ac > 1 && G && G.state === 'run') for (let i = 1; i < window.__ac; i++) {
          if (G.state !== 'run') break;
          const en = G.enemies.filter((e) => !e.dead && e.t !== 'barrel').sort((a, b) => b.y - a.y)[0]; if (en) G.tpx = Math.max(50, Math.min(W - 50, en.x));
          if (G.charge >= 1) { G.charge = 0; const p = POWERS.find((x) => x.id === ids[k++ % 3]); if ((G.pw[p.id] || 0) < p.max) { p.ap(); G.pw[p.id] = (G.pw[p.id] || 0) + 1; } p.cast(); renderPw(); }
          G.holding = true; tryFire(); update(1 / 60);
        }
      } catch (e) {}
      requestAnimationFrame(q);
    })();
  }, n);
}
// batalha: o robô segura o dedo na tela e mira no inimigo mais perto; poderes = [{ t: segundos, id: 'rate' | 'dmg' | 'heart' }]
// Durante o "aquece" (não gravado) o robô não atira, para a ponte encher. Com chefe: true vai direto para a onda do chefe,
// espera ele entrar e o traz para o meio da ponte, e o robô mira nele.
async function cenaBatalha(page, rec, { fase = 20, aquece = 4.3, dur = 8, poderes = [], chefe = false, hook, sub, hookDur = 3, foto, legendas = [], acelera = 0, ateFim = false, depois = 0, legFim, ouro, vidas, pausaCartas = .95, miraErrada = false } = {}) {
  await page.evaluate((chefe) => { startLevel(); document.getElementById('hint').classList.add('hidden'); if (chefe) { G.waves = [G.waves[G.waves.length - 1]]; G.wi = -1; G.spawnQ = []; G.enemies = []; nextWave(); } }, chefe);
  const Y = TELA.height * .88; await page.mouse.move(TELA.width / 2, Y);
  if (chefe) { await page.waitForFunction(() => G && G.enemies.some((e) => e.boss || e.t === 'boss'), null, { timeout: 15000 }).catch(() => {}); await page.evaluate(() => { const b = G.enemies.find((e) => e.boss || e.t === 'boss'); if (b) b.y = H * .34; }); }
  const fila = poderes.slice().sort((a, b) => a.t - b.t), legs = legendas.slice().sort((a, b) => a.t - b.t); let t0 = 0, gravando = false, escolha = null, ouroOn = false, acabou = false;
  const ini = Date.now();
  for (;;) {
    const agora = (Date.now() - ini) / 1000;
    if (!gravando && agora >= aquece) { gravando = true; t0 = Date.now(); await page.mouse.down(); if (acelera > 1) await acelerador(page, acelera); await page.evaluate(([h, s, d]) => { AD.limpa(); AD.hook(h, s, d); }, [hook || '', sub || '', hookDur]); await rec.liga(); }
    const t = gravando ? (Date.now() - t0) / 1000 : -1;
    if (gravando && t >= dur) break;
    if (gravando && ouro && t >= ouro.t) { ouro = null; ouroOn = true; await page.evaluate(ONDA_DE_OURO); }
    while (gravando && legs.length && t >= legs[0].t) { const l = legs.shift(); await page.evaluate(MOSTRA, l); }
    const s = await page.evaluate(([chefe, ouro]) => { if (!G) return { s: 'fim' }; const vivos = G.enemies.filter((e) => !e.dead && e.t !== 'barrel').sort((a, b) => b.y - a.y), perto = vivos[0], bs = chefe && vivos.find((e) => e.boss || e.t === 'boss'), au = ouro && vivos.find((e) => e.kind === 'gold'), en = au || (bs && !(perto && perto.y > H * .55) ? bs : perto); return { s: G.state, x: en ? en.x / W : null }; }, [chefe, ouroOn]);
    if (s.s === 'fim' || s.s === 'end') { acabou = true; break; }
    if (s.s === 'pick') { // mostra as cartas um instante e escolhe
      await page.mouse.up(); await page.evaluate(() => { AD.dedo(null); AD.hook(''); }); await espera(pausaCartas * 1000);
      await page.evaluate((id) => { G.pickT = 0; const c = document.querySelector('#cards [data-pw="' + id + '"]') || document.querySelector('#cards [data-pw]'); if (c) c.click(); }, escolha || 'rate');
      await espera(120); await page.mouse.move(TELA.width / 2, Y); if (gravando) await page.mouse.down(); continue;
    }
    if (gravando && fila.length && t >= fila[0].t && fila[0].direto) { const id = fila.shift().id; await page.evaluate((id) => { const p = POWERS.find((x) => x.id === id); if (!p || !G || G.state !== 'run') return; if ((G.pw[id] || 0) < p.max) { p.ap(); G.pw[id] = (G.pw[id] || 0) + 1; } p.cast(); renderPw(); }, id); continue; } // poder direto, sem abrir as cartas
    if (gravando && fila.length && t >= fila[0].t) { escolha = fila.shift().id; await page.mouse.up(); await page.evaluate((v) => { G.charge = 1; if (v) G.lives = v; }, vidas || 0); await espera(60); const b = await page.evaluate(() => { const r = document.getElementById('spBtn').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); await page.evaluate(([x, y]) => AD.dedo(x, y), b); await espera(220); await page.touchscreen.tap(b[0], b[1]); await espera(150); continue; }
    if (gravando && acelera > 1) { await espera(70); continue; } // acelerado: quem mira é o acelerador, dentro do jogo
    if (gravando && s.x != null) { const x = Math.max(.14, Math.min(.86, miraErrada ? 1 - s.x : s.x)) * TELA.width; await page.mouse.move(x, Y, { steps: 2 }); await page.evaluate(([x, y]) => AD.dedo(x, y), [x, Y]); }
    await espera(70);
  }
  await page.mouse.up(); if (acelera > 1) await page.evaluate(() => { window.__ac = 1; });
  if (gravando && (acabou || ateFim) && depois) { await page.evaluate(() => AD.dedo(null)); if (legFim) await page.evaluate(MOSTRA, legFim); await espera(depois * 1000); } // mostra a tela de vitória ou derrota
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
  if (p.renda) await page.evaluate((h) => { V().t = Date.now() - h * 36e5; window.__renda = fmtN(vPend()); vilaHud(); }, p.renda); // a ilha ficou h horas rendendo com o jogo fechado
  if (p.foco) await page.evaluate(async (k) => { // leva a construção para o meio da tela: mede onde está a etiqueta dela e corrige a câmera
    const quadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const onde = () => { const q = document.querySelector('#vLab .vlab[data-k="' + k + '"]').getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; };
    for (let i = 0; i < 4; i++) {
      const a = onde(), dx = innerWidth / 2 - a[0], dy = innerHeight * .36 - a[1]; if (Math.abs(dx) + Math.abs(dy) < 3) break;
      const px = VS.px, py = VS.py; VS.px = px + dx; VS.py = py + dy; VS.cam = null; await quadro();
      const b = onde(); if (Math.abs(innerWidth / 2 - b[0]) + Math.abs(innerHeight * .36 - b[1]) > Math.abs(dx) + Math.abs(dy)) { VS.px = px - dx; VS.py = py - dy; VS.cam = null; await quadro(); } // o sinal era o contrário
    }
  }, p.foco);
  if (p.construir) { // melhora a construção direto (sem abrir a ficha), até o nível "ate"; com legForma, a legenda acompanha a forma
    let forma = await page.evaluate((k) => vStg(vLv(k)), p.construir);
    for (let i = 0; i < 60; i++) {
      const r = await page.evaluate((k) => { const e = document.querySelector('#vLab .vlab[data-k="' + k + '"]'), q = e.getBoundingClientRect(); return { lv: vLv(k), x: q.x + q.width / 2, y: q.y + q.height + 44 }; }, p.construir);
      if (r.lv >= p.ate) break;
      await page.evaluate(([x, y]) => AD.dedo(x, y), [r.x, r.y]); await espera(120);
      const f = await page.evaluate((k) => { vBuild(k); return vStg(vLv(k)); }, p.construir);
      if (p.legForma && f !== forma) { forma = f; await page.evaluate((t) => AD.leg(t), 'Forma ' + f + ' de 6'); await espera(p.pausaForma != null ? p.pausaForma * 1000 : 650); }
      await espera(p.pausa != null ? p.pausa : 300);
    }
    await page.evaluate(() => AD.dedo(null));
  }
  if (p.nivelTodas != null) await page.evaluate((n) => { /* a ilha inteira passa para o nível n de uma vez, com a poeira e o brilho da obra (para mostrar a ilha crescendo em saltos) */
    const v = V(); VDEF.forEach((d) => { v.b[d.k] = n; }); v.i = Math.floor(Math.max(0, n - 1) / 9); v.t = Date.now(); save();
    if (VS.rdy) { renderVila(); vilaHud(); VACT().forEach((d) => { VS.anim[d.k] = VS.t; for (let j = 0; j < 10; j++) { const a = Math.random() * 6.28, q = 1 + Math.random() * 2.5; VS.dust.push({ x: d.x, y: GY + .3, z: d.z, vx: Math.cos(a) * q, vy: 1 + Math.random() * 2, vz: Math.sin(a) * q, t: 0, life: .8 }); } }); }
    VS.dirty = true;
  }, p.nivelTodas);
  if (p.construirTodas) { // melhora TODAS as construções até o nível "ate", uma depois da outra, indo sempre para a mais perto da anterior
    const lista = await page.evaluate(() => [...document.querySelectorAll('#vLab .vlab[data-k]')].map((e) => { const q = e.getBoundingClientRect(); return { k: e.dataset.k, x: q.x + q.width / 2, y: q.y + q.height / 2 }; }));
    const ordem = []; let cur = lista.slice().sort((m, n) => (m.y + m.x * .3) - (n.y + n.x * .3))[0];
    while (cur) { ordem.push(cur.k); lista.splice(lista.indexOf(cur), 1); const c = cur; cur = lista.slice().sort((m, n) => Math.hypot(m.x - c.x, m.y - c.y) - Math.hypot(n.x - c.x, n.y - c.y))[0]; }
    if (ordem.indexOf('nav') >= 0 && ordem.indexOf('nav') < ordem.indexOf('cais')) { ordem.splice(ordem.indexOf('cais'), 1); ordem.splice(ordem.indexOf('nav'), 0, 'cais'); } /* o navio só atraca com o cais pronto */
    for (const k of ordem) for (let i = 0; i < 20; i++) {
      if (!i) for (const l of p.legs || []) if (l.n === ordem.indexOf(k)) await page.evaluate((t) => AD.leg(t), l.texto); /* a legenda troca depois de n construções prontas */
      if (!i) await page.evaluate((k) => new Promise((ok) => { /* construção fora da parte visível da ilha: a câmera desliza até ela, como quem arrasta a ilha com o dedo */
        const q = document.querySelector('#vLab .vlab[data-k="' + k + '"]').getBoundingClientRect(), x = q.x + q.width / 2, y = q.y + q.height / 2;
        const dx = Math.max(44, Math.min(innerWidth - 44, x)) - x, dy = Math.max(120, Math.min(innerHeight - 215, y)) - y; if (Math.abs(dx) + Math.abs(dy) < 2) return ok();
        const px = VS.px, py = VS.py, t0 = performance.now(); (function anda() { const u = Math.min(1, (performance.now() - t0) / 420), e = u * u * (3 - 2 * u); VS.px = px + dx * e; VS.py = py + dy * e; VS.cam = null; if (u < 1) requestAnimationFrame(anda); else setTimeout(ok, 120); })();
      }), k);
      const r = await page.evaluate((k) => { const q = document.querySelector('#vLab .vlab[data-k="' + k + '"]').getBoundingClientRect(); return { lv: vLv(k), x: q.x + q.width / 2, y: q.y + q.height + 30 }; }, k);
      if (r.lv >= p.construirTodas) break;
      await page.evaluate(([x, y]) => AD.dedo(x, y), [r.x, r.y]); await espera(130);
      const subiu = await page.evaluate((k) => { const l = vLv(k); vBuild(k); return vLv(k) > l; }, k); await espera(p.pausa != null ? p.pausa : 300); if (!subiu) break; /* sem moedas ou travada: segue para a próxima */
    }
    await page.evaluate(() => AD.dedo(null));
  }
  if (p.leg != null) await page.evaluate((t) => AD.leg(t), p.leg);
  if (p.anel !== undefined) await page.evaluate((s) => AD.anel(s), p.anel);
  if (p.tag != null) await page.evaluate((t) => AD.tag(t), p.tag);
  if (p.foto) await fotos(page, p.foto);
  if (p.espera) await espera(p.espera * 1000);
}
// roteiro: "antes" acontece sem gravar; "passos" são gravados
async function cenaRoteiro(page, rec, { antes = [], passos = [], hook, sub, hookDur = 3 } = {}) {
  for (const p of antes) await passo(page, p);
  await page.evaluate(([h, s, d]) => { AD.limpa(); AD.hook(h, s, d); }, [hook || '', sub || '', hookDur]); await espera(280); await rec.liga(); // espera a legenda da cena anterior sumir
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
const BIO = 'Jogue grátis · link na bio';
const MELHORA = (k) => [{ toca: '[data-buy="' + k + '"]', vezes: 2, pausa: 330 }];
// cena pronta: a tela inicial parada e o toque na aba Ilha; "js" prepara a ilha antes (níveis das construções)
const ILHA_PRONTA = (js) => ['roteiro', { antes: [{ js: (js || '') + 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { pagina: 'play' }], passos: [{ espera: 2 }, { toca: 'button[data-pg="vila"]', pausa: 900, semDedo: true }] }];
// a aba Capitão mostra a conta como no site (na ferramenta o jogo roda sem servidor, e sem isto apareceria "jogando sem conta")
const CONTA_NO_VIDEO = (nome) => 'CT.nome = "' + nome + '"; CT.token = "video"; CT.sujo = 0; ctEst = "salvo"; contaCard()';
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
  /* ----- Reels para postar no orgânico: legenda no estilo do Instagram, comparações, final "link na bio", sem cara de anúncio ----- */
  { nome: 'reels_fase1_fase100', organico: true, cenas: [
    ['batalha', { jogador: { fase: 1, nivel: 0, tier: 0 }, aquece: 3.2, dur: 3.6, legendas: [{ t: 0, texto: 'Fase 1' }] }],
    ['batalha', { jogador: { fase: 100, nivel: 94, tier: 8 }, aquece: 4.8, dur: 9, legendas: [{ t: 0, texto: 'Fase 100' }, { t: 6.4, texto: 'Você chega em qual?', tag: BIO }], poderes: [{ t: 2.2, id: 'rate', direto: true }, { t: 5, id: 'dmg', direto: true }] }]] },
  { nome: 'reels_satisfatorio', organico: true, jogador: { fase: 70, nivel: 66 }, cenas: [
    ['batalha', { aquece: 5.2, dur: 10.5, legendas: [{ t: 0, texto: 'Isso é satisfatório demais' }, { t: 3.4, texto: '' }, { t: 7.6, texto: 'Qual poder você escolhe?', tag: BIO }], poderes: [{ t: .9, id: 'dmg', direto: true }, { t: 3.8, id: 'rate', direto: true }, { t: 6.6, id: 'dmg', direto: true }] }]] },
  { nome: 'reels_canhao_comum_mitico', organico: true, cenas: [
    ['batalha', { jogador: { fase: 30, nivel: 8, tier: 0 }, aquece: 4.3, dur: 3.8, legendas: [{ t: 0, texto: 'Canhão comum' }] }],
    ['batalha', { jogador: { fase: 30, nivel: 60, tier: 5 }, aquece: 4.3, dur: 7.2, legendas: [{ t: 0, texto: 'Canhão mítico' }, { t: 4.8, texto: 'Vale a pena evoluir?', tag: BIO }], poderes: [{ t: 2.4, id: 'rate', direto: true }] }]] },
  { nome: 'reels_ilha_antes_depois', organico: true, cenas: [
    ['roteiro', { jogador: { fase: 5, vila: 1, moedas: 900 }, antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }], passos: [{ leg: 'Minha ilha no começo' }, { zoom: 1.15, dur: 3.2 }] }],
    ['roteiro', { jogador: { fase: 60, vila: 19, moedas: 48e6 }, antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }], passos: [{ leg: 'Minha ilha agora' }, { zoom: 1.28, dur: 4.4 }, { leg: 'Tudo com as moedas da batalha', tag: BIO }, { zoom: .86, dur: 2.6 }] }]] },
  { nome: 'reels_chefe', organico: true, jogador: { fase: 50, nivel: 44 }, cenas: [
    ['batalha', { chefe: true, aquece: 1.5, dur: 10.5, legendas: [{ t: 0, texto: 'Dá pra vencer o chefe sem perder vida?' }, { t: 3.6, texto: '' }, { t: 7.4, texto: 'Comenta até que fase você chega', tag: BIO }], poderes: [{ t: 2.6, id: 'dmg', direto: true }, { t: 5.4, id: 'rate', direto: true }] }]] },
  /* ----- Reels de curiosidade: cada um em cima de uma coisa que só este jogo tem ----- */
  { nome: 'curioso_1000_piratas', organico: true, jogador: { fase: 100, nivel: 100, tier: 8 }, cenas: [
    ['batalha', { aquece: 2.6, acelera: 15, ateFim: true, dur: 19, depois: 2.6, legendas: [{ t: 0, texto: 'Fase 100 = 1.000 piratas. 1 canhão.' }, { t: 2.8, texto: 'Olha o contador lá em cima', anel: '#leftPill' }, { t: 6.2, texto: 'acelerado 15x', anel: null }], legFim: { texto: 'Agora imagina a fase 200', tag: BIO, anel: null } }]] },
  { nome: 'curioso_onda_de_ouro', organico: true, jogador: { fase: 12, nivel: 18 }, cenas: [
    ['batalha', { aquece: 2.2, dur: 11.2, ouro: { t: 1.3 }, legendas: [{ t: 0, texto: 'Se essa onda aparecer, não pisca' }, { t: 3.2, texto: 'Cada dourado foge com um tesouro' }, { t: 8.4, texto: 'Peguei {pegos} de 8. E você?', tag: BIO }] }]] },
  { nome: 'curioso_ilha_dormindo', organico: true, jogador: { fase: 30, vila: 11, moedas: 1250 }, cenas: [
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { pagina: 'play' }, { renda: 8 }], passos: [{ leg: 'Fechei o jogo ontem à noite' }, { espera: 2.1 }, { leg: 'Abri hoje de manhã' }, { espera: .9 }, { toca: 'button[data-pg="vila"]', pausa: 1100, semDedo: true }, { leg: 'Olha o que a ilha fez sozinha', anel: '.vbubble' }, { espera: 1.7 }, { anel: null, toca: '.vbubble', pausa: 350, semDedo: true }, { leg: '+{renda} moedas sem jogar', tag: BIO, anel: '#menuCoins' }, { espera: 2.8 }] }]] },
  { nome: 'curioso_6_formas', organico: true, jogador: { fase: 40, vila: 1, moedas: 5e9 }, cenas: [
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true; P.vila.b.tes = 1' }, { pagina: 'vila' }, { zoom: 2.1, dur: .1 }, { espera: .3 }, { foco: 'tes' }, { espera: .3 }], passos: [{ leg: 'Essa casa tem 6 formas' }, { espera: 1.5 }, { construir: 'tes', ate: 13, pausa: 240, legForma: true }, { espera: .8 }, { leg: 'A 6ª eu não vou mostrar', tag: 'Só jogando · link na bio' }, { espera: 2.6 }] }]] },
  { nome: 'curioso_qual_poder', organico: true, jogador: { fase: 40, nivel: 24 }, cenas: [
    ['batalha', { aquece: 4.7, dur: 10, vidas: 2, pausaCartas: 2.9, poderes: [{ t: .6, id: 'dmg' }], legendas: [{ t: 0, texto: '2 vidas. Poder carregado.' }, { t: 1.2, texto: 'Qual você pega?' }, { t: 4.6, texto: 'Fui de corrente' }, { t: 7, texto: 'Você pegava qual?', tag: BIO }] }]] },
  { nome: 'curioso_unico_trabalho', organico: true, jogador: { fase: 6, nivel: 2, tier: 0 }, cenas: [
    ['batalha', { aquece: 2.6, miraErrada: true, ateFim: true, dur: 16, depois: 2.2, legendas: [{ t: 0, texto: 'Meu único trabalho era defender a ponte' }, { t: 4.6, texto: 'Calma, tá tudo sob controle' }, { t: 9, texto: 'Não tá.' }], legFim: { texto: 'Demitido.', tag: 'Faz melhor que eu? · link na bio' } }]] },
  /* ----- História em um vídeo só: a pessoa jogando, a tela inicial, a ilha como era e a ilha um dia depois -----
     O "um dia depois" segue a conta do próprio jogo (ferramentas/modelo_economia.js): quem chega à fase 20 tem a vila por volta do nível 10 a 12. */
  { nome: 'historia_1_dia', organico: true, jogador: { fase: 20, nivel: 22, vila: 10, moedas: 18400 }, cenas: [
    ['batalha', { hook: 'Comecei ontem.', sub: 'Olha minha ilha hoje', hookDur: 3.6, aquece: 4.6, dur: 5.6, poderes: [{ t: 3, id: 'dmg', direto: true }] }],
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { pagina: 'play' }], passos: [{ espera: 1.5 }, { toca: 'button[data-pg="vila"]', pausa: 120 }] }],
    ['roteiro', { jogador: { fase: 2, nivel: 2, tier: 0, vila: 1, moedas: 640 }, antes: [{ js: 'VDEF.forEach((d) => { P.vila.b[d.k] = (d.u || 1) <= 2 ? 1 : 0; }); save(); VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }], passos: [{ leg: 'Ontem' }, { zoom: 1.12, dur: 2.9 }] }],
    ['roteiro', { jogador: { fase: 20, nivel: 22, vila: 10, moedas: 18400 }, antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }], passos: [{ leg: 'Hoje. 1 dia depois.' }, { zoom: 1.3, dur: 3.6 }, { tag: BIO }, { zoom: .88, dur: 2.2 }] }]] },
  /* ----- Sem texto nenhum por cima: batalha na fase 100, a tela inicial e a ilha sendo construída (todas as construções saem do nível 1 e vão para o nível 3) -----
     Gerar com --sem-legenda --sem-link --sem-chamada para sair só o jogo, sem etiqueta de link. */
  { nome: 'fase100_ilha', organico: true, jogador: { fase: 100, nivel: 100, tier: 8, vila: 5, moedas: 5e6 }, cenas: [
    ['batalha', { aquece: 3.1, dur: 10.5, poderes: [{ t: 2.2, id: 'rate', direto: true }, { t: 6.4, id: 'dmg', direto: true }] }],
    ['roteiro', { antes: [{ js: 'VDEF.forEach((d) => { P.vila.b[d.k] = 1; }); P.vila.i = 0; save(); VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { pagina: 'play' }], passos: [{ espera: 2.4 }, { toca: 'button[data-pg="vila"]', pausa: 900, semDedo: true }] }],
    ['roteiro', { antes: [{ pagina: 'vila' }], passos: [{ espera: 1.6 }, { construirTodas: 3, pausa: 270 }, { espera: 1.8 }] }]] },
  /* ----- Sem texto nenhum por cima: só a tela inicial — o menu parado, um passeio pelas abas e o toque no JOGAR ----- */
  { nome: 'tela_inicial', organico: true, jogador: { fase: 100, nivel: 100, tier: 8, vila: 12, moedas: 5e6 }, cenas: [
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true; ' + CONTA_NO_VIDEO('CapitaoDaIlha') }, { pagina: 'vila' }, { pagina: 'play' }], passos: [{ espera: 3.6 },
      { toca: 'button[data-pg="cannon"]', pausa: 1700 }, { toca: 'button[data-pg="hero"]', pausa: 1700 }, { toca: 'button[data-pg="vila"]', pausa: 2300 }, { toca: 'button[data-pg="troph"]', pausa: 1700 },
      { toca: 'button[data-pg="play"]', pausa: 1900 }, { toca: '#play', pausa: 200, semDedo: true }, { espera: 2.4 }] }]] },
  /* ----- Sem texto nenhum por cima: 5 segundos da ilha com todas as construções no nível 10 (nível 10 já é a 2ª categoria da vila) ----- */
  { nome: 'ilha_nivel10', organico: true, jogador: { fase: 100, nivel: 100, tier: 8, vila: 10, moedas: 5e6 }, cenas: [
    ['roteiro', { antes: [{ js: 'VDEF.forEach((d) => { P.vila.b[d.k] = 10; }); P.vila.i = 1; save(); VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { espera: .6 }], passos: [{ espera: 5 }] }]] },
  /* ----- O mesmo vídeo da fase 100 com a ilha, agora COM texto para gerar curiosidade, terminando na ilha com tudo no nível 10 ("depois de 1 dia") -----
     O "1 dia" segue a conta do próprio jogo (ferramentas/modelo_economia.js): em um dia de jogo a vila chega por volta do nível 10 a 12. */
  { nome: 'fase100_ilha_1dia', organico: true, jogador: { fase: 100, nivel: 100, tier: 8, vila: 5, moedas: 5e6 }, cenas: [
    ['batalha', { hook: '1.000 piratas. 1\u00a0canhão.', sub: 'Essa é a fase 100', hookDur: 3.4, aquece: 2.5, dur: 10.5, poderes: [{ t: 2.2, id: 'rate', direto: true }, { t: 6.4, id: 'dmg', direto: true }], legendas: [{ t: 4.6, texto: 'O segredo não é o\u00a0canhão' }] }],
    ['roteiro', { antes: [{ js: 'VDEF.forEach((d) => { P.vila.b[d.k] = 1; }); P.vila.i = 0; save(); VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { pagina: 'play' }], passos: [{ leg: 'O segredo não é o\u00a0canhão' }, { espera: 1.3 }, { leg: 'É a minha ilha' }, { espera: 1.1 }, { toca: 'button[data-pg="vila"]', pausa: 900, semDedo: true }] }],
    ['roteiro', { antes: [{ pagina: 'vila' }], passos: [{ leg: 'Comecei com tudo no\u00a0nível\u00a01' }, { espera: 1.6 }, { construirTodas: 3, pausa: 270, legs: [{ n: 5, texto: 'Cada construção dá um bônus diferente' }, { n: 11, texto: 'Mais dano, mais tiros, mais moedas' }] }, { espera: 1.8 }] }],
    ['roteiro', { antes: [{ js: 'VDEF.forEach((d) => { P.vila.b[d.k] = 10; }); P.vila.i = 1; save(); VS.S0 = 0; VS.dirty = true' }, { pagina: 'play' }, { pagina: 'vila' }, { espera: .6 }], passos: [{ leg: 'Minha ilha depois de\u00a01\u00a0dia', tag: BIO }, { espera: 5 }] }]] },
  /* ----- 10 vídeos SEM TEXTO NENHUM para Reels (Instagram, Facebook) e TikTok, no estilo do fase100_ilha, cada um com uma ideia diferente -----
     Não têm chamada, legenda nem etiqueta de link: saem limpos mesmo sem as opções --sem-*. */
  { nome: 'st01_fase1_fase100', organico: true, jogador: { fase: 100, nivel: 100, tier: 8, vila: 10, moedas: 5e6 }, cenas: [
    ['batalha', { jogador: { fase: 1, nivel: 0, tier: 0, moedas: 0 }, aquece: 3.2, dur: 4.2 }],
    ['batalha', { jogador: { fase: 100, nivel: 100, tier: 8, moedas: 5e6 }, aquece: 2.5, dur: 8.5, poderes: [{ t: 1.8, id: 'rate', direto: true }, { t: 5.2, id: 'dmg', direto: true }] }],
    ILHA_PRONTA('VDEF.forEach((d) => { P.vila.b[d.k] = 10; }); P.vila.i = 1; save(); '),
    ['roteiro', { antes: [{ pagina: 'vila' }], passos: [{ espera: .6 }, { zoom: 1.25, dur: 3.4 }, { espera: .5 }] }]] },
  { nome: 'st02_chefe_tesouro', organico: true, jogador: { fase: 30, nivel: 44, vila: 2, moedas: 5e6 }, cenas: [
    ['batalha', { chefe: true, aquece: 1.5, dur: 10, poderes: [{ t: 3, id: 'dmg', direto: true }, { t: 6.5, id: 'rate', direto: true }] }],
    ILHA_PRONTA('P.vila.b.tes = 1; save(); '),
    ['roteiro', { antes: [{ pagina: 'vila' }], passos: [{ espera: .6 }, { zoom: 2.1, dur: 1.2 }, { foco: 'tes' }, { espera: .4 }, { construir: 'tes', ate: 16, pausa: 250 }, { espera: .8 }, { zoom: .5, dur: 1.8 }, { espera: .8 }] }]] },
  { nome: 'st03_onda_de_ouro', organico: true, jogador: { fase: 12, nivel: 18, vila: 11, moedas: 1250 }, cenas: [
    ['batalha', { aquece: 2.2, dur: 10.5, ouro: { t: 1.3 } }],
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { pagina: 'play' }, { renda: 8 }], passos: [{ espera: 2 }, { toca: 'button[data-pg="vila"]', pausa: 1300, semDedo: true }, { espera: .9 }, { toca: '.vbubble', pausa: 500, semDedo: true }, { espera: 1.6 }, { zoom: 1.2, dur: 2.4 }] }]] },
  { nome: 'st04_escolha_do_poder', organico: true, jogador: { fase: 40, nivel: 30, tier: 3, vila: 7, moedas: 240000 }, cenas: [
    ['batalha', { aquece: 4.2, dur: 13, pausaCartas: 1.6, poderes: [{ t: .8, id: 'dmg' }, { t: 5.2, id: 'rate' }, { t: 9.4, id: 'dmg' }] }],
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { pagina: 'play' }], passos: [{ espera: 1.6 }, { toca: 'button[data-pg="cannon"]', pausa: 2000 }, { toca: 'button[data-pg="vila"]', pausa: 1000, semDedo: true }, { zoom: 1.15, dur: 2.4 }] }]] },
  { nome: 'st05_ilha_crescendo', organico: true, jogador: { fase: 50, nivel: 50, tier: 4, vila: 1, moedas: 5e6 }, cenas: [
    ['batalha', { aquece: 3, dur: 5.5, poderes: [{ t: 2, id: 'dmg', direto: true }] }],
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { nivelTodas: 16 }, { pagina: 'vila' }, { nivelTodas: 13 }, { espera: .7 }, { nivelTodas: 10 }, { espera: .7 }, { nivelTodas: 7 }, { espera: .7 }, { nivelTodas: 4 }, { espera: .7 }, { nivelTodas: 1 }, { espera: .7 }, { pagina: 'play' }], passos: [{ espera: 1.8 }, { toca: 'button[data-pg="vila"]', pausa: 900, semDedo: true }] }],
    ['roteiro', { antes: [{ pagina: 'vila' }], passos: [{ espera: 1.5 }, { nivelTodas: 4 }, { espera: 1.9 }, { nivelTodas: 7 }, { espera: 1.9 }, { nivelTodas: 10 }, { espera: 1.9 }, { nivelTodas: 13 }, { espera: 1.9 }, { nivelTodas: 16 }, { espera: 2.8 }] }]] },
  { nome: 'st06_capita', organico: true, jogador: { fase: 50, nivel: 50, tier: 4, vila: 3, moedas: 5e6, ela: true }, cenas: [
    ['batalha', { aquece: 3, dur: 7, poderes: [{ t: 2, id: 'rate', direto: true }, { t: 5, id: 'dmg', direto: true }] }],
    ['roteiro', { antes: [{ js: 'VDEF.forEach((d) => { P.vila.b[d.k] = 3; }); P.vila.i = 0; save(); VS.S0 = 0; VS.dirty = true; ' + CONTA_NO_VIDEO('CapitaDaIlha') }, { pagina: 'vila' }, { pagina: 'play' }], passos: [{ espera: 1.6 }, { toca: 'button[data-pg="hero"]', pausa: 1900 }, { toca: 'button[data-pg="vila"]', pausa: 1000, semDedo: true }] }],
    ['roteiro', { antes: [{ pagina: 'vila' }], passos: [{ espera: 1 }, { construirTodas: 4, pausa: 300 }, { espera: 1.8 }] }]] },
  { nome: 'st07_vitoria_e_bau', organico: true, jogador: { fase: 5, nivel: 40, tier: 3, vila: 4, moedas: 3000 }, cenas: [
    ['batalha', { aquece: 2.6, acelera: 3, ateFim: true, dur: 24, depois: 2.8 }],
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { zoom: 1.15, dur: .1 }, { pagina: 'play' }], passos: [{ espera: 1.6 }, { toca: 'button[data-pg="vila"]', pausa: 1000, semDedo: true }, { ficha: 'tes', pausa: 700 }, { toca: '#vShBuy', vezes: 5, pausa: 340 }, { espera: .4 }, { toca: '#vShClose', pausa: 250, semDedo: true }, { zoom: .9, dur: 1.4 }, { espera: .6 }] }]] },
  { nome: 'st08_ilha_do_zero', organico: true, jogador: { fase: 3, nivel: 3, tier: 0, vila: 1, moedas: 6000 }, cenas: [
    ['batalha', { aquece: 3.2, dur: 5 }],
    ['roteiro', { antes: [{ js: 'VDEF.forEach((d) => { P.vila.b[d.k] = 0; }); P.vila.i = 0; save(); VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { pagina: 'play' }], passos: [{ espera: 1.8 }, { toca: 'button[data-pg="vila"]', pausa: 900, semDedo: true }] }],
    ['roteiro', { antes: [{ pagina: 'vila' }], passos: [{ espera: 1.4 }, { construirTodas: 1, pausa: 340 }, { espera: 2 }] }]] },
  { nome: 'st09_perdeu_evoluiu_venceu', organico: true, jogador: { fase: 28, nivel: 13, tier: 2, vila: 5, moedas: 20000 }, cenas: [
    ['batalha', { aquece: 8, miraErrada: true, ateFim: true, dur: 12, depois: 2.2 }],
    ['roteiro', { antes: [{ pagina: 'cannon' }], passos: [{ espera: 1.2 }, ...MELHORA('dmg'), ...MELHORA('rate'), ...MELHORA('hp'), { espera: .5 }, { toca: '#shBtn', pausa: 2800, semDedo: true }] }],
    ['batalha', { aquece: 2.8, dur: 8, poderes: [{ t: 1, id: 'rate', direto: true }, { t: 3.6, id: 'dmg', direto: true }] }]] },
  { nome: 'st10_tour_rapido', organico: true, jogador: { fase: 70, nivel: 70, tier: 6, vila: 8, moedas: 5e8 }, cenas: [
    ['roteiro', { antes: [{ js: 'VS.S0 = 0; VS.dirty = true' }, { pagina: 'vila' }, { zoom: 1.15, dur: .1 }, { pagina: 'play' }], passos: [{ espera: 1.5 }, { toca: '#play', pausa: 200, semDedo: true }, { espera: .9 }] }],
    ['batalha', { aquece: 3, dur: 5, poderes: [{ t: 1.5, id: 'rate', direto: true }] }],
    ['roteiro', { antes: [{ js: 'P.dmg = P.rate = P.hp = SK().cap - 3; save()' }, { pagina: 'cannon' }], passos: [{ espera: .8 }, ...MELHORA('dmg'), ...MELHORA('rate'), { espera: .5 }] }],
    ['roteiro', { antes: [{ pagina: 'vila' }], passos: [{ espera: .5 }, { ficha: 'tes', pausa: 600 }, { toca: '#vShBuy', vezes: 5, pausa: 330 }, { toca: '#vShClose', pausa: 200, semDedo: true }, { zoom: .9, dur: 1.2 }] }],
    ['batalha', { chefe: true, aquece: 1.5, dur: 5, poderes: [{ t: 1, id: 'dmg', direto: true }] }]] },
  // imagens paradas (para anúncio de imagem e capa): sai um .jpg em vez de vídeo
  { nome: 'imagens', jogador: { fase: 40, nivel: 24, vila: 9, moedas: 5e8 }, soFotos: true, cenas: [
    ['batalha', { dur: 1.1, foto: { nome: 'img_batalha', titulo: 'Defenda a ponte!', sub: 'Jogo de pirata no navegador' } }],
    ['batalha', { chefe: true, aquece: 1.5, dur: 1.3, foto: { nome: 'img_chefe', titulo: 'Você derrota o chefe?' } }],
    ['roteiro', { antes: [{ pagina: 'vila' }, { zoom: 1.1, dur: .1 }, { espera: .5 }], passos: [{ foto: { nome: 'img_ilha', titulo: 'Construa sua ilha pirata!' } }] }]] },
];

(async () => {
  const quais = process.argv.slice(2).filter((a) => !a.startsWith('--')), lista = CRIATIVOS.filter((c) => !quais.length || quais.includes(c.nome));
  if (!lista.length) { console.log('Criativos disponíveis: ' + CRIATIVOS.map((c) => c.nome).join(', ')); process.exit(1); }
  fs.mkdirSync(SAIDA, { recursive: true });
  const nav = await chromium.launch();
  for (const c of lista) {
    const page = await abre(nav), partes = [];
    await jogador(page, c.jogador || {});
    if (c.organico) await page.evaluate(() => { AD.org = true; });
    for (const [tipo, op] of c.cenas) {
      if (op.jogador) await jogador(page, Object.assign({}, c.jogador, op.jogador));
      const rec = await gravador(page);
      if (tipo === 'batalha') await cenaBatalha(page, rec, op);
      else if (tipo === 'roteiro') await cenaRoteiro(page, rec, op);
      else if (tipo === 'fim') await cenaFim(page, rec, op);
      await rec.desliga(); partes.push(rec.quadros);
    }
    if (!c.soFotos) {
      const arq = path.join(SAIDA, 'tropa_' + c.nome + SUFIXO + '.mp4'), r = monta(partes, arq); FEITOS.push(arq);
      console.log(c.nome + ': ' + r.segundos.toFixed(1) + ' s, ' + r.quadros + ' quadros (' + r.fps.toFixed(0) + ' por segundo na gravação), ' + (fs.statSync(arq).size / 1e6).toFixed(1) + ' MB');
    }
    if (page.erros.length) console.log('  ERROS no jogo durante ' + c.nome + ': ' + JSON.stringify(page.erros.slice(0, 3)));
    await page.context().close();
  }
  await nav.close();
  console.log('\nProntos em ' + SAIDA + ':\n' + FEITOS.map((f) => '  ' + path.basename(f)).join('\n'));
})().catch((e) => { console.error('Falhou: ' + e.message); process.exit(1); });
