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
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const SAVE_MAX = 60000;      // tamanho máximo do jogo salvo, em bytes
const CORPO_MAX = 80000;     // tamanho máximo de um pedido
const SENHA_MIN = 6;
const SESSOES_MAX = 8;       // aparelhos ligados na mesma conta
const SESSAO_DIAS = 180;     // sessão sem uso por esse tempo é esquecida
const LIM_CRIAR_IP = 60;     // contas novas por hora, por endereço
const LIM_CRIAR_GERAL = 600; // contas novas por hora, no site todo
const LIM_FALHA_IP = 60;     // senhas erradas por hora, por endereço
const LIM_FALHA_CONTA = 10;  // senhas erradas em 15 minutos, por conta
const GUARDA = "<?php http_response_code(404); exit; ?>\n"; // primeira linha de cada arquivo de dados: se alguém abrir pelo navegador, não mostra nada

function sai($dados) { echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
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
  $txt = GUARDA . json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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

function senha_ok($s) { return is_string($s) && strlen($s) >= SENHA_MIN && strlen($s) <= 64; }
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
  if (!is_string($token) || !preg_match('/^([0-9a-f]{32})\.([0-9a-f]{48})$/', $token, $m)) erro('sessao', 'Entre na sua conta de novo.');
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

/* ---------- Pedido ---------- */
$acao = isset($_GET['a']) ? (string) $_GET['a'] : '';
if ($acao === 'ping') { pasta_dados(); sai(array('ok' => true, 'dados' => $GLOBALS['onde_dados'])); }
if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') erro('pedido', 'Pedido inválido.');
$bruto = file_get_contents('php://input', false, null, 0, CORPO_MAX + 1);
if ($bruto === false || strlen($bruto) > CORPO_MAX) erro('pedido', 'Pedido grande demais.');
$B = json_decode($bruto, true);
if (!is_array($B)) erro('pedido', 'Pedido inválido.');
$ap = isset($B['ap']) && is_string($B['ap']) && preg_match('/^[0-9a-z]{6,24}$/', $B['ap']) ? $B['ap'] : ''; // identificação do aparelho que está gravando
faxina();

if ($acao === 'criar') {
  $nome = nome_limpo(isset($B['nome']) ? $B['nome'] : null);
  if ($nome === null) erro('nome', 'O nome precisa ter de 3 a 16 letras ou números.');
  if (!senha_ok(isset($B['senha']) ? $B['senha'] : null)) erro('senha', 'A senha precisa ter pelo menos ' . SENHA_MIN . ' letras ou números.');
  $save = isset($B['save']) ? $B['save'] : '{}';
  if (!save_ok($save)) erro('save', 'O jogo salvo veio com defeito.');
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
  solta($tl);
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
  if ($save !== $conta['save'] || !$meu) { $conta['save'] = $save; $conta['rev'] = (int) $conta['rev'] + 1; $conta['ap'] = $ap; $conta['salvo'] = time(); grava($arq, $conta); }
  solta($t);
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
