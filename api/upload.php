<?php
/**
 * Upload de imagens — Hostinger
 * Só aceita path público se gravar ao lado das fotos que já abrem em /products.
 * Se a pasta pública não existir, devolve dataUrl para salvar no MySQL.
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Password');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => 'Método não permitido']);
  exit;
}

require_once __DIR__ . '/mysql_store.php';

$password = $_SERVER['HTTP_X_ADMIN_PASSWORD'] ?? '';

try {
  $pdo = aurora_db();
  $auth = aurora_get_auth($pdo);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Falha na conexão MySQL', 'detail' => $e->getMessage()]);
  exit;
}

$authPass = (string) ($auth['password'] ?? '');
if ($password === '' || $authPass === '' || !hash_equals($authPass, $password)) {
  http_response_code(401);
  echo json_encode(['error' => 'Senha inválida — saia e entre de novo no admin']);
  exit;
}

if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
  $err = (int) ($_FILES['image']['error'] ?? -1);
  $hints = [
    UPLOAD_ERR_INI_SIZE => 'Arquivo maior que o limite do servidor',
    UPLOAD_ERR_FORM_SIZE => 'Arquivo muito grande',
    UPLOAD_ERR_PARTIAL => 'Upload incompleto — tente de novo',
    UPLOAD_ERR_NO_FILE => 'Nenhum arquivo enviado',
    UPLOAD_ERR_NO_TMP_DIR => 'Pasta temporária ausente no servidor',
    UPLOAD_ERR_CANT_WRITE => 'Sem permissão para gravar no disco',
  ];
  http_response_code(400);
  echo json_encode(['error' => $hints[$err] ?? 'Envie uma imagem válida (JPG/PNG)']);
  exit;
}

$file = $_FILES['image'];
$tmp = $file['tmp_name'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($tmp);

$allowed = [
  'image/jpeg' => 'jpg',
  'image/png' => 'png',
  'image/webp' => 'webp',
  'image/gif' => 'gif',
];

if (!isset($allowed[$mime])) {
  http_response_code(400);
  echo json_encode(['error' => 'Formato inválido. Use JPG ou PNG (HEIC do iPhone não funciona)']);
  exit;
}

if ($file['size'] > 8 * 1024 * 1024) {
  http_response_code(400);
  echo json_encode(['error' => 'Imagem maior que 8MB']);
  exit;
}

/**
 * Tenta reencode para JPG 3:4 (igual ao card do site)
 */
function aurora_image_to_jpeg(string $src, string $dest, string $mime, int $outW = 720, int $outH = 960): bool {
  if (!function_exists('imagecreatetruecolor')) {
    return false;
  }
  $img = null;
  if ($mime === 'image/jpeg' && function_exists('imagecreatefromjpeg')) {
    $img = @imagecreatefromjpeg($src);
  } elseif ($mime === 'image/png' && function_exists('imagecreatefrompng')) {
    $img = @imagecreatefrompng($src);
  } elseif ($mime === 'image/webp' && function_exists('imagecreatefromwebp')) {
    $img = @imagecreatefromwebp($src);
  } elseif ($mime === 'image/gif' && function_exists('imagecreatefromgif')) {
    $img = @imagecreatefromgif($src);
  }
  if (!$img) {
    return false;
  }

  $w = imagesx($img);
  $h = imagesy($img);
  $targetRatio = $outW / max($outH, 1);
  $srcRatio = $w / max($h, 1);

  $sx = 0;
  $sy = 0;
  $sWidth = $w;
  $sHeight = $h;
  if ($srcRatio > $targetRatio) {
    $sWidth = (int) round($h * $targetRatio);
    $sx = (int) round(($w - $sWidth) / 2);
  } elseif ($srcRatio < $targetRatio) {
    $sHeight = (int) round($w / $targetRatio);
    $sy = (int) round(($h - $sHeight) / 2);
  }

  $canvas = imagecreatetruecolor($outW, $outH);
  $white = imagecolorallocate($canvas, 255, 255, 255);
  imagefilledrectangle($canvas, 0, 0, $outW, $outH, $white);
  imagecopyresampled($canvas, $img, 0, 0, $sx, $sy, $outW, $outH, $sWidth, $sHeight);
  imagedestroy($img);

  $ok = imagejpeg($canvas, $dest, 82);
  imagedestroy($canvas);
  return $ok && is_file($dest);
}

