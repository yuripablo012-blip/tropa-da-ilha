// Modelo simples da economia do jogo: fase a fase, o jogador vence, ganha moedas e compra o mais barato.
// Serve para conferir se a progressão continua andando nas fases altas (compras por fase e "folga" do canhão).
// Uso: node modelo_economia.js [expoente do custo=3] [moedas n²=.1] [moeda por inimigo=.02] [1 = regras antigas] [expoente da força=1.2] [divisor=45]
// As fórmulas aqui são cópia das do index.html (upCostL, DIFF, NE, buildWaves, finish): se mudar lá, mude aqui.
const A = process.argv.slice(2).map(Number);
const p = A[0] || 3, a2 = A[1] == null ? .1 : A[1], kc = A[2] == null ? .02 : A[2], OLD = A[3] === 1;
const SK = [{cap:5,cost:0,d:1,r:1,h:0},{cap:10,cost:600,d:1.25,r:.78,h:1},{cap:15,cost:3000,d:1.6,r:.58,h:2},{cap:25,cost:10000,d:2.2,r:.4,h:4}];
const RMAX = 9;
const DIFFo = (n) => 1 + (n - 1) * .65 + Math.max(0, n - 4) * .1 + Math.max(0, n - 8) * .2 + Math.max(0, n - 15) * .25;
const DIFF = OLD ? DIFFo : (n) => DIFFo(n) * Math.pow(1 + Math.max(0, n - 20) / (A[5] || 45), A[4] == null ? 1.2 : A[4]);
const NE = (n) => OLD || n <= 10 ? n : 10 + 6 * Math.log(1 + (n - 10) / 6);
function counts(n) { const m = NE(n); const wc = (n === 1 ? 3 : 2) + Math.min(2, Math.floor(n / 4)); let tot = 0, hp = 0, coins = 0, T = 0;
  for (let w = 0; w < wc; w++) { const k = 6 + Math.min(8, Math.floor(n * .7)) + w * 2 + (OLD ? 0 : Math.floor(Math.max(0, m - 10) / 2)); const big = 1 + Math.floor((m + w) / 3), fast = 1 + Math.floor((m + w) / 2), gold = .55, sh = n >= 2 ? 1 + Math.floor((m + w) / 3) : 0, bird = n >= 2 ? Math.floor((m + w) / 3) : 0, bomb = n >= 3 && w >= 1 ? 1 + Math.floor(m / 5) : 0;
    const c = k + big + fast + gold + sh + bird + bomb; tot += c; hp += k * 3 + big * 14 + fast * 2 + gold * 5 + sh * 12 + bird * 2 + bomb * 6 + 5; coins += k + big * 4 + fast + gold * (15 + 3 * n) + sh * 3 + bird * 2 + bomb * 3;
    const gap = Math.max(.45, .8 - n * .02); T += Math.max(k * gap, OLD ? 0 : c / (3.2 + 1.8 * (1 - Math.exp(-n / 20)))); if (w === wc - 1 && n >= 2) { hp += 30 + 10 / DIFF(n); coins += 20; } }
  const bn = 4 + Math.min(8, n); tot += bn + 1; hp += 75 + 30 / DIFF(n) + bn * 3 + (n >= 4 ? 30 : 0); coins += 50 + bn + (n >= 4 ? 20 : 0); T += 8;
  return { tot, hp: hp * DIFF(n), coins, T }; }
const C25 = 30 * Math.pow(1.24, 25);
const upCost = (l) => OLD || l <= 25 ? Math.floor(30 * Math.pow(1.24, l) + l * 8) : Math.floor(C25 * Math.pow(l / 25, p) + l * 8);
const vC = (c, l) => Math.round(c * [.6, 1, 1.6, 2.4, 3.5, 5, 7, 10, 14][l % 9] * Math.pow(2.4, Math.floor(l / 9)) / 5) * 5;
const VD = { tes: 60, cais: 90, tav: 120, fer: 160, far: 200, est: 250, nav: 300, vig: 450, mer: 600, forte: 900, mina: 1300, kra: 1800, casa1: 80, casa2: 80, casa3: 80, casa4: 80, casa5: 80 };
const S = { coins: 0, dmg: 0, rate: 0, hp: 0, tier: 0, v: {} }; for (const k in VD) S.v[k] = 0;
const vt = (k) => S.v[k] / 3;
const rateRaw = () => (1 + vt('far') * .03) / ((S.rate <= 25 || OLD ? Math.max(.3, .85 - S.rate * .022) : .3 / (1 + (S.rate - 25) * .02)) * SK[S.tier].r);
const dps = () => { const rr = rateRaw(); return 4 * (1 + S.dmg * .25) * SK[S.tier].d * (1 + vt('fer') * .04 + vt('casa2') * .03) * (OLD ? Math.min(RMAX, rr) : rr); };
const lives = () => 5 + (OLD ? Math.floor(S.hp * .8) : S.hp) + SK[S.tier].h + Math.floor(vt('est') / 2);
let E0 = null; const out = [];
for (let n = 1; n <= 400; n++) { const c = counts(n);
  const need = c.hp / c.T, E = dps() / need; if (n === 3) E0 = E;
  const kill = c.coins * 1.8 * (OLD ? 1 : 1 + kc * Math.max(0, n - 10));
  const reward = Math.round((20 + n * 10 + (OLD ? 0 : a2 * n * n) + kill + lives() * 3) * 1.25 * (1 + vt('cais') * .05 + vt('nav') * .06 + vt('casa5') * .04) * (1 + (S.dmg + S.rate + S.hp) * .02 + S.tier * .15) * .7);
  S.coins += reward; let bought = 0, vb = 0; let budV = reward * .35, guard = 0;
  while (guard++ < 5000) { // vila: o mais barato, até 35% do ganho
    let bk = null, bc = 1e99; for (const k in VD) { const cc = vC(VD[k], S.v[k]); if (cc < bc) { bc = cc; bk = k; } } if (bc > budV || bc > S.coins) break; S.coins -= bc; budV -= bc; S.v[bk]++; vb++; }
  guard = 0; while (guard++ < 5000) { if (S.tier < 3 && S.dmg >= SK[S.tier].cap && S.rate >= SK[S.tier].cap && S.hp >= SK[S.tier].cap) { if (S.coins >= SK[S.tier + 1].cost) { S.coins -= SK[S.tier + 1].cost; S.tier++; continue; } }
    const lim = OLD && S.tier < 3 ? SK[S.tier].cap : 1e9; const op = ['dmg', 'rate', 'hp'].filter((k) => S[k] < lim).map((k) => [upCost(S[k]), k]).sort((x, y) => x[0] - y[0])[0]; if (!op || op[0] > S.coins) break; S.coins -= op[0]; S[op[1]]++; bought++; }
  if ([1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400].includes(n)) out.push([n, Math.round(c.tot), Math.round(c.T) + 's', Math.round(c.hp), reward, bought, vb, S.tier, S.dmg + '/' + S.rate + '/' + S.hp, lives(), Math.round(Object.values(S.v).reduce((x, y) => x + y, 0) / 17), dps().toFixed(0), (E / E0).toFixed(2)].join('\t')); }
console.log('fase\tinim\ttempo\tvidaTot\tganho\tcompras\tvila\ttier\td/r/h\tvidas\tvilaNv\tDPS\tfolga'); console.log(out.join('\n'));
