<?php
/**
 * Proxy de geocoding (Nominatim / OpenStreetMap) — Pipocando VV
 * Aceita ?q=endereço ou ?cep=29000000
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$cep = preg_replace('/\D+/', '', (string) ($_GET['cep'] ?? ''));
$q = trim((string) ($_GET['q'] ?? ''));

if ($cep !== '' && strlen($cep) === 8) {
  $q = $cep . ', Espírito Santo, Brasil';
}

if (mb_strlen($q) < 5) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Endereço muito curto']);
  exit;
}
if (mb_strlen($q) > 280) {
  $q = mb_substr($q, 0, 280);
}

// Remove complementos que atrapalham (ex.: "CASA")
$query = preg_replace('/\b(casa|apto|apartamento|bloco|fundos)\b/iu', ' ', $q);
$query = preg_replace('/\s+/', ' ', trim($query));

if (!preg_match('/\b(ES|Esp[ií]rito Santo|Vila Velha|Vit[oó]ria|Cariacica|Brasil)\b/iu', $query)) {
  $query .= ', Espírito Santo, Brasil';
}

$url = 'https://nominatim.openstreetmap.org/search?' . http_build_query([
  'q' => $query,
  'format' => 'json',
  'limit' => 1,
  'addressdetails' => 0,
  'countrycodes' => 'br',
]);

$ctx = stream_context_create([
  'http' => [
    'method' => 'GET',
    'header' => "User-Agent: PipocandoVV-Delivery/1.0 (contato@pipocandovv.com.br)\r\nAccept: application/json\r\n",
    'timeout' => 8,
  ],
]);

$raw = @file_get_contents($url, false, $ctx);
if ($raw === false) {
  http_response_code(502);
  echo json_encode(['ok' => false, 'error' => 'Falha ao consultar mapa']);
  exit;
}

$data = json_decode($raw, true);
if (!is_array($data) || !isset($data[0]['lat'], $data[0]['lon'])) {
  echo json_encode(['ok' => false, 'error' => 'Endereço não encontrado']);
  exit;
}

echo json_encode([
  'ok' => true,
  'lat' => (float) $data[0]['lat'],
  'lng' => (float) $data[0]['lon'],
  'label' => (string) ($data[0]['display_name'] ?? $q),
]);
