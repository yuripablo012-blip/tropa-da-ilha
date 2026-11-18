<?php
/* Tropa da Ilha — contas dos jogadores.
 *
 * O jogo (index.html) fala com este arquivo para criar conta, entrar e guardar o progresso.
 * Não usa banco de dados: cada conta é um arquivo numa pasta fora do site (ver pasta_dados).
 * Guarda só: nome de jogador, senha embaralhada (nunca a senha em si) e o jogo salvo.
 *
 * Toda resposta é JSON com "ok": true ou false. Erros vêm com "erro" (código) e "msg" (texto para a tela).
 */

@ini_set('display_errors', '0'); // avisos do PHP nunca podem sair no meio da resposta
@date_default_timezone_set('America/Sao_Paulo'); // os dias do painel viram à meia-noite de Brasília
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const SAVE_MAX = 30000;      // tamanho máximo do jogo salvo, em bytes (um jogo de verdade tem poucos KB)
const SAVE_NOVO_MAX = 20000; // tamanho máximo do jogo salvo ao criar a conta (um jogo de verdade tem poucos KB)
const CORPO_MAX = 80000;     // tamanho máximo de um pedido
const SENHA_MIN = 6;
const SESSOES_MAX = 8;       // aparelhos ligados na mesma conta
const SESSAO_DIAS = 180;     // sessão sem uso por esse tempo é esquecida
const LIM_CRIAR_IP = 60;     // contas novas por hora, por endereço
const LIM_CRIAR_GERAL = 600; // contas novas por hora, no site todo
const LIM_FALHA_IP = 60;     // senhas erradas por hora, por endereço
const LIM_FALHA_CONTA = 10;  // senhas erradas em 15 minutos, por conta
const PAINEL_CODIGO = '1b61bee8367877089c14dda2c3ed6e9e628108f4a4ecb63290de9bafc8155531'; // impressão digital (SHA-256) do código de primeiro acesso do painel; o código em si não está em lugar nenhum do projeto
const PAINEL_DIAS = 30;      // sessão do painel sem uso por esse tempo é esquecida
const LIM_PAINEL_IP = 8;     // senhas erradas do painel por hora, por endereço
const LIM_PAINEL_GERAL = 40; // senhas erradas do painel em 15 minutos, somando todos os endereços
const AP_TESTE = 'testedoclaude1'; // aparelho usado para conferir o site no ar: os sinais dele são aceitos mas nunca entram nos números do painel
const LIM_VISITA_IP = 1500;  // sinais de abertura (e, à parte, de batalha) por hora, por endereço
const LIM_PULSO_IP = 30000;  // sinais de "continua aberto" por hora, por endereço (30 por hora por jogador)
const GUARDA = "<?php http_response_code(404); exit; ?>\n"; // primeira linha de cada arquivo de dados: se alguém abrir pelo navegador, não mostra nada

function sai($dados) { // nunca responde vazio: um valor que o JSON não aceita (número infinito, texto quebrado) vira nulo em vez de derrubar a resposta
  $j = json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
  echo $j === false ? '{"ok":false,"erro":"servidor","msg":"Erro no servidor. Tente de novo."}' : $j; exit;
}
function erro($cod, $msg) { sai(array('ok' => false, 'erro' => $cod, 'msg' => $msg)); }