function aurora_tmp_jpeg_bytes(string $src, string $mime): ?string {
  $tmpOut = tempnam(sys_get_temp_dir(), 'aurora_img_');
  if ($tmpOut === false) {
    return null;
  }
  $dest = $tmpOut . '.jpg';
  @unlink($tmpOut);
  if (!aurora_image_to_jpeg($src, $dest, $mime)) {
    // Sem GD: devolve bytes originais se já for jpeg
    if ($mime === 'image/jpeg') {
      $raw = file_get_contents($src);
      return $raw !== false ? $raw : null;
    }
    return null;
  }
  $bytes = file_get_contents($dest);
  @unlink($dest);
  return $bytes !== false ? $bytes : null;
}

$docRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), "/\\");
$siteRoot = dirname(__DIR__);
$candidates = [];
if ($docRoot !== '') {
  $candidates[] = $docRoot . DIRECTORY_SEPARATOR . 'products';
}
$candidates[] = $siteRoot . DIRECTORY_SEPARATOR . 'products';
$homeGuess = dirname($siteRoot) . DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR . 'products';
if (!in_array($homeGuess, $candidates, true)) {
  $candidates[] = $homeGuess;
}
$candidates = array_values(array_unique($candidates));

// Âncora: pasta onde já existe foto pública conhecida (só essa é segura)
$anchorName = '9dae6d0f-4354-459a-aa17-50081e3f0afb.jpg';
$anchorDirs = [];
foreach ($candidates as $candidate) {
  if (!is_dir($candidate)) {
    @mkdir($candidate, 0755, true);
  }
  if (!(is_dir($candidate) && is_writable($candidate))) {
    continue;
  }
  if (is_file($candidate . DIRECTORY_SEPARATOR . $anchorName)) {
    $anchorDirs[] = $candidate;
  }
}
$anchorDirs = array_values(array_unique($anchorDirs));

$savedAs = sprintf(
  '%s-%s-%s-%s-%s.jpg',
  bin2hex(random_bytes(4)),
  bin2hex(random_bytes(2)),
  bin2hex(random_bytes(2)),
  bin2hex(random_bytes(2)),
  bin2hex(random_bytes(6))
);

$jpegBytes = aurora_tmp_jpeg_bytes($tmp, $mime);
if ($jpegBytes === null || strlen($jpegBytes) < 32) {
  http_response_code(500);
  echo json_encode(['error' => 'Falha ao processar a imagem']);
  exit;
}

$blobOk = false;
for ($i = 0; $i < 2 && !$blobOk; $i++) {
  try {
    $blobOk = aurora_store_product_image_blob($pdo, $savedAs, $jpegBytes, 'image/jpeg');
  } catch (Throwable $e) {
    $blobOk = false;
  }
}

if (!$blobOk) {
  http_response_code(503);
  echo json_encode([
    'ok' => false,
    'error' => 'Não deu para guardar a foto com segurança. Tente de novo em alguns segundos.',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

// Tenta gravar também em products/ (rápido no site). Se falhar, photo.php serve o blob.
$diskOk = false;
$savedDirs = [];
if ($anchorDirs) {
  $primary = $anchorDirs[0];
  $dest = $primary . DIRECTORY_SEPARATOR . $savedAs;
  if (@file_put_contents($dest, $jpegBytes) !== false) {
    @chmod($dest, 0644);
    $diskOk = true;
    $savedDirs[] = $primary;
    foreach ($anchorDirs as $dir) {
      if ($dir === $primary) continue;
      $copyTo = $dir . DIRECTORY_SEPARATOR . $savedAs;
      if (@file_put_contents($copyTo, $jpegBytes) !== false) {
        @chmod($copyTo, 0644);
        $savedDirs[] = $dir;
      }
    }
  }
}

// Path canônico: products/… (htaccess → photo.php se o arquivo sumir no Git)
$path = 'products/' . $savedAs;

echo json_encode([
  'ok' => true,
  'path' => $path,
  'url' => '/' . $path,
  'bytes' => strlen($jpegBytes),
  'dirs' => count($savedDirs),
  'anchor' => $diskOk,
  'blob' => true,
  'dir' => $savedDirs[0] ?? null,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;
