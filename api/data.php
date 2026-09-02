<?php
/**
 * API Pipocando VV — MySQL Hostinger
 * Banco: u586160337_pipocandovv
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Password');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// Ping ultraleve ANTES de qualquer include/MySQL
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && isset($_GET['ping'])) {
  header('Cache-Control: no-store');
  echo '{"ok":true,"db":"mysql","light":true,"ts":' . time() . '}';
  exit;
}

// Catálogo estático sem carregar PDO (evita processo pesado)
if (
  ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET'
  && !isset($_GET['full'])
  && !isset($_GET['rebuild'])
  && (($_GET['action'] ?? '') !== 'full')
) {
  $catalogFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'catalog.json';
  if (is_file($catalogFile)) {
    $raw = @file_get_contents($catalogFile);
    if (is_string($raw) && $raw !== '' && strpos($raw, '"products"') !== false) {
      header('Cache-Control: no-store, max-age=0');
      echo $raw;
      exit;
    }
  }
}

// Site OFF → não abre MySQL (cada conexão = processo)
$siteOff = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'SITE_OFF';
if (is_file($siteOff)) {
  http_response_code(503);
  header('Retry-After: 3600');
  echo '{"ok":false,"offline":true}';
  exit;
}

require_once __DIR__ . '/mysql_store.php';

function public_payload(array $data): array {
  $coupons = [];
  foreach ($data['coupons'] ?? [] as $c) {
    if (empty($c['active'])) continue;
    $coupons[] = [
      'code' => strtoupper(trim((string) ($c['code'] ?? ''))),
      'type' => ($c['type'] ?? '') === 'fixed' ? 'fixed' : 'percent',
      'value' => (float) ($c['value'] ?? 0),
      'minOrder' => (float) ($c['minOrder'] ?? 0),
      'label' => $c['label'] ?? '',
    ];
  }

  // Produtos: mantém paths; data-URL enorme já é convertida gradualmente no loader
  $products = [];
  foreach ($data['products'] ?? [] as $p) {
    if (!is_array($p)) continue;
    $products[] = $p;
  }

  return [
    'version' => $data['version'] ?? 1,
    'settings' => $data['settings'] ?? new stdClass(),
    'categories' => $data['categories'] ?? [],
    'products' => $products,
    'reviews' => $data['reviews'] ?? [],
    'faq' => $data['faq'] ?? [],
    'gallery' => $data['gallery'] ?? [],
    'coupons' => $coupons,
  ];
}

function get_password_header(): string {
  return (string) ($_SERVER['HTTP_X_ADMIN_PASSWORD'] ?? '');
}

function get_password_from_body(array $body): string {
  if (!empty($body['password'])) {
    return (string) $body['password'];
  }
  return '';
}

function json_out($payload, int $code = 200): void {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function db_or_fail(): PDO {
  try {
    return aurora_db();
  } catch (Throwable $e) {
    json_out([
      'error' => 'Falha na conexão MySQL',
      'detail' => $e->getMessage(),
      'hint' => 'Confira api/config.local.php (usuário/senha) e se importou api/pipocando_mysql.sql',
    ], 500);
  }
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET') {
  // Ping/catálogo público já saíram antes do require (bem leves).
  // Aqui: full=1 (admin) ou rebuild=1 (reescreve catalog.json).
  $pdo = db_or_fail();
  $password = get_password_header();
  $wantFull = isset($_GET['full']) || $action === 'full';

  try {
    $data = aurora_load_all($pdo, $wantFull ? 'full' : 'public');
  } catch (Throwable $e) {
    json_out(['error' => 'Falha ao ler MySQL', 'detail' => $e->getMessage()], 500);
  }

  if ($data === null) {
    json_out(['empty' => true, 'db' => 'mysql']);
  }

  if ($wantFull) {
    $auth = aurora_get_auth($pdo);
    $ok = $auth['password'] !== '' && hash_equals($auth['password'], (string) $password);
    if (!$ok) {
      json_out(['error' => 'Senha inválida'], 401);
    }
    header('Cache-Control: no-store');
    json_out($data);
  }

  // Atualiza catalog.json pra próximas visitas não baterem no MySQL
  try {
    aurora_write_public_catalog($pdo);
  } catch (Throwable $e) {
  }

  header('Cache-Control: no-store, max-age=0');
  json_out(public_payload($data));
}

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true);

  if (!is_array($body)) {
    json_out(['error' => 'JSON inválido'], 400);
  }

  $actionName = (string) ($body['action'] ?? '');

  // Login leve: auth primeiro (sem schema/ALTER), só então carrega o painel
  if ($actionName === 'login') {
    $email = trim((string) ($body['email'] ?? ''));
    $pass = (string) ($body['password'] ?? '');

    try {
      $pdoAuth = aurora_db(false);
      $auth = aurora_get_auth($pdoAuth);
    } catch (Throwable $e) {
      json_out([
        'error' => 'Falha na conexão MySQL',
        'detail' => $e->getMessage(),
      ], 500);
    }

    $authEmail = (string) ($auth['email'] ?? '');
    $authPass = (string) ($auth['password'] ?? '');

    if ($authEmail === '' || $authPass === '') {
      json_out([
        'error' => 'Banco sem dados. Importe api/pipocando_mysql.sql no phpMyAdmin.',
      ], 404);
    }

    if (!hash_equals($authEmail, $email) || !hash_equals($authPass, $pass)) {
      json_out(['error' => 'E-mail ou senha incorretos.'], 401);
    }

    try {
      $pdo = aurora_db(true);
      $stored = aurora_load_all($pdo, 'full');
    } catch (Throwable $e) {
      json_out(['error' => 'Falha ao ler MySQL', 'detail' => $e->getMessage()], 500);
    }

    if ($stored === null) {
      json_out([
        'error' => 'Banco sem dados. Importe api/pipocando_mysql.sql no phpMyAdmin.',
      ], 404);
    }

    // Republika o cardápio do MySQL → catalog.json (evita Git Reimplantar deixar o site velho)
    try {
      aurora_write_public_catalog($pdo);
    } catch (Throwable $e) {
      // login continua mesmo se o JSON estático falhar
    }

    json_out(['ok' => true, 'data' => $stored]);
  }

  // Pedido / fidelidade / ordem / settings / estoque — conexão leve (sem ALTER/schema pesado)
  if (
    $actionName === 'loyalty_status'
    || $actionName === 'create_order'
    || $actionName === 'order_status'
    || $actionName === 'save_catalog_order'
    || $actionName === 'save_settings'
    || $actionName === 'save_inventory_item'
    || $actionName === 'delete_inventory_item'
  ) {
    try {
      $pdo = aurora_db(false);
    } catch (Throwable $e) {
      json_out([
        'error' => 'Falha na conexão MySQL',
        'detail' => $e->getMessage(),
      ], 500);
    }
  } else {
    $pdo = db_or_fail();
  }
  $password = get_password_header() ?: get_password_from_body($body);

  // Pedido / fidelidade — sem carregar produtos/imagens
  if ($actionName === 'loyalty_status') {
    if (!aurora_db_ready($pdo)) {
      json_out(['error' => 'Sistema ainda não inicializado no MySQL.'], 503);
    }
    $phone = (string) ($body['phone'] ?? $body['whatsapp'] ?? '');
    try {
      json_out(['ok' => true, 'loyalty' => aurora_loyalty_stats_safe($pdo, $phone)]);
    } catch (Throwable $e) {
      json_out(['error' => 'Falha ao consultar fidelidade', 'detail' => $e->getMessage()], 500);
    }
  }

  if ($actionName === 'order_status') {
    if (!aurora_db_ready($pdo)) {
      json_out(['error' => 'Sistema ainda não inicializado no MySQL.'], 503);
    }
    $phone = (string) ($body['phone'] ?? $body['whatsapp'] ?? '');
    $orderNumber = (string) ($body['orderNumber'] ?? $body['number'] ?? '');
    try {
      $status = aurora_get_public_order_status($pdo, $phone, $orderNumber);
      if (!$status) {
        json_out(['ok' => false, 'error' => 'Pedido não encontrado para este WhatsApp.'], 404);
      }
      json_out(['ok' => true, 'order' => $status]);
    } catch (Throwable $e) {
      json_out(['error' => 'Falha ao consultar pedido', 'detail' => $e->getMessage()], 500);
    }
  }

  if ($actionName === 'create_order') {
    if (!aurora_db_ready($pdo)) {
      json_out(['error' => 'Sistema ainda não inicializado no MySQL.'], 503);
    }

    $order = $body['order'] ?? null;
    $client = $body['client'] ?? null;

    if (!is_array($order) || empty($order['clientName']) || empty($order['clientWhatsapp']) || empty($order['items'])) {
      json_out(['error' => 'Pedido incompleto'], 400);
    }

    try {
      $result = aurora_create_order($pdo, $order, is_array($client) ? $client : null);
      json_out($result);
    } catch (Throwable $e) {
      json_out(['error' => 'Falha ao gravar pedido', 'detail' => $e->getMessage()], 500);
    }
  }

  // Liga/desliga produto no cardápio (leve — só 1 UPDATE)
  if ($actionName === 'set_product_active') {
    $auth = aurora_get_auth($pdo);
    if ($password === '' || $auth['password'] === '' || !hash_equals($auth['password'], $password)) {
      json_out(['error' => 'Senha inválida'], 401);
    }
    $productId = trim((string) ($body['id'] ?? $body['productId'] ?? ''));
    if ($productId === '') {
      json_out(['error' => 'Produto inválido'], 400);
    }
    $active = !empty($body['active']) ? 1 : 0;
    try {
      $stmt = $pdo->prepare('UPDATE products SET active = ? WHERE id = ?');
      $stmt->execute([$active, $productId]);
      if ($stmt->rowCount() < 1) {
        // id pode existir mas valor igual — confere
        $check = $pdo->prepare('SELECT id FROM products WHERE id = ? LIMIT 1');
        $check->execute([$productId]);
        if (!$check->fetchColumn()) {
          json_out(['error' => 'Produto não encontrado'], 404);
        }
      }
      $wrote = false;
      try {
        $wrote = aurora_write_public_catalog($pdo);
      } catch (Throwable $e) {
        $wrote = false;
      }
      if (!$wrote) {
        json_out([
          'ok' => false,
          'error' => 'Salvou no banco, mas não atualizou catalog.json (permissão?).',
          'id' => $productId,
          'active' => $active === 1,
        ], 500);
      }
      json_out(['ok' => true, 'id' => $productId, 'active' => $active === 1, 'catalog' => true]);
    } catch (Throwable $e) {
      json_out(['error' => 'Falha ao atualizar produto', 'detail' => $e->getMessage()], 500);
    }
  }

  // Atualiza só a ordem do cardápio (leve — não regrava tudo)
  if ($actionName === 'save_catalog_order') {
    $auth = aurora_get_auth($pdo);
    if ($password === '' || $auth['password'] === '' || !hash_equals($auth['password'], $password)) {
      json_out(['error' => 'Senha inválida'], 401);
    }
    $categoryIds = $body['categoryIds'] ?? [];
    $productIds = $body['productIds'] ?? [];
    if (!is_array($categoryIds) || !is_array($productIds)) {
      json_out(['error' => 'Ordem inválida'], 400);
    }
    try {
      aurora_save_catalog_order($pdo, $categoryIds, $productIds);
      $catalog = aurora_patch_catalog_json_order($categoryIds, $productIds);
      json_out([
        'ok' => true,
        'catalog' => $catalog,
        'ts' => time(),
      ]);
    } catch (Throwable $e) {
      json_out(['error' => 'Falha ao salvar ordem', 'detail' => $e->getMessage()], 500);
    }
  }

  // Publica cardápio MySQL → catalog.json (site estático)
  if ($actionName === 'publish_catalog') {
    $auth = aurora_get_auth($pdo);
    if ($password === '' || $auth['password'] === '' || !hash_equals($auth['password'], $password)) {
      json_out(['error' => 'Senha inválida'], 401);
    }
    try {
      $wrote = aurora_write_public_catalog($pdo);
      if (!$wrote) {
        json_out(['ok' => false, 'error' => 'Não foi possível gravar catalog.json (permissão?).'], 500);
      }
      json_out(['ok' => true, 'catalog' => true, 'ts' => time()]);
    } catch (Throwable $e) {
      json_out(['error' => 'Falha ao publicar cardápio', 'detail' => $e->getMessage()], 500);
    }
  }

  // Extrai data-URLs restantes para arquivos (admin)
  if ($actionName === 'extract_data_images') {
    $auth = aurora_get_auth($pdo);
    if ($password === '' || $auth['password'] === '' || !hash_equals($auth['password'], $password)) {
      json_out(['error' => 'Senha inválida'], 401);
    }
    $limit = max(1, min(50, (int) ($body['limit'] ?? 20)));
    try {
      $stmt = $pdo->query(
        "SELECT id, image FROM products WHERE image LIKE 'data:image%' LIMIT " . $limit
      );
      $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
      $upd = $pdo->prepare('UPDATE products SET image = ? WHERE id = ?');
      $converted = 0;
      foreach ($rows as $row) {
        $path = aurora_save_data_url_file((string) ($row['image'] ?? ''));
        if ($path) {
          $upd->execute([$path, $row['id']]);
          $converted++;
        }
      }
      $left = (int) $pdo->query(
        "SELECT COUNT(*) FROM products WHERE image LIKE 'data:image%'"
      )->fetchColumn();
      try { aurora_write_public_catalog($pdo); } catch (Throwable $e) {}
      json_out(['ok' => true, 'converted' => $converted, 'remaining' => $left]);
    } catch (Throwable $e) {
      json_out(['error' => 'Falha ao extrair imagens', 'detail' => $e->getMessage()], 500);
    }
  }

  if ($actionName === 'migrate_product_images') {
    $auth = aurora_get_auth($pdo);
    if ($password === '' || $auth['password'] === '' || !hash_equals($auth['password'], $password)) {
      json_out(['error' => 'Senha inválida'], 401);
    }
    try {
      $pdo->exec('ALTER TABLE `products` MODIFY `image` MEDIUMTEXT NULL');
      $col = $pdo->query("SHOW COLUMNS FROM products LIKE 'image'")->fetch(PDO::FETCH_ASSOC);
      json_out([
        'ok' => true,
        'columnType' => $col['Type'] ?? null,
      ]);
    } catch (Throwable $e) {
      json_out(['error' => 'Falha no ALTER', 'detail' => $e->getMessage()], 500);
    }
  }

  // Salvamento completo (admin)
  if ($actionName !== '') {
    // Atualiza só configurações (leve — não regrava o banco inteiro)
    if ($actionName === 'save_settings') {
      $auth = aurora_get_auth($pdo);
      if ($password === '' || $auth['password'] === '' || !hash_equals($auth['password'], $password)) {
        json_out(['error' => 'Senha inválida'], 401);
      }
      $settings = $body['settings'] ?? null;
      if (!is_array($settings)) {
        json_out(['error' => 'Configurações inválidas'], 400);
      }
      try {
        aurora_save_settings_only($pdo, $settings);
        $catalog = false;
        try {
          $catalog = aurora_write_public_catalog($pdo);
        } catch (Throwable $e) {
          $catalog = false;
        }
        json_out(['ok' => true, 'catalog' => (bool) $catalog, 'ts' => time()]);
      } catch (Throwable $e) {
        json_out(['error' => 'Falha ao salvar configurações', 'detail' => $e->getMessage()], 500);
      }
    }

    if ($actionName === 'save_inventory_item') {
      $auth = aurora_get_auth($pdo);
      if ($password === '' || $auth['password'] === '' || !hash_equals($auth['password'], $password)) {
        json_out(['error' => 'Senha inválida'], 401);
      }
      $item = $body['item'] ?? null;
      if (!is_array($item)) {
        json_out(['error' => 'Item inválido'], 400);
      }
      try {
        $saved = aurora_save_one_inventory_item($pdo, $item);
        json_out(['ok' => true, 'item' => $saved, 'ts' => time()]);
      } catch (InvalidArgumentException $e) {
        json_out(['error' => $e->getMessage()], 400);
      } catch (Throwable $e) {
        json_out(['error' => 'Falha ao salvar item', 'detail' => $e->getMessage()], 500);
      }
    }

    if ($actionName === 'delete_inventory_item') {
      $auth = aurora_get_auth($pdo);
      if ($password === '' || $auth['password'] === '' || !hash_equals($auth['password'], $password)) {
        json_out(['error' => 'Senha inválida'], 401);
      }
      $itemId = trim((string) ($body['id'] ?? $body['itemId'] ?? ''));
      if ($itemId === '') {
        json_out(['error' => 'Item inválido'], 400);
      }
      try {
        aurora_delete_one_inventory_item($pdo, $itemId);
        json_out(['ok' => true, 'id' => $itemId, 'ts' => time()]);
      } catch (Throwable $e) {
        json_out(['error' => 'Falha ao excluir item', 'detail' => $e->getMessage()], 500);
      }
    }

    json_out(['error' => 'Ação não reconhecida'], 400);
  }

  $payload = $body['data'] ?? $body;
  if (!is_array($payload) || !isset($payload['settings'])) {
    json_out(['error' => 'Dados incompletos'], 400);
  }

  $auth = aurora_get_auth($pdo);
  $authPass = (string) ($auth['password'] ?? '');
  $hasData = aurora_db_ready($pdo) && $authPass !== '';

  if (!$hasData) {
    if ($password === '' && !empty($payload['auth']['password'])) {
      $password = (string) $payload['auth']['password'];
    }
    if ($password === '') {
      json_out(['error' => 'Informe a senha do admin para criar os dados'], 401);
    }
    if (empty($payload['auth']['password'])) {
      $payload['auth'] = [
        'email' => $payload['auth']['email'] ?? 'admin@pipocandovv.com.br',
        'password' => $password,
      ];
    }
  } else {
    if ($password === '' || !hash_equals($authPass, $password)) {
      json_out(['error' => 'Senha inválida para salvar'], 401);
    }
    if (empty($payload['auth'])) {
      $payload['auth'] = [
        'email' => $auth['email'] ?? '',
        'password' => $authPass,
      ];
    }
  }

  // Antes de salvar: se vier data-URL, tenta virar arquivo
  if (!empty($payload['products']) && is_array($payload['products'])) {
    foreach ($payload['products'] as &$prod) {
      $img = (string) ($prod['image'] ?? '');
      if (str_starts_with($img, 'data:image')) {
        $path = aurora_save_data_url_file($img);
        if ($path) $prod['image'] = $path;
      }
    }
    unset($prod);
  }

  try {
    aurora_save_all($pdo, $payload);
    json_out(['ok' => true]);
  } catch (Throwable $e) {
    json_out(['error' => 'Falha ao salvar', 'detail' => $e->getMessage()], 500);
  }
}

json_out(['error' => 'Método não suportado'], 405);