/* Pasta dos dados: de preferência fora da pasta pública do site; se a hospedagem não deixar, dentro, trancada. */
function pasta_dados() {
  static $p = null;
  if ($p !== null) return $p;
  $cands = array(dirname(__DIR__) . '/tropa_dados', __DIR__ . '/dados_contas');
  foreach ($cands as $i => $c) {
    if ((@is_dir($c) || @mkdir($c, 0700, true)) && @is_writable($c)) {
      if (!@file_exists($c . '/.htaccess')) {
        @file_put_contents($c . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
        @file_put_contents($c . '/index.html', '');
      }
      $GLOBALS['onde_dados'] = $i === 0 ? 'fora' : 'dentro';
      return $p = $c;
    }
  }
  erro('servidor', 'O servidor não conseguiu guardar os dados. Tente mais tarde.');
}
function subpasta($nome) {
  $d = pasta_dados() . '/' . $nome;
  if (!@is_dir($d) && !@mkdir($d, 0700, true) && !@is_dir($d)) erro('servidor', 'O servidor não conseguiu guardar os dados. Tente mais tarde.');
  return $d;
}

/* Lê e grava arquivos de dados (JSON com a linha de guarda na frente). Grava num arquivo temporário e troca, para nunca deixar pela metade. */
function le($arq) {
  $t = @file_get_contents($arq);
  if ($t === false) return null;
  $n = strpos($t, "\n");
  $d = json_decode($n === false ? $t : substr($t, $n + 1), true);
  return is_array($d) ? $d : null;
}
function grava($arq, $dados) {
  $tmp = $arq . '.' . bin2hex(random_bytes(4)) . '.tmp';
  $j = json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($j === false) erro('servidor', 'O servidor não conseguiu guardar os dados. Tente mais tarde.'); // nunca grava um arquivo só com a linha de guarda
  $txt = GUARDA . $j;
  if (@file_put_contents($tmp, $txt, LOCK_EX) !== strlen($txt) || !@rename($tmp, $arq)) { @unlink($tmp); erro('servidor', 'O servidor não conseguiu guardar os dados. Tente mais tarde.'); }
}
/* Trava: um pedido de cada vez por grupo de contas, para dois aparelhos não gravarem um por cima do outro. */
function trava($nome) {
  $f = @fopen(subpasta('travas') . '/' . $nome . '.lock', 'c');
  if (!$f || !flock($f, LOCK_EX)) erro('servidor', 'Servidor ocupado. Tente de novo.');
  return $f;
}
function solta($f) { if ($f) { flock($f, LOCK_UN); fclose($f); } }

/* Nome de jogador: 3 a 16 letras, números, espaço, ponto, traço ou sublinhado. "João" e "joao" são a mesma conta. */
function nome_limpo($n) {
  if (!is_string($n)) return null;
  $n = preg_replace('/\s+/u', ' ', $n);
  if ($n === null) return null; // texto com defeito
  $n = trim($n);
  if (!preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._\-]{2,15}$/u', $n)) return null;
  return $n;
}
function nome_chave($n) {
  $n = function_exists('mb_strtolower') ? mb_strtolower($n, 'UTF-8') : strtolower($n);
  $n = strtr($n, array('á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
    'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n'));
  return substr(hash('sha256', 'tropa|' . $n), 0, 32);
}
function arq_conta($chave) { return subpasta('contas/' . substr($chave, 0, 2)) . '/c_' . $chave . '.php'; }

function senha_ok($s) { return is_string($s) && strlen($s) >= SENHA_MIN && strlen($s) <= 64 && strpos($s, "\0") === false; }
/* O jogo salvo vem como texto JSON e é guardado como veio (sem passar pelo PHP, que trocaria {} por []). */
function save_ok($s) {
  if (!is_string($s) || strlen($s) < 2 || strlen($s) > SAVE_MAX || $s[0] !== '{') return false;
  $d = json_decode($s);
  return is_object($d);
}

/* Limites por endereço, para ninguém ficar criando contas ou chutando senhas sem parar. Janela de 1 hora. */
function ip_chave() { return substr(hash('sha256', 'ip|' . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '?')), 0, 24); }
function limite($arq, $campo, $max, $somar) {
  $d = le($arq);
  $agora = time();
  if (!$d || !isset($d['t0']) || $agora - $d['t0'] > 3600) $d = array('t0' => $agora);
  $n = isset($d[$campo]) ? (int) $d[$campo] : 0;
  if ($n >= $max) return false;
  if ($somar) { $d[$campo] = $n + 1; grava($arq, $d); }
  return true;
}
function faxina() { // de vez em quando, apaga arquivos de limite velhos
  if (mt_rand(0, 199) !== 0) return;
  foreach ((array) @glob(subpasta('limites') . '/*') as $f) if (@filemtime($f) < time() - 7200) @unlink($f);
}

/* Sessão: "chave-da-conta.segredo". O servidor guarda só o segredo embaralhado. */
function nova_sessao(&$conta, $chave) {
  $seg = bin2hex(random_bytes(24));
  $lista = isset($conta['sessoes']) && is_array($conta['sessoes']) ? $conta['sessoes'] : array();
  $lista[] = array('h' => hash('sha256', $seg), 't' => time());
  usort($lista, function ($a, $b) { return $b['t'] - $a['t']; });
  $conta['sessoes'] = array_slice($lista, 0, SESSOES_MAX);
  return $chave . '.' . $seg;
}
/* Confere a sessão. Devolve [chave, índice da sessão] ou encerra com erro. Chamar com a trava da conta já fechada. */
function abre_sessao($token, &$conta) {
  if (!is_string($token) || !preg_match('/^([0-9a-f]{32})\.([0-9a-f]{48})\z/', $token, $m)) erro('sessao', 'Entre na sua conta de novo.');
  $conta = le(arq_conta($m[1]));
  if (!$conta) erro('sessao', 'Entre na sua conta de novo.');
  $h = hash('sha256', $m[2]);
  $limite = time() - SESSAO_DIAS * 86400;
  foreach ((isset($conta['sessoes']) ? $conta['sessoes'] : array()) as $i => $s) {
    if ($s['t'] >= $limite && hash_equals($s['h'], $h)) return array($m[1], $i);
  }
  erro('sessao', 'Entre na sua conta de novo.');
}
function chave_do_token($token) { return is_string($token) && preg_match('/^([0-9a-f]{32})\./', $token, $m) ? $m[1] : null; }

