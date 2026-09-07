<?php
/**
 * Proxy de geocoding (Nominatim) — Pipocando VV
 * Aceita ?q=endereço e opcionalmente ?lat=&lng= da loja (viewbox).
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=1800');

$cep = preg_replace('/\D+/', '', (string) ($_GET['cep'] ?? ''));
$q = trim((string) ($_GET['q'] ?? ''));
$storeLat = isset($_GET['lat']) ? (float) $_GET['lat'] : -20.3539;
$storeLng = isset($_GET['lng']) ? (float) $_GET['lng'] : -40.3558;

if ($cep !== '' && strlen($cep) === 8 && $q === '') {
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

$query = preg_replace('/\b(casa|apto|apartamento|bloco|fundos)\b/iu', ' ', $q);
$query = preg_replace('/\s+/', ' ', trim($query));
if (!preg_match('/\b(ES|Esp[ií]rito Santo|Vila Velha|Vit[oó]ria|Cariacica|Brasil)\b/iu', $query)) {
  $query .= ', Espírito Santo, Brasil';
}

// Viewbox ~ ±0.18° (~20 km) em volta da loja
$delta = 0.18;
$viewbox = implode(',', [
  $storeLng - $delta,
  $storeLat + $delta,
  $storeLng + $delta,
  $storeLat - $delta,
]);

$params = [
  'q' => $query,
  'format' => 'json',
  'limit' => 5,
  'addressdetails' => 0,
  'countrycodes' => 'br',
  'viewbox' => $viewbox,
  'bounded' => 0, // preferência, não prisão total
];

$url = 'https://nominatim.openstreetmap.org/search?' . http_build_query($params);
$ctx = stream_context_create([
  'http' => [
    'method' => 'GET',
    'header' => "User-Agent: PipocandoVV-Delivery/1.1 (contato@pipocandovv.com.br)\r\nAccept: application/json\r\n",
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
if (!is_array($data) || !$data) {
  echo json_encode(['ok' => false, 'error' => 'Endereço não encontrado']);
  exit;
}

$best = null;
$bestKm = PHP_FLOAT_MAX;
foreach ($data as $row) {
  if (!isset($row['lat'], $row['lon'])) continue;
  $lat = (float) $row['lat'];
  $lng = (float) $row['lon'];
  $dLat = deg2rad($lat - $storeLat);
  $dLng = deg2rad($lng - $storeLng);
  $a = sin($dLat / 2) ** 2 + cos(deg2rad($storeLat)) * cos(deg2rad($lat)) * sin($dLng / 2) ** 2;
  $km = 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
  if ($km < $bestKm) {
    $bestKm = $km;
    $best = $row;
  }
}

if (!$best) {
  echo json_encode(['ok' => false, 'error' => 'Endereço não encontrado']);
  exit;
}

echo json_encode([
  'ok' => true,
  'lat' => (float) $best['lat'],
  'lng' => (float) $best['lon'],
  'km' => round($bestKm, 2),
  'label' => (string) ($best['display_name'] ?? $q),
]);