/* ---------- Números para o painel ----------
   Um arquivo por dia (stats/d_AAAA-MM-DD.php) com contadores e dois conjuntos: "ap" (aparelhos diferentes que abriram o jogo)
   e "ativos" (contas que salvaram progresso no dia). Nada de endereço de internet nem dado pessoal: só identificações embaralhadas. */
function dia_arq($dia) { return subpasta('stats') . '/d_' . $dia . '.php'; }
function conta_stat($campo, $conj = null, $id = null) { // $conj pode ser um nome (com $id) ou uma lista nome => id
  $conjs = is_array($conj) ? $conj : ($conj && $id !== null ? array($conj => $id) : array());
  $t = trava('stats');
  $arq = dia_arq(date('Y-m-d'));
  $d = le($arq);
  if (!$d) $d = array();
  if ($campo) $d[$campo] = (isset($d[$campo]) ? (int) $d[$campo] : 0) + 1;
  foreach ($conjs as $nome => $x) { if (!isset($d[$nome]) || !is_array($d[$nome])) $d[$nome] = array(); if (count($d[$nome]) < 100000) $d[$nome][$x] = 1; }
  grava($arq, $d);
  solta($t);
}
/* Sinais recusados por passar do limite do endereço: contados num arquivo pequeno por dia (stats/cortados_AAAA-MM-DD.php), para não pesar. */
function conta_cortado() {
  $t = trava('cortados');
  $arq = subpasta('stats') . '/cortados_' . date('Y-m-d') . '.php';
  $d = le($arq);
  grava($arq, array('n' => ($d && isset($d['n']) ? (int) $d['n'] : 0) + 1));
  solta($t);
}
function ap_id($ap) { return 'a' . substr(hash('sha256', 'ap|' . $ap), 0, 14); } // identificação embaralhada do aparelho
/* Quem está com o jogo aberto agora: cada aparelho e a hora do último sinal. Sinais com mais de 15 minutos são esquecidos. */
function marca_agora($id) { // devolve a hora do sinal anterior deste aparelho (0 se não havia)
  $t = trava('stats');
  $arq = subpasta('stats') . '/agora.php';
  $d = le($arq);
  if (!$d) $d = array();
  $ag = time();
  $antes = isset($d[$id]) ? (int) $d[$id] : 0;
  foreach ($d as $k => $v) if ($v < $ag - 900) unset($d[$k]);
  if (count($d) < 50000) $d[$id] = $ag;
  grava($arq, $d);
  solta($t);
  return $antes;
}
/* Desde o começo: todos os aparelhos que já começaram uma batalha (jg) e os que já jogaram com conta (jc), em stats/sempre.php.
   "Jogaram sem conta desde o começo" = jogaram e nunca jogaram com conta. Na primeira vez o arquivo nasce da soma de todos os dias guardados. */
function sempre_monta() {
  $jg = array(); $jc = array();
  foreach ((array) @glob(subpasta('stats') . '/d_*.php') as $f) { $x = le($f); if (!$x) continue; if (isset($x['jg']) && is_array($x['jg'])) $jg += $x['jg']; if (isset($x['jc']) && is_array($x['jc'])) $jc += $x['jc']; }
  return array('jg' => $jg, 'jc' => $jc);
}
function sempre_le() { $d = le(subpasta('stats') . '/sempre.php'); if (!$d || !isset($d['jg']) || !is_array($d['jg']) || !isset($d['jc']) || !is_array($d['jc'])) return null; return $d; }
function sempre_marca($id, $c) { // chamada a cada batalha avisada; só grava quando o aparelho é novo na lista
  $t = trava('stats');
  $d = sempre_le(); $mudou = false;
  if (!$d) { $d = sempre_monta(); $mudou = true; }
  if (!isset($d['jg'][$id]) && count($d['jg']) < 500000) { $d['jg'][$id] = 1; $mudou = true; }
  if ($c && !isset($d['jc'][$id]) && count($d['jc']) < 500000) { $d['jc'][$id] = 1; $mudou = true; }
  if ($mudou) grava(subpasta('stats') . '/sempre.php', $d);
  solta($t);
}
/* Total de contas que existem agora. Conta os arquivos na hora, sem guardar o resultado, para nunca ficar atrasado. */
function total_contas() { return count((array) @glob(pasta_dados() . '/contas/*/c_*.php')); }
/* Quantas contas já foram criadas desde o começo. Diferente do total acima, não diminui quando um jogador apaga a conta.
   O contador nasce com o número de contas que existem na primeira vez que é usado. */
function contas_criadas($somar) {
  $arq = subpasta('stats') . '/total.php';
  $t = trava('stats');
  $d = le($arq);
  if (!$d || !isset($d['criadas'])) { $d = array('criadas' => total_contas()); grava($arq, $d); } // nasce já gravado, para uma conta apagada depois não fazer o número cair; a conta recém-criada já está entre as que existem
  elseif ($somar) { $d['criadas'] = (int) $d['criadas'] + 1; grava($arq, $d); }
  solta($t);
  return (int) $d['criadas'];
}
/* Painel: uma senha só, guardada embaralhada em painel.php na pasta de dados. O primeiro acesso exige o código cuja impressão digital é PAINEL_CODIGO. */
function painel_arq() { return pasta_dados() . '/painel.php'; }
function painel_usados() { $u = le(pasta_dados() . '/painel_usados.php'); return $u && isset($u['h']) && is_array($u['h']) ? $u['h'] : array(); } // impressões digitais dos códigos já gastos, guardadas fora do painel.php
function painel_sessao(&$adm, $token) {
  if (!is_string($token) || !preg_match('/^[0-9a-f]{48}\z/', $token)) erro('sessao', 'Entre no painel de novo.');
  $adm = le(painel_arq());
  if (!$adm) erro('sessao', 'Entre no painel de novo.');
  $h = hash('sha256', $token);
  foreach ((isset($adm['sessoes']) ? $adm['sessoes'] : array()) as $i => $x) if ($x['t'] >= time() - PAINEL_DIAS * 86400 && hash_equals($x['h'], $h)) return $i;
  erro('sessao', 'Entre no painel de novo.');
}
function painel_nova_sessao(&$adm) {
  $seg = bin2hex(random_bytes(24));
  $l = isset($adm['sessoes']) && is_array($adm['sessoes']) ? $adm['sessoes'] : array();
  $l[] = array('h' => hash('sha256', $seg), 't' => time());
  $adm['sessoes'] = array_slice($l, -5);
  return $seg;
}

/* ---------- Pedido ---------- */
$acao = isset($_GET['a']) ? (string) $_GET['a'] : '';
if ($acao === 'ping') { // também diz se o endereço que o PHP enxerga é o do visitante ('igual') ou o de um intermediário ('outro'), sem mostrar endereço nenhum: os limites por endereço dependem disso
  pasta_dados(); contas_criadas(false);
  $ra = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : ''; $xf = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]) : ''; $xr = isset($_SERVER['HTTP_X_REAL_IP']) ? trim($_SERVER['HTTP_X_REAL_IP']) : '';
  sai(array('ok' => true, 'dados' => $GLOBALS['onde_dados'], 'endereco' => ($xf === '' && $xr === '') ? 'sem_cabecalho' : (($xf !== '' && $xf === $ra) || ($xr !== '' && $xr === $ra) ? 'igual' : 'outro')));
}
if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') erro('pedido', 'Pedido inválido.');
// Só o jogo e o painel, abertos neste mesmo site, falam com a api. Outro site não consegue mandar JSON nem se passar pela mesma origem,
// então não dá para inflar os números nem travar senhas a partir das visitas de outra página.
if (strpos(strtolower(isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : ''), 'application/json') !== 0) erro('pedido', 'Pedido inválido.');
$sfs = isset($_SERVER['HTTP_SEC_FETCH_SITE']) ? $_SERVER['HTTP_SEC_FETCH_SITE'] : '';
if ($sfs !== '' && $sfs !== 'same-origin' && $sfs !== 'none') erro('pedido', 'Pedido inválido.');
$bruto = file_get_contents('php://input', false, null, 0, CORPO_MAX + 1);
if ($bruto === false || strlen($bruto) > CORPO_MAX) erro('pedido', 'Pedido grande demais.');
$B = json_decode($bruto, true);
if (!is_array($B)) erro('pedido', 'Pedido inválido.');
$ap = isset($B['ap']) && is_string($B['ap']) && preg_match('/^[0-9a-z]{6,24}\z/', $B['ap']) ? $B['ap'] : ''; // identificação do aparelho que está gravando
faxina();

/* Sinais do jogo para o painel. Em todos vem "ap" (identificação anônima do aparelho) e "c" (1 = o aparelho está numa conta).
   visita = o jogo foi aberto · jogou = começou uma batalha · pulso = o jogo continua aberto (a cada 2 minutos). */
if ($acao === 'visita' || $acao === 'jogou' || $acao === 'pulso') {
  // limites por endereço, um para cada tipo de sinal (o pulso é o mais frequente e não pode gastar a cota dos outros);
  // são folgados porque uma operadora de celular ou um wi-fi de escola põe muita gente atrás do mesmo endereço
  $tl = trava('limites');
  $livre = limite(subpasta('limites') . '/ip_' . ip_chave() . '.php', $acao, $acao === 'pulso' ? LIM_PULSO_IP : LIM_VISITA_IP, true);
  solta($tl);
  // passou do limite: o sinal não é contado e o jogo fica sabendo (ok: false), para mandar de novo mais tarde; o dia guarda quantos foram cortados
  if (!$livre) { conta_cortado(); sai(array('ok' => false, 'erro' => 'muitas', 'dia' => date('Y-m-d'))); }
  if ($ap !== AP_TESTE) {
    $id = $ap !== '' ? ap_id($ap) : null; $c = !empty($B['c']);
    if ($acao === 'visita') conta_stat('aberturas', $id ? ($c ? array('ap' => $id, 'apc' => $id) : array('ap' => $id)) : array());
    if ($acao === 'jogou' && $id) { conta_stat('partidas', $c ? array('ap' => $id, 'apc' => $id, 'jg' => $id, 'jc' => $id) : array('ap' => $id, 'jg' => $id)); sempre_marca($id, $c); }
    if ($id) {
      $antes = marca_agora($id);
      // jogo aberto desde ontem: no primeiro pulso depois da meia-noite a pessoa entra nos que abriram hoje
      if ($acao === 'pulso' && $antes > 0 && date('Y-m-d', $antes) !== date('Y-m-d')) conta_stat(null, $c ? array('ap' => $id, 'apc' => $id) : array('ap' => $id)); // um aparelho nunca visto só entra nos números com "visita" ou "jogou"
    }
  }
  sai(array('ok' => true, 'dia' => date('Y-m-d'))); // o dia do servidor: o jogo usa para saber quando virou o dia
}

/* ---------- Painel do dono ---------- */
if ($acao === 'painel_estado') { sai(array('ok' => true, 'tem_senha' => (bool) le(painel_arq()))); }

if ($acao === 'painel_criar') { // primeiro acesso (ou troca de senha com um código novo): código + senha nova
  $cod = isset($B['codigo']) && is_string($B['codigo']) ? preg_replace('/[^A-Z0-9]/', '', strtoupper(substr($B['codigo'], 0, 64))) : '';
  $senha = isset($B['senha']) ? $B['senha'] : null;
  $lim = subpasta('limites') . '/ip_' . ip_chave() . '.php';
  $tl = trava('limites'); $livre = limite($lim, 'falha', LIM_FALHA_IP, false); solta($tl);
  if (!$livre) erro('muitas', 'Muitas tentativas. Espere alguns minutos e tente de novo.');
  if ($cod === '' || !hash_equals(PAINEL_CODIGO, hash('sha256', $cod))) { $tl = trava('limites'); limite($lim, 'falha', LIM_FALHA_IP, true); solta($tl); erro('codigo', 'Código errado.'); }
  if (!is_string($senha) || strlen($senha) < 8 || strlen($senha) > 64) erro('senha', 'A senha do painel precisa ter pelo menos 8 letras ou números.');
  $t = trava('painel');
  $adm = le(painel_arq());
  $usados = painel_usados();
  if (($adm && isset($adm['codigo']) && $adm['codigo'] === PAINEL_CODIGO) || in_array(PAINEL_CODIGO, $usados, true)) { solta($t); erro('ja', $adm ? 'O painel já tem senha. Entre com ela.' : 'Esse código já foi usado. Peça um código novo.'); } // cada código vale uma vez só, mesmo que o arquivo da senha se perca ou o código antigo volte
  $usados[] = PAINEL_CODIGO; grava(pasta_dados() . '/painel_usados.php', array('h' => $usados));
  $adm = array('senha' => password_hash($senha, PASSWORD_DEFAULT), 'codigo' => PAINEL_CODIGO, 'criado' => time(), 'sessoes' => array());
  $token = painel_nova_sessao($adm);
  grava(painel_arq(), $adm);
  solta($t);
  sai(array('ok' => true, 'token' => $token));
}

if ($acao === 'painel_entrar') {
  $senha = isset($B['senha']) && is_string($B['senha']) ? substr($B['senha'], 0, 64) : '';
  // quem erra a senha é barrado pelo próprio endereço (8 erros por hora); assim um estranho errando de propósito não tranca o dono para fora
  $lim = subpasta('limites') . '/ip_' . ip_chave() . '.php';
  $t = trava('painel'); // uma tentativa de cada vez: a conferência do limite e a soma do erro acontecem juntas, mesmo com muitos pedidos ao mesmo tempo
  $tl = trava('limites'); $livre = limite($lim, 'painel', LIM_PAINEL_IP, false); solta($tl);
  if (!$livre) { solta($t); erro('muitas', 'Muitas senhas erradas neste endereço. Espere até uma hora e tente de novo.'); }
  $adm = le(painel_arq());
  if (!$adm) { solta($t); erro('sem_senha', 'O painel ainda não tem senha. Use o código de primeiro acesso.'); }
  $f = isset($adm['falhas']) ? $adm['falhas'] : array('n' => 0, 't' => 0);
  if (time() - $f['t'] > 900) $f = array('n' => 0, 't' => time());
  if ($f['n'] >= LIM_PAINEL_GERAL) { solta($t); erro('muitas', 'Muitas tentativas. Espere 15 minutos e tente de novo.'); } // freio geral, para ninguém chutar senha de muitos endereços
  if ($senha === '' || strpos($senha, "\0") !== false || !password_verify($senha, $adm['senha'])) {
    $f['n']++; $adm['falhas'] = $f; grava(painel_arq(), $adm);
    $tl = trava('limites'); limite($lim, 'painel', LIM_PAINEL_IP, true); solta($tl);
    solta($t);
    erro('login', 'Senha errada.');
  }
  $token = painel_nova_sessao($adm); // a senha certa não zera a contagem de erros dos outros: ela só expira com o tempo
  grava(painel_arq(), $adm);
  solta($t);
  sai(array('ok' => true, 'token' => $token));
}

if ($acao === 'painel_sair') {
  $t = trava('painel'); $adm = null; $i = painel_sessao($adm, isset($B['token']) ? $B['token'] : null);
  array_splice($adm['sessoes'], $i, 1); grava(painel_arq(), $adm); solta($t);
  sai(array('ok' => true));
}

if ($acao === 'painel_dados') { // números de um mês (o atual, ou o pedido em "mes": AAAA-MM), dia por dia, mais os totais do mês
  $t = trava('painel'); $adm = null; $si = painel_sessao($adm, isset($B['token']) ? $B['token'] : null);
  if (time() - $adm['sessoes'][$si]['t'] > 86400) { $adm['sessoes'][$si]['t'] = time(); grava(painel_arq(), $adm); } // usar o painel mantém a sessão viva
  solta($t);
  @ini_set('memory_limit', '512M'); // somar um mês com centenas de milhares de aparelhos pede memória
  $hoje = date('Y-m-d');
  $mes = isset($B['mes']) && is_string($B['mes']) && preg_match('/^20\d\d-(0[1-9]|1[0-2])\z/', $B['mes']) ? $B['mes'] : substr($hoje, 0, 7);
  $nd = (int) date('t', strtotime($mes . '-01'));
  $dias = array(); $uAp = array(); $uApc = array(); $uJg = array(); $uJc = array(); $contas = 0; $fora = ap_id(AP_TESTE);
  for ($n = 1; $n <= $nd; $n++) {
    $dia = sprintf('%s-%02d', $mes, $n);
    if ($dia > $hoje) break; // dias que ainda não chegaram não entram
    $d = le(dia_arq($dia));
    $cj = function ($k) use ($d, $fora) { $x = $d && isset($d[$k]) && is_array($d[$k]) ? $d[$k] : array(); unset($x[$fora]); return $x; }; // o aparelho de teste nunca conta
    $aps = $cj('ap'); $apc = array_intersect_key($cj('apc'), $aps); $jg = $cj('jg'); $jc = array_intersect_key($cj('jc'), $jg);
    $dias[] = array('dia' => $dia, 'pessoas' => count($aps), 'sem_cadastro' => count($aps) - count($apc), 'aberturas' => $d && isset($d['aberturas']) ? (int) $d['aberturas'] : 0, 'contas' => $d && isset($d['contas']) ? (int) $d['contas'] : 0,
      'jogaram' => count($jg), 'jogaram_com' => count($jc), 'jogaram_sem' => count($jg) - count($jc), 'salvaram' => count($cj('ativos')), 'entradas' => $d && isset($d['entradas']) ? (int) $d['entradas'] : 0);
    $uAp += $aps; $uApc += $apc; $uJg += $jg; $uJc += $jc; $contas += $d && isset($d['contas']) ? (int) $d['contas'] : 0;
  }
  $uJc = array_intersect_key($uJc, $uJg); $uApc = array_intersect_key($uApc, $uAp);
  // no mês cada pessoa conta uma vez só, mesmo que tenha vindo em vários dias
  $totais = array('pessoas' => count($uAp), 'sem_cadastro' => count($uAp) - count($uApc), 'jogaram' => count($uJg), 'jogaram_com' => count($uJc), 'jogaram_sem' => count($uJg) - count($uJc), 'contas' => $contas);
  $arqs = (array) @glob(subpasta('stats') . '/d_*.php'); sort($arqs);
  $primeiro = $arqs && preg_match('/d_(\d{4}-\d{2}-\d{2})\.php$/', $arqs[0], $m) ? $m[1] : $hoje; // primeiro dia com contagem
  $ag = le(subpasta('stats') . '/agora.php'); $online = 0; if ($ag) { unset($ag[$fora]); foreach ($ag as $v) if ($v >= time() - 300) $online++; } // sinal nos últimos 5 minutos
  $sp = sempre_le(); if (!$sp) $sp = sempre_monta(); unset($sp['jg'][$fora], $sp['jc'][$fora]); // desde o começo, sem o aparelho de teste
  $spc = count(array_intersect_key($sp['jc'], $sp['jg']));
  $sempre = array('jogaram' => count($sp['jg']), 'jogaram_com' => $spc, 'jogaram_sem' => count($sp['jg']) - $spc);
  sai(array('ok' => true, 'agora' => time(), 'hoje' => $hoje, 'mes' => $mes, 'primeiro' => $primeiro, 'dias' => $dias, 'mes_totais' => $totais, 'sempre' => $sempre, 'online' => $online, 'total_contas' => contas_criadas(false)));
}

if ($acao === 'criar') {
  $nome = nome_limpo(isset($B['nome']) ? $B['nome'] : null);
  if ($nome === null) erro('nome', 'O nome precisa ter de 3 a 16 letras ou números.');
  if (!senha_ok(isset($B['senha']) ? $B['senha'] : null)) erro('senha', 'A senha precisa ter pelo menos ' . SENHA_MIN . ' letras ou números.');
  $save = isset($B['save']) ? $B['save'] : '{}';
  if (!save_ok($save) || strlen($save) > SAVE_NOVO_MAX) erro('save', 'O jogo salvo veio com defeito.');
  $chave = nome_chave($nome);
  $tl = trava('limites');
  $lim = subpasta('limites');
  if (!limite($lim . '/ip_' . ip_chave() . '.php', 'criar', LIM_CRIAR_IP, false) || !limite($lim . '/geral.php', 'criar', LIM_CRIAR_GERAL, false)) { solta($tl); erro('muitas', 'Muitas contas criadas agora há pouco. Espere um pouco e tente de novo.'); }
  $t = trava('c' . substr($chave, 0, 2));
  $arq = arq_conta($chave);
  if (@file_exists($arq)) { solta($t); solta($tl); erro('nome_usado', 'Esse nome já tem dono. Escolha outro.'); }
  $conta = array('nome' => $nome, 'senha' => password_hash($B['senha'], PASSWORD_DEFAULT), 'criada' => time(), 'rev' => 1, 'ap' => $ap, 'save' => $save, 'sessoes' => array());
  $token = nova_sessao($conta, $chave);
  grava($arq, $conta);
  solta($t);
  limite($lim . '/ip_' . ip_chave() . '.php', 'criar', LIM_CRIAR_IP, true);
  limite($lim . '/geral.php', 'criar', LIM_CRIAR_GERAL, true);
  contas_criadas(true); // ainda dentro da trava das contas novas: nenhuma outra conta está nascendo agora, então o contador não erra
  solta($tl);
  conta_stat('contas', $ap !== '' ? array('ap' => ap_id($ap), 'apc' => ap_id($ap)) : array());
  sai(array('ok' => true, 'token' => $token, 'nome' => $nome, 'rev' => 1));
}

if ($acao === 'entrar') {
  $nome = nome_limpo(isset($B['nome']) ? $B['nome'] : null);
  $senha = isset($B['senha']) && is_string($B['senha']) ? substr($B['senha'], 0, 64) : '';
  $errado = 'Nome ou senha errados.';
  if ($nome === null || $senha === '') erro('login', $errado);
  $lim = subpasta('limites') . '/ip_' . ip_chave() . '.php';
  $tl = trava('limites');
  $livre = limite($lim, 'falha', LIM_FALHA_IP, false);
  solta($tl);
  if (!$livre) erro('muitas', 'Muitas tentativas. Espere alguns minutos e tente de novo.');
  $chave = nome_chave($nome);
  $t = trava('c' . substr($chave, 0, 2));
  $arq = arq_conta($chave);
  $conta = le($arq);
  $agora = time();
  $f = $conta && isset($conta['falhas']) ? $conta['falhas'] : array('n' => 0, 't' => 0);
  if ($agora - $f['t'] > 900) $f = array('n' => 0, 't' => $agora);
  if ($conta && $f['n'] >= LIM_FALHA_CONTA) { solta($t); erro('muitas', 'Muitas tentativas nessa conta. Espere 15 minutos e tente de novo.'); }
  // confere a senha mesmo quando a conta não existe, para a resposta demorar o mesmo tanto nos dois casos
  $certa = password_verify($senha, $conta ? $conta['senha'] : '$2y$10$ZfY4BvLNAEQOWW3C/buk8OZNoGJ6GT3Ka88KX27VUiXybMy/pmw5i') && $conta;
  if (!$certa) {
    if ($conta) { $f['n']++; $conta['falhas'] = $f; grava($arq, $conta); }
    solta($t);
    $tl = trava('limites'); limite($lim, 'falha', LIM_FALHA_IP, true); solta($tl);
    erro('login', $errado);
  }
  unset($conta['falhas']);
  if (password_needs_rehash($conta['senha'], PASSWORD_DEFAULT)) $conta['senha'] = password_hash($senha, PASSWORD_DEFAULT);
  $token = nova_sessao($conta, $chave);
  grava($arq, $conta);
  solta($t);
  conta_stat('entradas', $ap !== '' ? array('ap' => ap_id($ap), 'apc' => ap_id($ap)) : array());
  sai(array('ok' => true, 'token' => $token, 'nome' => $conta['nome'], 'rev' => (int) $conta['rev'], 'save' => $conta['save']));
}

/* Daqui para baixo, tudo precisa de sessão. */
$token = isset($B['token']) ? $B['token'] : null;
$ck = chave_do_token($token);
if ($ck === null) erro('sessao', 'Entre na sua conta de novo.');
$t = trava('c' . substr($ck, 0, 2));
$conta = null;
list($chave, $si) = abre_sessao($token, $conta);
$arq = arq_conta($chave);

if ($acao === 'carregar') {
  if (time() - $conta['sessoes'][$si]['t'] > 86400) { $conta['sessoes'][$si]['t'] = time(); grava($arq, $conta); } // marca o uso da sessão, no máximo uma vez por dia
  solta($t);
  sai(array('ok' => true, 'nome' => $conta['nome'], 'rev' => (int) $conta['rev'], 'ap' => isset($conta['ap']) ? $conta['ap'] : '', 'save' => $conta['save']));
}

if ($acao === 'salvar') {
  $save = isset($B['save']) ? $B['save'] : null;
  if (!save_ok($save)) { solta($t); erro('save', 'O jogo salvo veio com defeito.'); }
  $rev = isset($B['rev']) ? (int) $B['rev'] : -1;
  $meu = $ap !== '' && isset($conta['ap']) && $conta['ap'] === $ap; // a última gravação foi deste mesmo aparelho
  // outro aparelho gravou depois do que este conhecia: não grava por cima; devolve o que está na conta
  if ($rev !== (int) $conta['rev'] && !$meu) { solta($t); sai(array('ok' => false, 'erro' => 'conflito', 'msg' => 'A conta foi usada em outro aparelho.', 'rev' => (int) $conta['rev'], 'save' => $conta['save'])); }
  $hoje = date('Y-m-d'); $novoDia = !isset($conta['dia']) || $conta['dia'] !== $hoje; // primeira gravação desta conta hoje: conta como "jogou hoje" no painel
  if ($save !== $conta['save'] || !$meu || $novoDia) { if ($save !== $conta['save'] || !$meu) { $conta['save'] = $save; $conta['rev'] = (int) $conta['rev'] + 1; $conta['ap'] = $ap; } $conta['salvo'] = time(); $conta['dia'] = $hoje; grava($arq, $conta); }
  solta($t);
  if ($novoDia) conta_stat(null, 'ativos', 'c' . substr($chave, 0, 16));
  sai(array('ok' => true, 'rev' => (int) $conta['rev']));
}

if ($acao === 'sair') {
  array_splice($conta['sessoes'], $si, 1);
  grava($arq, $conta);
  solta($t);
  sai(array('ok' => true));
}

if ($acao === 'apagar') {
  $senha = isset($B['senha']) && is_string($B['senha']) ? substr($B['senha'], 0, 64) : '';
  $f = isset($conta['falhas']) ? $conta['falhas'] : array('n' => 0, 't' => 0);
  if (time() - $f['t'] > 900) $f = array('n' => 0, 't' => time());
  if ($f['n'] >= LIM_FALHA_CONTA) { solta($t); erro('muitas', 'Muitas tentativas. Espere 15 minutos e tente de novo.'); }
  if (!password_verify($senha, $conta['senha'])) { $f['n']++; $conta['falhas'] = $f; grava($arq, $conta); solta($t); erro('login', 'Senha errada.'); }
  @unlink($arq);
  solta($t);
  sai(array('ok' => true));
}

solta($t);
erro('pedido', 'Pedido inválido.');
