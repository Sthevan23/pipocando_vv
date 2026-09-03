<?php
/**
 * Persistência MySQL — Pipocando VV (Hostinger)
 */

require_once __DIR__ . '/db.php';

function pipocando_brand_keys(): array {
  return [
    'brandName', 'brandAccent', 'brandSub', 'slogan', 'heroLine1', 'heroLine2Prefix',
    'heroWords', 'heroCategories', 'placeShort', 'siteUrl', 'adminUrl', 'whatsappOrderMsg', 'whatsappFloatMsg',
    'pixKey', 'pixName', 'pixBank',
  ];
}

function pipocando_merge_brand_into_settings(array &$settings): void {
  $hero = $settings['heroStory'] ?? [];
  if (!is_array($hero)) {
    $hero = [];
  }
  foreach (pipocando_brand_keys() as $key) {
    if (array_key_exists($key, $hero) && $hero[$key] !== '' && $hero[$key] !== []) {
      $settings[$key] = $hero[$key];
    }
  }
}

function pipocando_pack_hero_story(array $settings): string {
  $hero = is_array($settings['heroStory'] ?? null) ? $settings['heroStory'] : [];
  foreach (pipocando_brand_keys() as $key) {
    if (array_key_exists($key, $settings)) {
      $hero[$key] = $settings[$key];
    }
  }
  return json_encode($hero, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function aurora_bool($v): int {
  return !empty($v) ? 1 : 0;
}

function aurora_json_decode_field($v, $fallback = null) {
  if ($v === null || $v === '') return $fallback;
  if (is_array($v)) return $v;
  $decoded = json_decode((string) $v, true);
  return is_array($decoded) ? $decoded : $fallback;
}

function aurora_table_exists(PDO $pdo, string $table): bool {
  $stmt = $pdo->prepare(
    'SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1'
  );
  $stmt->execute([$table]);
  return (bool) $stmt->fetchColumn();
}

function aurora_db_ready(PDO $pdo): bool {
  return aurora_table_exists($pdo, 'settings') && aurora_table_exists($pdo, 'products');
}

function aurora_norm_name(string $name): string {
  $n = trim($name);
  if (function_exists('mb_strtolower')) {
    $n = mb_strtolower($n, 'UTF-8');
  } else {
    $n = strtolower($n);
  }
  return $n;
}

function aurora_photo_map(): array {
  static $map = null;
  if (is_array($map)) return $map;
  $map = ['id' => [], 'name' => []];
  $root = dirname(__DIR__);
  foreach (['product-photos.json', 'catalog.json'] as $file) {
    $path = $root . DIRECTORY_SEPARATOR . $file;
    if (!is_file($path)) continue;
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') continue;
    $data = json_decode($raw, true);
    if (!is_array($data)) continue;
    if (isset($data['byId']) || isset($data['byName'])) {
      foreach (($data['byId'] ?? []) as $id => $img) {
        $img = trim((string) $img);
        if ($id && $img !== '' && !str_starts_with($img, 'data:')) {
          $map['id'][(string) $id] = $img;
        }
      }
      foreach (($data['byName'] ?? []) as $name => $img) {
        $img = trim((string) $img);
        $key = aurora_norm_name((string) $name);
        if ($key !== '' && $img !== '' && !str_starts_with($img, 'data:')) {
          $map['name'][$key] = $img;
        }
      }
      continue;
    }
    foreach (($data['products'] ?? []) as $p) {
      if (!is_array($p)) continue;
      $img = trim((string) ($p['image'] ?? ''));
      if ($img === '' || str_starts_with($img, 'data:')) continue;
      if (!empty($p['id'])) $map['id'][(string) $p['id']] = $img;
      $key = aurora_norm_name((string) ($p['name'] ?? ''));
      if ($key !== '') $map['name'][$key] = $img;
    }
  }
  return $map;
}

function aurora_product_image_on_disk(string $img): bool {
  if ($img === '' || str_starts_with($img, 'data:') || str_starts_with($img, 'http')) {
    return false;
  }
  $name = basename(str_replace('\\', '/', $img));
  if ($name === '' || $name === '.' || $name === '..') return false;
  $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'products' . DIRECTORY_SEPARATOR . $name;
  return is_file($path);
}

function aurora_lookup_photo(string $id, string $name): string {
  $map = aurora_photo_map();
  if ($id !== '' && !empty($map['id'][$id])) return (string) $map['id'][$id];
  $key = aurora_norm_name($name);
  if ($key !== '' && !empty($map['name'][$key])) return (string) $map['name'][$key];
  return '';
}

/**
 * Se a foto do MySQL sumiu (Reimplantar) ou veio vazia, usa o mapa/catalogo.
 * Grava o path de volta só quando mudou — senão o painel volta a "Sem foto".
 */
function aurora_fill_missing_product_images(PDO $pdo, array &$products): void {
  $blobNames = [];
  try {
    if (aurora_table_exists($pdo, 'product_images')) {
      foreach ($pdo->query('SELECT filename FROM product_images') as $row) {
        $fn = basename((string) ($row['filename'] ?? ''));
        if ($fn !== '') $blobNames[$fn] = true;
      }
    }
  } catch (Throwable $e) {
    $blobNames = [];
  }

  $updates = [];
  foreach ($products as &$p) {
    $img = trim((string) ($p['image'] ?? ''));
    $file = $img !== '' ? basename(str_replace('\\', '/', $img)) : '';
    $ok = aurora_product_image_on_disk($img) || ($file !== '' && isset($blobNames[$file]));
    if ($ok) continue;

    $fallback = aurora_lookup_photo((string) ($p['id'] ?? ''), (string) ($p['name'] ?? ''));
    if ($fallback === '') {
      if (str_starts_with($img, 'data:')) $p['image'] = '';
      continue;
    }
    if ($fallback === $img) continue;
    $p['image'] = $fallback;
    if (!empty($p['id'])) $updates[(string) $p['id']] = $fallback;
  }
  unset($p);

  if (!$updates) return;
  try {
    $stmt = $pdo->prepare('UPDATE products SET image = ? WHERE id = ?');
    foreach ($updates as $id => $path) {
      $stmt->execute([$path, $id]);
    }
  } catch (Throwable $e) {
    // painel ainda recebe o path preenchido nesta resposta
  }
}

/**
 * @param 'full'|'public' $mode
 */
function aurora_load_all(PDO $pdo, string $mode = 'full'): ?array {
  if (!aurora_db_ready($pdo)) {
    return null;
  }

  if (function_exists('aurora_protect_product_photos')) {
    aurora_protect_product_photos($pdo);
  }

  $settingsRow = $pdo->query('SELECT * FROM settings WHERE id = 1 LIMIT 1')->fetch();
  if (!$settingsRow) {
    return null;
  }

  $categories = [];
  $catRows = $pdo->query('SELECT id, name, slug FROM categories ORDER BY sort_order ASC, name ASC')->fetchAll();
  foreach ($catRows as $row) {
    $categories[] = [
      'id' => $row['id'],
      'name' => $row['name'],
      'slug' => $row['slug'],
      'sortOrder' => (int) ($row['sort_order'] ?? 0),
    ];
  }

  $flavorMap = [];
  $flavorRows = $pdo->query(
    'SELECT product_id, flavor FROM product_flavors ORDER BY sort_order ASC, id ASC'
  )->fetchAll();
  foreach ($flavorRows as $row) {
    $pid = $row['product_id'];
    if (!isset($flavorMap[$pid])) $flavorMap[$pid] = [];
    $flavorMap[$pid][] = $row['flavor'];
  }

  $priceMap = [];
  $priceRows = $pdo->query(
    'SELECT product_id, flavor, price FROM product_flavor_prices ORDER BY id ASC'
  )->fetchAll();
  foreach ($priceRows as $row) {
    $pid = $row['product_id'];
    if (!isset($priceMap[$pid])) $priceMap[$pid] = [];
    $priceMap[$pid][$row['flavor']] = (float) $row['price'];
  }

  // Conversão de data-URL só sob demanda no save — nunca no login/load
  // (escrever arquivos no login estourava processos na Hostinger)

  $products = [];
  $prodRows = $pdo->query('SELECT * FROM products ORDER BY sort_order ASC, name ASC')->fetchAll();
  foreach ($prodRows as $row) {
    $pid = $row['id'];
    $product = [
      'id' => $pid,
      'name' => $row['name'],
      'description' => $row['description'] ?? '',
      'price' => (float) $row['price'],
      'categoryId' => $row['category_id'],
      'image' => $row['image'] ?? '',
      'featured' => ((int) ($row['featured'] ?? 0)) === 1,
      'slug' => $row['slug'],
      'size' => $row['size'] ?? '',
      'flavors' => $flavorMap[$pid] ?? [],
      'promoActive' => ((int) ($row['promo_active'] ?? 0)) === 1,
      'promoPrice' => $row['promo_price'] !== null ? (float) $row['promo_price'] : null,
      'promoLabel' => $row['promo_label'] ?? '',
      'bestSeller' => ((int) ($row['best_seller'] ?? 0)) === 1,
      'active' => ((int) ($row['active'] ?? 1)) === 1,
      'sortOrder' => (int) ($row['sort_order'] ?? 0),
      'available' => array_key_exists('available', $row)
        ? (((int) ($row['available'] ?? 1)) === 1)
        : true,
    ];
    if (array_key_exists('stock', $row) && $row['stock'] !== null && $row['stock'] !== '') {
      $product['stock'] = max(0, (int) $row['stock']);
    }
    if (((int) ($row['price_from'] ?? 0)) === 1) {
      $product['priceFrom'] = true;
    }
    if (!empty($priceMap[$pid])) {
      $product['flavorPrices'] = $priceMap[$pid];
    }
    $products[] = $product;
  }

  aurora_fill_missing_product_images($pdo, $products);

  $gallery = [];
  $galRows = $pdo->query(
    'SELECT image FROM gallery WHERE active = 1 ORDER BY sort_order ASC, id ASC'
  )->fetchAll();
  foreach ($galRows as $row) {
    $gallery[] = $row['image'];
  }

  $coupons = [];
  if (aurora_table_exists($pdo, 'coupons')) {
    $couponRows = $pdo->query('SELECT * FROM coupons ORDER BY created_at DESC')->fetchAll();
    foreach ($couponRows as $row) {
      $coupons[] = [
        'id' => $row['id'],
        'code' => strtoupper(trim((string) ($row['code'] ?? ''))),
        'type' => ($row['type'] ?? '') === 'fixed' ? 'fixed' : 'percent',
        'value' => (float) ($row['value'] ?? 0),
        'minOrder' => (float) ($row['min_order'] ?? 0),
        'active' => ((int) ($row['active'] ?? 1)) === 1,
        'label' => $row['label'] ?? '',
      ];
    }
  }

  $reviews = [];
  if (aurora_table_exists($pdo, 'reviews')) {
    $revRows = $pdo->query('SELECT * FROM reviews WHERE active = 1 ORDER BY created_at DESC')->fetchAll();
    foreach ($revRows as $row) {
      $reviews[] = [
        'id' => $row['id'],
        'author' => $row['author'],
        'text' => $row['text'],
        'rating' => (int) ($row['rating'] ?? 5),
      ];
    }
  }

  $faq = [];
  if (aurora_table_exists($pdo, 'faq')) {
    $faqRows = $pdo->query('SELECT * FROM faq WHERE active = 1 ORDER BY sort_order ASC')->fetchAll();
    foreach ($faqRows as $row) {
      $faq[] = [
        'id' => $row['id'],
        'question' => $row['question'],
        'answer' => $row['answer'],
      ];
    }
  }

  $settings = [
    'name' => $settingsRow['name'] ?? '',
    'tagline' => $settingsRow['tagline'] ?? '',
    'logo' => $settingsRow['logo'] ?? '',
    'banner' => $settingsRow['banner'] ?? '',
    'sobreImage' => $settingsRow['sobre_image'] ?? '',
    'whatsapp' => $settingsRow['whatsapp'] ?? '',
    'instagram' => $settingsRow['instagram'] ?? '',
    'instagramUser' => $settingsRow['instagram_user'] ?? '',
    'facebook' => $settingsRow['facebook'] ?? '',
    'email' => $settingsRow['email'] ?? '',
    'address' => $settingsRow['address'] ?? '',
    'hours' => $settingsRow['hours'] ?? '',
    'followers' => $settingsRow['followers'] ?? '',
    'posts' => $settingsRow['posts'] ?? '',
    'mapEmbed' => $settingsRow['map_embed'] ?? '',
    'heroBadge' => $settingsRow['hero_badge'] ?? '',
    'heroStory' => aurora_json_decode_field($settingsRow['hero_story'] ?? null, []),
    'sobreText1' => $settingsRow['sobre_text1'] ?? '',
    'sobreText2' => $settingsRow['sobre_text2'] ?? '',
    'deliveryFee' => isset($settingsRow['delivery_fee']) ? (float) $settingsRow['delivery_fee'] : 5,
    'deliveryNote' => $settingsRow['delivery_note'] ?? 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5',
    'storeStatus' => (string) ($settingsRow['store_status'] ?? 'auto'),
    'openTime' => (string) ($settingsRow['open_time'] ?? '19:30'),
    'closeTime' => (string) ($settingsRow['close_time'] ?? '22:00'),
    'openDays' => aurora_parse_open_days($settingsRow['open_days'] ?? '0,3,4,5,6'),
    'storeSchedule' => aurora_parse_store_schedule($settingsRow['store_schedule'] ?? null),
  ];
  pipocando_merge_brand_into_settings($settings);

  if ($mode === 'public') {
    return [
      'version' => (int) ($settingsRow['data_version'] ?? 16),
      'settings' => $settings,
      'categories' => $categories,
      'products' => $products,
      'reviews' => $reviews,
      'faq' => $faq,
      'gallery' => $gallery,
      'coupons' => $coupons,
      'clients' => [],
      'orders' => [],
      'finance' => [],
      'auth' => ['email' => '', 'password' => ''],
    ];
  }

  $admin = $pdo->query('SELECT email, password_hash FROM admins ORDER BY id ASC LIMIT 1')->fetch();

  $clients = [];
  if (aurora_table_exists($pdo, 'clients')) {
    $clientRows = $pdo->query('SELECT * FROM clients ORDER BY created_at DESC')->fetchAll();
    foreach ($clientRows as $row) {
      $clients[] = [
        'id' => $row['id'],
        'name' => $row['name'],
        'email' => $row['email'] ?? '',
        'phone' => $row['phone'] ?? '',
        'address' => $row['address'] ?? '',
        'loyaltyBonus' => (int) ($row['loyalty_bonus'] ?? 0),
      ];
    }
  }

  $productImageById = [];
  $productImageByName = [];
  foreach ($products as $p) {
    $pid = (string) ($p['id'] ?? '');
    $img = (string) ($p['image'] ?? '');
    if ($pid !== '' && $img !== '') $productImageById[$pid] = $img;
    $pname = function_exists('mb_strtolower')
      ? mb_strtolower(trim((string) ($p['name'] ?? '')), 'UTF-8')
      : strtolower(trim((string) ($p['name'] ?? '')));
    if ($pname !== '' && $img !== '') $productImageByName[$pname] = $img;
  }

  $orders = [];
  if (aurora_table_exists($pdo, 'orders')) {
    $orderRows = $pdo->query('SELECT * FROM orders ORDER BY ordered_at DESC')->fetchAll();
    $itemsByOrder = [];
    if (aurora_table_exists($pdo, 'order_items')) {
      $itemRows = $pdo->query('SELECT * FROM order_items ORDER BY id ASC')->fetchAll();
      foreach ($itemRows as $item) {
        $oid = $item['order_id'];
        if (!isset($itemsByOrder[$oid])) $itemsByOrder[$oid] = [];
        $pid = (string) ($item['product_id'] ?? '');
        $iname = (string) ($item['product_name'] ?? '');
        $inameNorm = function_exists('mb_strtolower')
          ? mb_strtolower(trim($iname), 'UTF-8')
          : strtolower(trim($iname));
        $image = $productImageById[$pid]
          ?? $productImageByName[$inameNorm]
          ?? '';
        $itemsByOrder[$oid][] = [
          'productId' => $pid,
          'name' => $iname,
          'flavor' => $item['flavor'] ?? '',
          'qty' => (int) $item['qty'],
          'price' => (float) $item['price'],
          'image' => $image,
        ];
      }
    }
    foreach ($orderRows as $row) {
      $orders[] = [
        'id' => $row['id'],
        'number' => $row['number'],
        'clientId' => $row['client_id'] ?? '',
        'clientName' => $row['client_name'],
        'clientWhatsapp' => $row['client_whatsapp'] ?? '',
        'items' => $itemsByOrder[$row['id']] ?? [],
        'total' => (float) $row['total'],
        'status' => $row['status'],
        'date' => date('c', strtotime($row['ordered_at'])),
        'notes' => $row['notes'] ?? '',
        'deliveryFee' => (float) ($row['delivery_fee'] ?? 0),
        'discount' => (float) ($row['discount'] ?? 0),
        'waiveDelivery' => !empty($row['waive_delivery']),
      ];
    }
  }

  $finance = [];
  if (aurora_table_exists($pdo, 'finance')) {
    $finRows = $pdo->query('SELECT * FROM finance ORDER BY entry_date DESC, created_at DESC')->fetchAll();
    foreach ($finRows as $row) {
      $finance[] = [
        'id' => $row['id'],
        'type' => $row['type'],
        'amount' => (float) $row['amount'],
        'description' => $row['description'] ?? '',
        'date' => $row['entry_date'],
        'orderId' => $row['order_id'] ?? '',
      ];
    }
  }

  $inventoryItems = aurora_load_inventory_items($pdo);

  return [
    'version' => (int) ($settingsRow['data_version'] ?? 16),
    'settings' => $settings,
    'auth' => [
      'email' => $admin['email'] ?? 'admin@pipocandovv.com.br',
      'password' => $admin['password_hash'] ?? '',
    ],
    'categories' => $categories,
    'products' => $products,
    'clients' => $clients,
    'orders' => $orders,
    'reviews' => $reviews,
    'faq' => $faq,
    'gallery' => $gallery,
    'finance' => $finance,
    'coupons' => $coupons,
    'inventoryItems' => $inventoryItems,
  ];
}

/**
 * Grava data-URL em products/ e devolve path relativo, ou null.
 */
function aurora_save_data_url_file(string $dataUrl): ?string {
  if (!preg_match('#^data:image/(jpeg|jpg|png|webp|gif);base64,#i', $dataUrl, $m)) {
    return null;
  }
  $raw = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true);
  if ($raw === false || strlen($raw) < 32) return null;

  $siteRoot = dirname(__DIR__);
  $dir = $siteRoot . DIRECTORY_SEPARATOR . 'products';
  if (!is_dir($dir)) {
    @mkdir($dir, 0755, true);
  }
  if (!is_dir($dir) || !is_writable($dir)) return null;

  $name = sprintf(
    '%s-%s-%s-%s-%s.jpg',
    bin2hex(random_bytes(4)),
    bin2hex(random_bytes(2)),
    bin2hex(random_bytes(2)),
    bin2hex(random_bytes(2)),
    bin2hex(random_bytes(6))
  );
  $dest = $dir . DIRECTORY_SEPARATOR . $name;

  // Preferir JPG via GD quando possível
  $tmp = tempnam(sys_get_temp_dir(), 'aurora_durl_');
  if ($tmp === false) return null;
  file_put_contents($tmp, $raw);
  $mime = 'image/' . strtolower($m[1] === 'jpg' ? 'jpeg' : $m[1]);
  if ($mime === 'image/jpg') $mime = 'image/jpeg';

  $wrote = false;
  if (function_exists('imagecreatetruecolor')) {
    // reusa lógica simples: grava bytes crus se jpeg, senão tenta GD
    if ($mime === 'image/jpeg') {
      $wrote = @file_put_contents($dest, $raw) !== false;
    } else {
      $img = null;
      if ($mime === 'image/png' && function_exists('imagecreatefrompng')) $img = @imagecreatefrompng($tmp);
      elseif ($mime === 'image/webp' && function_exists('imagecreatefromwebp')) $img = @imagecreatefromwebp($tmp);
      elseif ($mime === 'image/gif' && function_exists('imagecreatefromgif')) $img = @imagecreatefromgif($tmp);
      if ($img) {
        $wrote = @imagejpeg($img, $dest, 82);
        imagedestroy($img);
      }
    }
  }
  if (!$wrote) {
    $wrote = @file_put_contents($dest, $raw) !== false;
  }
  @unlink($tmp);
  if (!$wrote || !is_file($dest)) return null;
  @chmod($dest, 0644);
  $bytes = @file_get_contents($dest);
  if ($bytes !== false && function_exists('aurora_store_product_image_blob')) {
    try {
      // Precisa de PDO — tenta via conexão global leve
      $pdo = aurora_db(false);
      aurora_store_product_image_blob($pdo, $name, $bytes, 'image/jpeg');
    } catch (Throwable $e) {
      // path em disco ainda vale
    }
  }
  return 'products/' . $name;
}

function aurora_maybe_extract_data_images(PDO $pdo, int $limit = 3): void {
  static $ran = false;
  if ($ran) return;
  $ran = true;
  try {
    $stmt = $pdo->query(
      "SELECT id, image FROM products
       WHERE image LIKE 'data:image%'
       LIMIT " . max(1, min(10, $limit))
    );
    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
    $upd = $pdo->prepare('UPDATE products SET image = ? WHERE id = ?');
    foreach ($rows as $row) {
      $path = aurora_save_data_url_file((string) ($row['image'] ?? ''));
      if ($path) $upd->execute([$path, $row['id']]);
    }
  } catch (Throwable $e) {
    // silencioso — não derruba o site
  }
}

function aurora_get_auth(PDO $pdo): array {
  $admin = $pdo->query('SELECT email, password_hash FROM admins ORDER BY id ASC LIMIT 1')->fetch();
  if (!$admin) {
    return ['email' => '', 'password' => ''];
  }
  return [
    'email' => (string) $admin['email'],
    'password' => (string) $admin['password_hash'],
  ];
}

function aurora_ensure_sort_order_columns(PDO $pdo): void {
  if (function_exists('aurora_ensure_column')) {
    aurora_ensure_column($pdo, 'categories', 'sort_order', 'INT NOT NULL DEFAULT 0');
    aurora_ensure_column($pdo, 'products', 'sort_order', 'INT NOT NULL DEFAULT 0');
    return;
  }
  foreach (['categories', 'products'] as $table) {
    try {
      $col = $pdo->query("SHOW COLUMNS FROM `$table` LIKE 'sort_order'")->fetch();
      if (!$col) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0");
      }
    } catch (Throwable $e) {
      // ignore — falha explícita virá no UPDATE/INSERT
    }
  }
}

/**
 * Atualiza só a ordem no catalog.json existente (rápido — não recarrega MySQL).
 */
function aurora_patch_catalog_json_order(array $categoryIds, array $productIds): bool {
  $root = dirname(__DIR__);
  $paths = [
    $root . DIRECTORY_SEPARATOR . 'catalog.json',
    $root . DIRECTORY_SEPARATOR . 'catalog.live.json',
    $root . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'catalog.json',
  ];

  $source = null;
  foreach ($paths as $path) {
    if (!is_file($path)) continue;
    $raw = @file_get_contents($path);
    if (!is_string($raw) || $raw === '') continue;
    $data = json_decode($raw, true);
    if (!is_array($data) || !isset($data['products'])) continue;
    $source = $data;
    break;
  }
  if (!$source) return false;

  $catMap = [];
  foreach (array_values($categoryIds) as $i => $id) {
    $id = trim((string) $id);
    if ($id !== '') $catMap[$id] = (int) $i;
  }
  $prodMap = [];
  foreach (array_values($productIds) as $i => $id) {
    $id = trim((string) $id);
    if ($id !== '') $prodMap[$id] = (int) $i;
  }

  if (!empty($source['categories']) && is_array($source['categories'])) {
    foreach ($source['categories'] as &$cat) {
      if (!is_array($cat)) continue;
      $cid = (string) ($cat['id'] ?? '');
      if ($cid !== '' && isset($catMap[$cid])) {
        $cat['sortOrder'] = $catMap[$cid];
      }
    }
    unset($cat);
    usort($source['categories'], static function ($a, $b) {
      $diff = ((int) ($a['sortOrder'] ?? 0)) - ((int) ($b['sortOrder'] ?? 0));
      if ($diff !== 0) return $diff;
      return strcmp((string) ($a['name'] ?? ''), (string) ($b['name'] ?? ''));
    });
  }

  if (!empty($source['products']) && is_array($source['products'])) {
    foreach ($source['products'] as &$prod) {
      if (!is_array($prod)) continue;
      $pid = (string) ($prod['id'] ?? '');
      if ($pid !== '' && isset($prodMap[$pid])) {
        $prod['sortOrder'] = $prodMap[$pid];
      }
    }
    unset($prod);
    usort($source['products'], static function ($a, $b) {
      $diff = ((int) ($a['sortOrder'] ?? 0)) - ((int) ($b['sortOrder'] ?? 0));
      if ($diff !== 0) return $diff;
      return strcmp((string) ($a['name'] ?? ''), (string) ($b['name'] ?? ''));
    });
  }

  $source['generatedAt'] = gmdate('c');
  $json = json_encode($source, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false) return false;

  $ok = false;
  foreach ($paths as $path) {
    if (@file_put_contents($path, $json) !== false) {
      $ok = true;
    }
  }
  return $ok;
}

function aurora_save_catalog_order(PDO $pdo, array $categoryIds, array $productIds): void {
  if (!aurora_db_ready($pdo)) {
    throw new RuntimeException('Tabelas MySQL não encontradas. Importe api/pipocando_mysql.sql no phpMyAdmin.');
  }

  aurora_ensure_sort_order_columns($pdo);

  $pdo->beginTransaction();
  try {
    $catStmt = $pdo->prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
    foreach (array_values($categoryIds) as $i => $id) {
      $id = trim((string) $id);
      if ($id === '') continue;
      $catStmt->execute([(int) $i, $id]);
    }

    $prodStmt = $pdo->prepare('UPDATE products SET sort_order = ? WHERE id = ?');
    foreach (array_values($productIds) as $i => $id) {
      $id = trim((string) $id);
      if ($id === '') continue;
      $prodStmt->execute([(int) $i, $id]);
    }

    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    throw $e;
  }
}

function aurora_save_all(PDO $pdo, array $payload): void {
  if (!aurora_db_ready($pdo)) {
    throw new RuntimeException('Tabelas MySQL não encontradas. Importe api/pipocando_mysql.sql no phpMyAdmin.');
  }

  aurora_ensure_sort_order_columns($pdo);

  $pdo->beginTransaction();
  try {
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $s = $payload['settings'] ?? [];
    $version = (int) ($payload['version'] ?? 16);
    $heroStory = pipocando_pack_hero_story($s);

    $stmt = $pdo->prepare(
      'INSERT INTO settings (
        id, name, tagline, logo, banner, sobre_image, whatsapp, instagram, instagram_user,
        facebook, email, address, hours, followers, posts, map_embed, hero_badge, hero_story,
        sobre_text1, sobre_text2, delivery_fee, delivery_note, store_status, open_time, close_time, open_days, data_version
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), tagline=VALUES(tagline), logo=VALUES(logo), banner=VALUES(banner),
        sobre_image=VALUES(sobre_image), whatsapp=VALUES(whatsapp), instagram=VALUES(instagram),
        instagram_user=VALUES(instagram_user), facebook=VALUES(facebook), email=VALUES(email),
        address=VALUES(address), hours=VALUES(hours), followers=VALUES(followers), posts=VALUES(posts),
        map_embed=VALUES(map_embed), hero_badge=VALUES(hero_badge), hero_story=VALUES(hero_story),
        sobre_text1=VALUES(sobre_text1), sobre_text2=VALUES(sobre_text2),
        delivery_fee=VALUES(delivery_fee), delivery_note=VALUES(delivery_note),
        store_status=VALUES(store_status), open_time=VALUES(open_time), close_time=VALUES(close_time),
        open_days=VALUES(open_days), data_version=VALUES(data_version)'
    );
    aurora_ensure_store_settings_columns($pdo);
    $deliveryFee = isset($s['deliveryFee']) ? (float) $s['deliveryFee'] : 5;
    if ($deliveryFee < 0) {
      $deliveryFee = 0;
    }
    $deliveryNote = trim((string) ($s['deliveryNote'] ?? 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5'));
    if ($deliveryNote === '') {
      $deliveryNote = 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5';
    }
    $stmt->execute([
      $s['name'] ?? '',
      $s['tagline'] ?? '',
      $s['logo'] ?? '',
      $s['banner'] ?? '',
      $s['sobreImage'] ?? '',
      $s['whatsapp'] ?? '',
      $s['instagram'] ?? '',
      $s['instagramUser'] ?? '',
      $s['facebook'] ?? '',
      $s['email'] ?? '',
      $s['address'] ?? '',
      $s['hours'] ?? '',
      $s['followers'] ?? '',
      $s['posts'] ?? '',
      $s['mapEmbed'] ?? '',
      $s['heroBadge'] ?? '',
      $heroStory,
      $s['sobreText1'] ?? '',
      $s['sobreText2'] ?? '',
      $deliveryFee,
      $deliveryNote,
      in_array(($s['storeStatus'] ?? 'auto'), ['auto', 'open', 'closed'], true) ? ($s['storeStatus'] ?? 'auto') : 'auto',
      preg_match('/^\d{1,2}:\d{2}$/', (string) ($s['openTime'] ?? '')) ? $s['openTime'] : '19:30',
      preg_match('/^\d{1,2}:\d{2}$/', (string) ($s['closeTime'] ?? '')) ? $s['closeTime'] : '22:00',
      aurora_format_open_days($s['openDays'] ?? [0, 3, 4, 5, 6]),
      $version,
    ]);

    try {
      $pdo->prepare('UPDATE settings SET store_schedule = ? WHERE id = 1')->execute([
        aurora_format_store_schedule($s['storeSchedule'] ?? null),
      ]);
    } catch (Throwable $e) {
      // coluna pode ainda não existir em bancos antigos — ensure cria no próximo boot
    }

    $auth = $payload['auth'] ?? [];
    if (!empty($auth['email']) && isset($auth['password']) && $auth['password'] !== '') {
      $existing = $pdo->query('SELECT id FROM admins ORDER BY id ASC LIMIT 1')->fetch();
      if ($existing) {
        $upd = $pdo->prepare('UPDATE admins SET email = ?, password_hash = ? WHERE id = ?');
        $upd->execute([$auth['email'], $auth['password'], $existing['id']]);
      } else {
        $ins = $pdo->prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)');
        $ins->execute([$auth['email'], $auth['password']]);
      }
    }

    $pdo->exec('DELETE FROM product_flavor_prices');
    $pdo->exec('DELETE FROM product_flavors');
    $pdo->exec('DELETE FROM products');
    $pdo->exec('DELETE FROM categories');
    $pdo->exec('DELETE FROM gallery');

    $catStmt = $pdo->prepare(
      'INSERT INTO categories (id, name, slug, sort_order) VALUES (?, ?, ?, ?)'
    );
    foreach (array_values($payload['categories'] ?? []) as $i => $cat) {
      $catStmt->execute([
        $cat['id'] ?? ('cat-' . $i),
        $cat['name'] ?? '',
        $cat['slug'] ?? ('cat-' . $i),
        (int) ($cat['sortOrder'] ?? $i),
      ]);
    }

    $hasAvailable = false;
    $hasStock = false;
    try {
      $hasAvailable = (bool) $pdo->query("SHOW COLUMNS FROM products LIKE 'available'")->fetch();
      $hasStock = (bool) $pdo->query("SHOW COLUMNS FROM products LIKE 'stock'")->fetch();
    } catch (Throwable $e) {
      $hasAvailable = false;
      $hasStock = false;
    }

    $prodColumns = 'id, name, description, price, price_from, category_id, image, featured, slug, size,
            promo_active, promo_price, promo_label, best_seller, active';
    $prodPlaceholders = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
    if ($hasAvailable) {
      $prodColumns .= ', available';
      $prodPlaceholders .= ', ?';
    }
    if ($hasStock) {
      $prodColumns .= ', stock';
      $prodPlaceholders .= ', ?';
    }
    $prodColumns .= ', sort_order';
    $prodPlaceholders .= ', ?';

    $prodStmt = $pdo->prepare(
      "INSERT INTO products ($prodColumns) VALUES ($prodPlaceholders)"
    );
    $flavorStmt = $pdo->prepare(
      'INSERT INTO product_flavors (product_id, flavor, sort_order) VALUES (?, ?, ?)'
    );
    $fpStmt = $pdo->prepare(
      'INSERT INTO product_flavor_prices (product_id, flavor, price) VALUES (?, ?, ?)'
    );

    foreach (array_values($payload['products'] ?? []) as $i => $p) {
      $pid = $p['id'] ?? ('p-' . $i);
      // Copo da Felicidade: preço cheio R$29 (sem promo antiga)
      if ($pid === 'p0') {
        $p['price'] = 29;
        $p['promoActive'] = false;
        $p['promoPrice'] = null;
        $p['promoLabel'] = '';
      }
      $row = [
        $pid,
        $p['name'] ?? '',
        $p['description'] ?? '',
        (float) ($p['price'] ?? 0),
        aurora_bool($p['priceFrom'] ?? false),
        $p['categoryId'] ?? '',
        $p['image'] ?? '',
        aurora_bool($p['featured'] ?? false),
        $p['slug'] ?? $pid,
        $p['size'] ?? '',
        aurora_bool($p['promoActive'] ?? false),
        isset($p['promoPrice']) && $p['promoPrice'] !== null && $p['promoPrice'] !== ''
          ? (float) $p['promoPrice']
          : null,
        $p['promoLabel'] ?? '',
        aurora_bool($p['bestSeller'] ?? false),
        aurora_bool($p['active'] ?? true),
      ];
      if ($hasAvailable) {
        $row[] = aurora_bool($p['available'] ?? true);
      }
      if ($hasStock) {
        $stockVal = $p['stock'] ?? null;
        if ($stockVal === '' || $stockVal === false) {
          $row[] = null;
        } elseif ($stockVal === null) {
          $row[] = null;
        } else {
          $row[] = max(0, (int) $stockVal);
        }
      }
      $row[] = (int) ($p['sortOrder'] ?? $i);
      $prodStmt->execute($row);

      foreach (array_values($p['flavors'] ?? []) as $fi => $flavor) {
        $flavorStmt->execute([$pid, $flavor, $fi]);
      }
      foreach (($p['flavorPrices'] ?? []) as $flavor => $price) {
        $fpStmt->execute([$pid, $flavor, (float) $price]);
      }
    }

    $galStmt = $pdo->prepare('INSERT INTO gallery (image, sort_order, active) VALUES (?, ?, 1)');
    foreach (array_values($payload['gallery'] ?? []) as $i => $img) {
      if (!$img) continue;
      $galStmt->execute([$img, $i]);
    }

    // Clientes
    $pdo->exec('DELETE FROM clients');
    $hasLoyaltyBonus = false;
    try {
      $col = $pdo->query("SHOW COLUMNS FROM clients LIKE 'loyalty_bonus'")->fetch();
      $hasLoyaltyBonus = !empty($col);
    } catch (Throwable $e) {
      $hasLoyaltyBonus = false;
    }
    if ($hasLoyaltyBonus) {
      $clientStmt = $pdo->prepare(
        'INSERT INTO clients (id, name, email, phone, address, loyalty_bonus) VALUES (?, ?, ?, ?, ?, ?)'
      );
      foreach ($payload['clients'] ?? [] as $c) {
        $clientStmt->execute([
          $c['id'] ?? uniqid('c', true),
          $c['name'] ?? '',
          $c['email'] ?? '',
          $c['phone'] ?? '',
          $c['address'] ?? '',
          max(0, (int) ($c['loyaltyBonus'] ?? 0)),
        ]);
      }
    } else {
      $clientStmt = $pdo->prepare(
        'INSERT INTO clients (id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)'
      );
      foreach ($payload['clients'] ?? [] as $c) {
        $clientStmt->execute([
          $c['id'] ?? uniqid('c', true),
          $c['name'] ?? '',
          $c['email'] ?? '',
          $c['phone'] ?? '',
          $c['address'] ?? '',
        ]);
      }
    }

    // Pedidos + itens
    $oldOrdersForStock = aurora_load_orders_with_items($pdo);
    $pdo->exec('DELETE FROM order_items');
    $pdo->exec('DELETE FROM orders');
    $orderStmt = $pdo->prepare(
      'INSERT INTO orders (
        id, number, client_id, client_name, client_whatsapp, total, status, ordered_at,
        notes, delivery_fee, discount, waive_delivery
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $itemStmt = $pdo->prepare(
      'INSERT INTO order_items (order_id, product_id, product_name, flavor, qty, price)
       VALUES (?, ?, ?, ?, ?, ?)'
    );
    foreach ($payload['orders'] ?? [] as $o) {
      $oid = $o['id'] ?? uniqid('o', true);
      $orderedAt = !empty($o['date']) ? date('Y-m-d H:i:s', strtotime($o['date'])) : date('Y-m-d H:i:s');
      $status = $o['status'] ?? 'novo';
      $allowed = ['novo', 'preparo', 'entrega', 'finalizado', 'cancelado'];
      if (!in_array($status, $allowed, true)) $status = 'novo';

      $orderStmt->execute([
        $oid,
        $o['number'] ?? ('PED-' . date('Y') . '-001'),
        $o['clientId'] ?? null,
        $o['clientName'] ?? '',
        $o['clientWhatsapp'] ?? '',
        (float) ($o['total'] ?? 0),
        $status,
        $orderedAt,
        $o['notes'] ?? '',
        (float) ($o['deliveryFee'] ?? 0),
        (float) ($o['discount'] ?? 0),
        !empty($o['waiveDelivery']) ? 1 : 0,
      ]);

      foreach ($o['items'] ?? [] as $item) {
        $itemStmt->execute([
          $oid,
          $item['productId'] ?? $item['id'] ?? null,
          $item['name'] ?? $item['productName'] ?? 'Item',
          $item['flavor'] ?? '',
          (int) ($item['qty'] ?? 1),
          (float) ($item['price'] ?? 0),
        ]);
      }
    }

    aurora_sync_stock_from_order_changes($pdo, $oldOrdersForStock, $payload['orders'] ?? []);

    // Financeiro
    $pdo->exec('DELETE FROM finance');
    $finStmt = $pdo->prepare(
      'INSERT INTO finance (id, type, amount, description, entry_date, order_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    foreach ($payload['finance'] ?? [] as $f) {
      $type = ($f['type'] ?? '') === 'saida' ? 'saida' : 'entrada';
      $entryDate = !empty($f['date']) ? date('Y-m-d', strtotime($f['date'])) : date('Y-m-d');
      $finStmt->execute([
        $f['id'] ?? uniqid('f', true),
        $type,
        (float) ($f['amount'] ?? 0),
        $f['description'] ?? '',
        $entryDate,
        $f['orderId'] ?? null,
      ]);
    }

    // Cupons
    aurora_ensure_coupons_table($pdo);
    if (aurora_table_exists($pdo, 'coupons')) {
      $pdo->exec('DELETE FROM coupons');
      $couponStmt = $pdo->prepare(
        'INSERT INTO coupons (id, code, type, value, min_order, active, label) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      foreach ($payload['coupons'] ?? [] as $c) {
        $code = strtoupper(trim((string) ($c['code'] ?? '')));
        if ($code === '') continue;
        $type = ($c['type'] ?? '') === 'fixed' ? 'fixed' : 'percent';
        $couponStmt->execute([
          $c['id'] ?? uniqid('cp', true),
          $code,
          $type,
          (float) ($c['value'] ?? 0),
          (float) ($c['minOrder'] ?? 0),
          !empty($c['active']) ? 1 : 0,
          $c['label'] ?? '',
        ]);
      }
    }

    // Insumos / itens de estoque
    aurora_ensure_inventory_items_table($pdo);
    if (aurora_table_exists($pdo, 'inventory_items')) {
      $pdo->exec('DELETE FROM inventory_items');
      $invStmt = $pdo->prepare(
        'INSERT INTO inventory_items (id, name, category, unit, stock, unit_cost, min_stock, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      foreach (array_values($payload['inventoryItems'] ?? []) as $i => $item) {
        if (!is_array($item)) continue;
        $norm = aurora_normalize_inventory_input($item);
        if ($norm['name'] === '') continue;
        $invStmt->execute([
          $norm['id'],
          $norm['name'],
          $norm['category'],
          $norm['unit'],
          $norm['stock'],
          $norm['unitCost'],
          $norm['minStock'] ?? null,
          $norm['notes'] ?? null,
          (int) ($norm['sortOrder'] ?? $i),
        ]);
      }
    }

    // Reviews / FAQ
    $pdo->exec('DELETE FROM reviews');
    $revStmt = $pdo->prepare(
      'INSERT INTO reviews (id, author, text, rating, active) VALUES (?, ?, ?, ?, 1)'
    );
    foreach ($payload['reviews'] ?? [] as $r) {
      $revStmt->execute([
        $r['id'] ?? uniqid('r', true),
        $r['author'] ?? '',
        $r['text'] ?? '',
        (int) ($r['rating'] ?? 5),
      ]);
    }

    $pdo->exec('DELETE FROM faq');
    $faqStmt = $pdo->prepare(
      'INSERT INTO faq (id, question, answer, sort_order, active) VALUES (?, ?, ?, ?, 1)'
    );
    foreach (array_values($payload['faq'] ?? []) as $i => $f) {
      $faqStmt->execute([
        $f['id'] ?? uniqid('faq', true),
        $f['question'] ?? '',
        $f['answer'] ?? '',
        $i,
      ]);
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      try { $pdo->exec('SET FOREIGN_KEY_CHECKS = 1'); } catch (Throwable $ignored) {}
      $pdo->rollBack();
    }
    throw $e;
  }

  // Cardápio estático (não depende de PHP nas visitas do site)
  try {
    aurora_write_public_catalog($pdo);
  } catch (Throwable $e) {
    // não falha o save se o JSON estático não gravar
  }

  try {
    aurora_patch_catalog_stock_from_db($pdo);
  } catch (Throwable $e) {
    // ignore
  }
}

/**
 * Grava catalog.json na raiz do site — HTML/JS leem sem MySQL/PHP.
 */
function aurora_write_public_catalog(PDO $pdo): bool {
  $data = aurora_load_all($pdo, 'public');
  if (!$data) return false;

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

  $products = [];
  foreach ($data['products'] ?? [] as $p) {
    if (!is_array($p)) continue;
    if (((int) (!empty($p['active']) ? 1 : 0)) !== 1) continue;
    $img = (string) ($p['image'] ?? '');
    // data-URL → arquivo + backup MySQL (catalog.json não pode ficar gigante)
    if (str_starts_with($img, 'data:')) {
      $path = aurora_save_data_url_file($img);
      if ($path) {
        $p['image'] = $path;
        if (!empty($p['id'])) {
          try {
            $upd = $pdo->prepare('UPDATE products SET image = ? WHERE id = ?');
            $upd->execute([$path, $p['id']]);
          } catch (Throwable $e) {
            // catalog ainda leva o path
          }
        }
      } else {
        $p['image'] = '';
      }
    }
    $products[] = $p;
  }

  $payload = [
    'version' => $data['version'] ?? 16,
    'generatedAt' => gmdate('c'),
    'settings' => $data['settings'] ?? new stdClass(),
    'categories' => $data['categories'] ?? [],
    'products' => $products,
    'reviews' => $data['reviews'] ?? [],
    'faq' => $data['faq'] ?? [],
    'gallery' => array_values(array_filter(
      $data['gallery'] ?? [],
      static fn($g) => !str_starts_with((string) $g, 'data:')
    )),
    'coupons' => $coupons,
  ];

  $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false) return false;

  $root = dirname(__DIR__);
  $ok = @file_put_contents($root . DIRECTORY_SEPARATOR . 'catalog.json', $json) !== false;

  // Espelho em api/ (alguns deploys)
  @file_put_contents($root . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'catalog.json', $json);

  // Arquivo "vivo" (não versionado) — sobrevive melhor a confusão com o JSON do Git
  @file_put_contents($root . DIRECTORY_SEPARATOR . 'catalog.live.json', $json);

  return $ok;
}

function aurora_upsert_client(PDO $pdo, array $client): ?string {
  if (empty($client['id']) && empty($client['phone'])) return null;

  $id = (string) ($client['id'] ?? ('c_' . uniqid()));
  $phone = preg_replace('/\D+/', '', (string) ($client['phone'] ?? ''));

  if ($phone !== '') {
    // Também tenta achar por variantes do WhatsApp (com/sem 55 e 9)
    $variants = function_exists('aurora_phone_match_keys')
      ? aurora_phone_match_keys($phone)
      : array_values(array_unique(array_filter([$phone])));
    if ($variants) {
      $placeholders = implode(',', array_fill(0, count($variants), '?'));
      $find = $pdo->prepare("SELECT id FROM clients WHERE phone IN ($placeholders) LIMIT 1");
      $find->execute($variants);
      $existing = $find->fetchColumn();
      if ($existing) {
        $upd = $pdo->prepare('UPDATE clients SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?');
        $upd->execute([
          $client['name'] ?? '',
          $client['email'] ?? '',
          $phone,
          $client['address'] ?? '',
          $existing,
        ]);
        return (string) $existing;
      }
    }
  }

  $ins = $pdo->prepare(
    'INSERT INTO clients (id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), phone=VALUES(phone), address=VALUES(address)'
  );
  $ins->execute([
    $id,
    $client['name'] ?? '',
    $client['email'] ?? '',
    $phone,
    $client['address'] ?? '',
  ]);
  return $id;
}

function aurora_product_has_stock_column(PDO $pdo): bool {
  static $cache = [];
  $key = spl_object_hash($pdo);
  if (array_key_exists($key, $cache)) return $cache[$key];
  try {
    $cache[$key] = (bool) $pdo->query("SHOW COLUMNS FROM products LIKE 'stock'")->fetch();
  } catch (Throwable $e) {
    $cache[$key] = false;
  }
  return $cache[$key];
}

function aurora_collect_active_order_stock(array $orders): array {
  $map = [];
  foreach ($orders as $o) {
    if (!is_array($o)) continue;
    if (($o['status'] ?? '') === 'cancelado') continue;
    foreach ($o['items'] ?? [] as $item) {
      if (!is_array($item)) continue;
      $pid = trim((string) ($item['productId'] ?? $item['id'] ?? ''));
      if ($pid === '') continue;
      $map[$pid] = ($map[$pid] ?? 0) + max(1, (int) ($item['qty'] ?? 1));
    }
  }
  return $map;
}

function aurora_load_orders_with_items(PDO $pdo): array {
  if (!aurora_table_exists($pdo, 'orders')) return [];
  $itemsByOrder = [];
  if (aurora_table_exists($pdo, 'order_items')) {
    foreach ($pdo->query('SELECT order_id, product_id, qty FROM order_items ORDER BY id ASC')->fetchAll() as $item) {
      $oid = (string) ($item['order_id'] ?? '');
      if ($oid === '') continue;
      if (!isset($itemsByOrder[$oid])) $itemsByOrder[$oid] = [];
      $itemsByOrder[$oid][] = [
        'productId' => (string) ($item['product_id'] ?? ''),
        'qty' => max(1, (int) ($item['qty'] ?? 1)),
      ];
    }
  }
  $orders = [];
  foreach ($pdo->query('SELECT id, status FROM orders')->fetchAll() as $row) {
    $oid = (string) ($row['id'] ?? '');
    if ($oid === '') continue;
    $orders[] = [
      'id' => $oid,
      'status' => (string) ($row['status'] ?? 'novo'),
      'items' => $itemsByOrder[$oid] ?? [],
    ];
  }
  return $orders;
}

function aurora_sync_stock_from_order_changes(PDO $pdo, array $oldOrders, array $newOrders): void {
  if (!aurora_product_has_stock_column($pdo)) return;

  $oldMap = aurora_collect_active_order_stock($oldOrders);
  $newMap = aurora_collect_active_order_stock($newOrders);
  $ids = array_unique(array_merge(array_keys($oldMap), array_keys($newMap)));
  if (!$ids) return;

  $sel = $pdo->prepare('SELECT id, stock FROM products WHERE id = ? FOR UPDATE');
  $upd = $pdo->prepare('UPDATE products SET stock = ?, available = ? WHERE id = ?');

  foreach ($ids as $pid) {
    $sel->execute([$pid]);
    $row = $sel->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['stock'] === null) continue;

    $delta = ($oldMap[$pid] ?? 0) - ($newMap[$pid] ?? 0);
    if ($delta === 0) continue;

    $next = max(0, (int) $row['stock'] + $delta);
    $upd->execute([$next, $next > 0 ? 1 : 0, $pid]);
  }
}

function aurora_reserve_stock_for_order(PDO $pdo, array $items): void {
  if (!aurora_product_has_stock_column($pdo)) return;

  $need = [];
  foreach ($items as $item) {
    if (!is_array($item)) continue;
    $pid = trim((string) ($item['productId'] ?? $item['id'] ?? ''));
    if ($pid === '') continue;
    $need[$pid] = ($need[$pid] ?? 0) + max(1, (int) ($item['qty'] ?? 1));
  }
  if (!$need) return;

  $sel = $pdo->prepare('SELECT id, name, stock FROM products WHERE id = ? FOR UPDATE');
  $upd = $pdo->prepare('UPDATE products SET stock = ?, available = ? WHERE id = ?');

  foreach ($need as $pid => $qty) {
    $sel->execute([$pid]);
    $row = $sel->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['stock'] === null) continue;

    $stock = (int) $row['stock'];
    if ($stock < $qty) {
      $name = trim((string) ($row['name'] ?? $pid));
      throw new RuntimeException("Estoque insuficiente para {$name} (restam {$stock}).");
    }
    $next = $stock - $qty;
    $upd->execute([$next, $next > 0 ? 1 : 0, $pid]);
  }
}

function aurora_patch_catalog_stock_from_db(PDO $pdo): bool {
  if (!aurora_product_has_stock_column($pdo)) return false;

  $rows = $pdo->query('SELECT id, stock, available FROM products')->fetchAll(PDO::FETCH_ASSOC);
  if (!$rows) return false;

  $stockMap = [];
  $availableMap = [];
  foreach ($rows as $row) {
    $id = (string) ($row['id'] ?? '');
    if ($id === '') continue;
    if ($row['stock'] !== null && $row['stock'] !== '') {
      $stockMap[$id] = max(0, (int) $row['stock']);
    }
    $availableMap[$id] = ((int) ($row['available'] ?? 1)) === 1;
  }

  $root = dirname(__DIR__);
  $paths = [
    $root . DIRECTORY_SEPARATOR . 'catalog.json',
    $root . DIRECTORY_SEPARATOR . 'catalog.live.json',
    $root . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'catalog.json',
  ];

  $source = null;
  foreach ($paths as $path) {
    if (!is_file($path)) continue;
    $raw = @file_get_contents($path);
    if (!is_string($raw) || $raw === '') continue;
    $data = json_decode($raw, true);
    if (!is_array($data) || !isset($data['products'])) continue;
    $source = $data;
    break;
  }
  if (!$source) return false;

  foreach ($source['products'] as &$prod) {
    if (!is_array($prod)) continue;
    $pid = (string) ($prod['id'] ?? '');
    if ($pid === '') continue;
    if (array_key_exists($pid, $stockMap)) {
      $prod['stock'] = $stockMap[$pid];
    } else {
      unset($prod['stock']);
    }
    if (array_key_exists($pid, $availableMap)) {
      $prod['available'] = $availableMap[$pid];
    }
  }
  unset($prod);

  $source['generatedAt'] = gmdate('c');
  $json = json_encode($source, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false) return false;

  $ok = false;
  foreach ($paths as $path) {
    if (@file_put_contents($path, $json) !== false) $ok = true;
  }
  return $ok;
}

function aurora_create_order(PDO $pdo, array $order, ?array $client = null): array {
  $resolvedClientId = null;
  if (is_array($client)) {
    $resolvedClientId = aurora_upsert_client($pdo, $client);
  }

  $phone = preg_replace('/\D+/', '', (string) ($order['clientWhatsapp'] ?? ''));
  $total = (float) ($order['total'] ?? 0);
  $name = trim((string) ($order['clientName'] ?? ''));
  $clientId = $resolvedClientId
    ?: (string) ($order['clientId'] ?? ($client['id'] ?? ''));
  if ($clientId === '') $clientId = null;

  $orderId = (string) ($order['id'] ?? '');
  if ($orderId !== '') {
    $chk = $pdo->prepare('SELECT number FROM orders WHERE id = ? LIMIT 1');
    $chk->execute([$orderId]);
    $existingNumber = $chk->fetchColumn();
    if ($existingNumber) {
      $st = $pdo->prepare('SELECT status FROM orders WHERE id = ? LIMIT 1');
      $st->execute([$orderId]);
      return [
        'ok' => true,
        'orderId' => $orderId,
        'orderNumber' => $existingNumber,
        'status' => (string) ($st->fetchColumn() ?: 'novo'),
        'duplicated' => true,
        'loyalty' => aurora_loyalty_stats_safe($pdo, $phone),
      ];
    }
  }

  if ($phone !== '') {
    $dup = $pdo->prepare(
      "SELECT number FROM orders
       WHERE client_whatsapp = ?
         AND client_name = ?
         AND ABS(total - ?) < 0.001
         AND ordered_at >= (NOW() - INTERVAL 90 SECOND)
       ORDER BY ordered_at DESC LIMIT 1"
    );
    $dup->execute([$phone, $name, $total]);
    $dupNumber = $dup->fetchColumn();
    if ($dupNumber) {
      $st = $pdo->prepare('SELECT status FROM orders WHERE number = ? LIMIT 1');
      $st->execute([$dupNumber]);
      return [
        'ok' => true,
        'orderNumber' => $dupNumber,
        'status' => (string) ($st->fetchColumn() ?: 'novo'),
        'duplicated' => true,
        'loyalty' => aurora_loyalty_stats_safe($pdo, $phone),
      ];
    }
  }

  $year = (int) date('Y');
  $max = 0;
  $like = sprintf('PED-%d-%%', $year);
  $numStmt = $pdo->prepare(
    'SELECT number FROM orders WHERE number LIKE ? ORDER BY number DESC LIMIT 50'
  );
  $numStmt->execute([$like]);
  foreach ($numStmt->fetchAll(PDO::FETCH_COLUMN) as $number) {
    if (preg_match('/PED-(\d{4})-(\d+)/i', (string) $number, $m) && (int) $m[1] === $year) {
      $max = max($max, (int) $m[2]);
    }
  }
  $orderNumber = sprintf('PED-%d-%03d', $year, $max + 1);
  if ($orderId === '') $orderId = 'o_' . uniqid();

  $pdo->beginTransaction();
  try {
    if ($clientId) {
      $chkClient = $pdo->prepare('SELECT id FROM clients WHERE id = ? LIMIT 1');
      $chkClient->execute([$clientId]);
      if (!$chkClient->fetchColumn()) {
        $clientId = null;
      }
    }

    aurora_reserve_stock_for_order($pdo, $order['items'] ?? []);

    $ins = $pdo->prepare(
      'INSERT INTO orders (
        id, number, client_id, client_name, client_whatsapp, total, status, ordered_at,
        notes, delivery_fee, discount, waive_delivery
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)'
    );
    $orderNotes = trim((string) ($order['notes'] ?? ''));
    $orderDeliveryFee = max(0, (float) ($order['deliveryFee'] ?? 0));
    $orderDiscount = max(0, (float) ($order['discount'] ?? 0));
    $orderWaive = !empty($order['waiveDelivery']) ? 1 : 0;
    $ins->execute([
      $orderId,
      $orderNumber,
      $clientId,
      $name,
      $phone,
      $total,
      'novo',
      $orderNotes !== '' ? $orderNotes : null,
      $orderDeliveryFee,
      $orderDiscount,
      $orderWaive,
    ]);

    $itemStmt = $pdo->prepare(
      'INSERT INTO order_items (order_id, product_id, product_name, flavor, qty, price)
       VALUES (?, ?, ?, ?, ?, ?)'
    );
    foreach ($order['items'] ?? [] as $item) {
      $itemStmt->execute([
        $orderId,
        $item['productId'] ?? $item['id'] ?? null,
        $item['name'] ?? $item['productName'] ?? 'Item',
        $item['flavor'] ?? ($item['detail'] ?? ''),
        (int) ($item['qty'] ?? 1),
        (float) ($item['price'] ?? 0),
      ]);
    }

    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }

  try {
    aurora_patch_catalog_stock_from_db($pdo);
  } catch (Throwable $e) {
    // Pedido já gravado — falha no espelho do cardápio não cancela
  }

  return [
    'ok' => true,
    'orderId' => $orderId,
    'orderNumber' => $orderNumber,
    'status' => 'novo',
    'loyalty' => aurora_loyalty_stats_safe($pdo, $phone),
  ];
}

/**
 * Status público do pedido — exige WhatsApp que bate com o cadastro do pedido.
 */
function aurora_get_public_order_status(PDO $pdo, string $phone, string $orderNumber = ''): ?array {
  $phone = preg_replace('/\D+/', '', $phone);
  if ($phone === '') {
    return null;
  }

  $orderNumber = trim($orderNumber);
  if ($orderNumber !== '') {
    $stmt = $pdo->prepare(
      'SELECT number, status, total, ordered_at
       FROM orders
       WHERE number = ? AND client_whatsapp = ?
       LIMIT 1'
    );
    $stmt->execute([$orderNumber, $phone]);
  } else {
    $stmt = $pdo->prepare(
      "SELECT number, status, total, ordered_at
       FROM orders
       WHERE client_whatsapp = ?
         AND status NOT IN ('finalizado', 'cancelado')
       ORDER BY ordered_at DESC
       LIMIT 1"
    );
    $stmt->execute([$phone]);
  }

  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$row) {
    return null;
  }

  $status = (string) ($row['status'] ?? 'novo');
  $allowed = ['novo', 'preparo', 'entrega', 'finalizado', 'cancelado'];
  if (!in_array($status, $allowed, true)) {
    $status = 'novo';
  }

  return [
    'orderNumber' => (string) ($row['number'] ?? ''),
    'status' => $status,
    'total' => (float) ($row['total'] ?? 0),
    'orderedAt' => (string) ($row['ordered_at'] ?? ''),
  ];
}

function aurora_loyalty_stats_safe(PDO $pdo, string $phone): array {
  try {
    return aurora_loyalty_stats($pdo, $phone);
  } catch (Throwable $e) {
    $goal = aurora_loyalty_goal();
    return [
      'phone' => aurora_normalize_phone($phone),
      'total' => 0,
      'siteTotal' => 0,
      'bonus' => 0,
      'progress' => 0,
      'goal' => $goal,
      'remaining' => $goal,
      'rewards' => 0,
      'eligible' => false,
      'gift' => aurora_loyalty_gift(),
    ];
  }
}

/**
 * Fidelidade — 15 pedidos finalizados no painel = 1 brinde.
 * Chave: WhatsApp do cliente.
 */
function aurora_loyalty_goal(): int {
  return 15;
}

function aurora_loyalty_gift(): string {
  return '1 pipoca P de brinde';
}

function aurora_normalize_phone($phone): string {
  return preg_replace('/\D+/', '', (string) $phone);
}

/**
 * Gera chaves de comparação para o mesmo WhatsApp BR
 * (com/sem 55, com/sem o 9º dígito após o DDD).
 */
function aurora_phone_match_keys(string $phone): array {
  $phone = aurora_normalize_phone($phone);
  if ($phone === '' || strlen($phone) < 10) return [];

  $keys = [];
  $add = static function (string $p) use (&$keys): void {
    if ($p !== '' && strlen($p) >= 10) $keys[$p] = true;
  };

  $add($phone);
  $local = (str_starts_with($phone, '55') && strlen($phone) >= 12) ? substr($phone, 2) : $phone;
  $add($local);
  $add(str_starts_with($phone, '55') ? $phone : ('55' . $phone));
  $add(str_starts_with($local, '55') ? $local : ('55' . $local));

  // Com / sem o 9 após o DDD (celular BR)
  if (strlen($local) === 11 && $local[2] === '9') {
    $noNine = substr($local, 0, 2) . substr($local, 3);
    $add($noNine);
    $add('55' . $noNine);
  } elseif (strlen($local) === 10) {
    $withNine = substr($local, 0, 2) . '9' . substr($local, 2);
    $add($withNine);
    $add('55' . $withNine);
  }

  return array_keys($keys);
}

function aurora_phone_variants(string $phone): array {
  return aurora_phone_match_keys($phone);
}

function aurora_phones_equivalent(string $a, string $b): bool {
  $ka = aurora_phone_match_keys($a);
  $kb = aurora_phone_match_keys($b);
  if (!$ka || !$kb) return false;
  return (bool) array_intersect($ka, $kb);
}

function aurora_phone_sql_digits(string $column): string {
  $expr = $column;
  foreach ([' ', '-', '(', ')', '+', '.'] as $ch) {
    $expr = "REPLACE($expr, '$ch', '')";
  }
  return $expr;
}

function aurora_loyalty_stats(PDO $pdo, string $phone): array {
  $goal = aurora_loyalty_goal();
  $gift = aurora_loyalty_gift();
  $variants = aurora_phone_match_keys($phone);
  if (!$variants) {
    return [
      'phone' => '',
      'total' => 0,
      'siteTotal' => 0,
      'bonus' => 0,
      'progress' => 0,
      'goal' => $goal,
      'remaining' => $goal,
      'rewards' => 0,
      'eligible' => false,
      'gift' => $gift,
    ];
  }

  // Contagem por variantes do WhatsApp (SQL — normaliza telefone salvo com máscara)
  $placeholders = implode(',', array_fill(0, count($variants), '?'));
  $phoneExpr = aurora_phone_sql_digits('client_whatsapp');
  $stmt = $pdo->prepare(
    "SELECT COUNT(*) FROM orders
     WHERE status = 'finalizado'
       AND $phoneExpr IN ($placeholders)"
  );
  $stmt->execute($variants);
  $siteTotal = (int) $stmt->fetchColumn();

  $bonus = 0;
  try {
    $clientPhoneExpr = aurora_phone_sql_digits('phone');
    $bStmt = $pdo->prepare(
      "SELECT MAX(loyalty_bonus) FROM clients WHERE $clientPhoneExpr IN ($placeholders)"
    );
    $bStmt->execute($variants);
    $bonus = max(0, (int) $bStmt->fetchColumn());
  } catch (Throwable $e) {
    $bonus = 0;
  }

  $total = $siteTotal + $bonus;

  $rewards = intdiv($total, $goal);
  $mod = $total % $goal;
  $eligible = $total > 0 && $mod === 0;
  $progress = $eligible ? $goal : $mod;
  $remaining = $eligible ? 0 : ($goal - $progress);

  return [
    'phone' => $variants[0],
    'total' => $total,
    'siteTotal' => $siteTotal,
    'bonus' => $bonus,
    'progress' => $progress,
    'goal' => $goal,
    'remaining' => $remaining,
    'rewards' => $rewards,
    'eligible' => $eligible,
    'gift' => $gift,
  ];
}

function aurora_default_store_schedule(): array {
  return [
    ['days' => [3, 4, 5], 'open' => '19:30', 'close' => '22:00'],
    ['days' => [0, 6], 'open' => '12:00', 'close' => '18:00'],
  ];
}

function aurora_parse_store_schedule($value): array {
  if (is_string($value) && $value !== '') {
    $decoded = json_decode($value, true);
    if (is_array($decoded)) $value = $decoded;
  }
  if (!is_array($value) || !$value) {
    return aurora_default_store_schedule();
  }
  $windows = [];
  foreach ($value as $win) {
    if (!is_array($win)) continue;
    $rawDays = $win['days'] ?? [];
    $days = aurora_parse_open_days($rawDays);
    $open = (string) ($win['open'] ?? $win['openTime'] ?? '19:30');
    $close = (string) ($win['close'] ?? $win['closeTime'] ?? '22:00');
    if (!preg_match('/^\d{1,2}:\d{2}$/', $open) || !preg_match('/^\d{1,2}:\d{2}$/', $close) || !$days) {
      continue;
    }
    $windows[] = ['days' => $days, 'open' => $open, 'close' => $close];
  }
  return $windows ?: aurora_default_store_schedule();
}

function aurora_format_store_schedule($value): string {
  $windows = aurora_parse_store_schedule($value);
  $json = json_encode($windows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  return $json !== false ? $json : '[]';
}

function aurora_parse_open_days($value): array {
  if (is_array($value)) {
    $days = array_map('intval', $value);
  } else {
    $days = array_map('intval', explode(',', (string) $value));
  }
  $days = array_values(array_unique(array_filter($days, static fn($d) => $d >= 0 && $d <= 6)));
  sort($days);
  return $days;
}

function aurora_format_open_days($value): string {
  $days = aurora_parse_open_days($value);
  if (!$days) {
    $days = [0, 3, 4, 5, 6];
  }
  return implode(',', $days);
}

function aurora_ensure_store_settings_columns(PDO $pdo): void {
  aurora_ensure_column($pdo, 'settings', 'delivery_fee', "DECIMAL(10,2) NOT NULL DEFAULT 5.00");
  aurora_ensure_column($pdo, 'settings', 'delivery_note', "VARCHAR(255) NULL DEFAULT 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5'");
  aurora_ensure_column($pdo, 'settings', 'store_status', "VARCHAR(20) NOT NULL DEFAULT 'auto'");
  aurora_ensure_column($pdo, 'settings', 'open_time', "VARCHAR(5) NOT NULL DEFAULT '19:30'");
  aurora_ensure_column($pdo, 'settings', 'close_time', "VARCHAR(5) NOT NULL DEFAULT '22:00'");
  aurora_ensure_column($pdo, 'settings', 'open_days', "VARCHAR(30) NOT NULL DEFAULT '0,3,4,5,6'");
  aurora_ensure_column($pdo, 'settings', 'store_schedule', "TEXT NULL");
}

function aurora_save_settings_only(PDO $pdo, array $settings): void {
  if (!aurora_db_ready($pdo)) {
    throw new RuntimeException('Tabelas MySQL não encontradas. Importe api/pipocando_mysql.sql no phpMyAdmin.');
  }

  aurora_ensure_store_settings_columns($pdo);

  $row = $pdo->query('SELECT * FROM settings WHERE id = 1 LIMIT 1')->fetch(PDO::FETCH_ASSOC) ?: [];
  $current = [
    'name' => $row['name'] ?? '',
    'tagline' => $row['tagline'] ?? '',
    'logo' => $row['logo'] ?? '',
    'banner' => $row['banner'] ?? '',
    'sobreImage' => $row['sobre_image'] ?? '',
    'whatsapp' => $row['whatsapp'] ?? '',
    'instagram' => $row['instagram'] ?? '',
    'instagramUser' => $row['instagram_user'] ?? '',
    'facebook' => $row['facebook'] ?? '',
    'email' => $row['email'] ?? '',
    'address' => $row['address'] ?? '',
    'hours' => $row['hours'] ?? '',
    'followers' => $row['followers'] ?? '',
    'posts' => $row['posts'] ?? '',
    'mapEmbed' => $row['map_embed'] ?? '',
    'heroBadge' => $row['hero_badge'] ?? '',
    'heroStory' => aurora_json_decode_field($row['hero_story'] ?? null, []),
    'sobreText1' => $row['sobre_text1'] ?? '',
    'sobreText2' => $row['sobre_text2'] ?? '',
    'deliveryFee' => isset($row['delivery_fee']) ? (float) $row['delivery_fee'] : 5,
    'deliveryNote' => $row['delivery_note'] ?? 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5',
    'storeStatus' => (string) ($row['store_status'] ?? 'auto'),
    'openTime' => (string) ($row['open_time'] ?? '19:30'),
    'closeTime' => (string) ($row['close_time'] ?? '22:00'),
    'openDays' => aurora_parse_open_days($row['open_days'] ?? '0,3,4,5,6'),
    'storeSchedule' => aurora_parse_store_schedule($row['store_schedule'] ?? null),
  ];
  pipocando_merge_brand_into_settings($current);

  $s = array_merge($current, $settings);
  $heroStory = pipocando_pack_hero_story($s);
  $deliveryFee = isset($s['deliveryFee']) ? (float) $s['deliveryFee'] : 5;
  if ($deliveryFee < 0) $deliveryFee = 0;
  $deliveryNote = trim((string) ($s['deliveryNote'] ?? 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5'));
  if ($deliveryNote === '') $deliveryNote = 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5';

  $stmt = $pdo->prepare(
    'INSERT INTO settings (
      id, name, tagline, logo, banner, sobre_image, whatsapp, instagram, instagram_user,
      facebook, email, address, hours, followers, posts, map_embed, hero_badge, hero_story,
      sobre_text1, sobre_text2, delivery_fee, delivery_note, store_status, open_time, close_time, open_days, data_version
    ) VALUES (
      1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON DUPLICATE KEY UPDATE
      name=VALUES(name), tagline=VALUES(tagline), logo=VALUES(logo), banner=VALUES(banner),
      sobre_image=VALUES(sobre_image), whatsapp=VALUES(whatsapp), instagram=VALUES(instagram),
      instagram_user=VALUES(instagram_user), facebook=VALUES(facebook), email=VALUES(email),
      address=VALUES(address), hours=VALUES(hours), followers=VALUES(followers), posts=VALUES(posts),
      map_embed=VALUES(map_embed), hero_badge=VALUES(hero_badge), hero_story=VALUES(hero_story),
      sobre_text1=VALUES(sobre_text1), sobre_text2=VALUES(sobre_text2),
      delivery_fee=VALUES(delivery_fee), delivery_note=VALUES(delivery_note),
      store_status=VALUES(store_status), open_time=VALUES(open_time), close_time=VALUES(close_time),
      open_days=VALUES(open_days), data_version=VALUES(data_version)'
  );
  $stmt->execute([
    $s['name'] ?? '',
    $s['tagline'] ?? '',
    $s['logo'] ?? '',
    $s['banner'] ?? '',
    $s['sobreImage'] ?? '',
    $s['whatsapp'] ?? '',
    $s['instagram'] ?? '',
    $s['instagramUser'] ?? '',
    $s['facebook'] ?? '',
    $s['email'] ?? '',
    $s['address'] ?? '',
    $s['hours'] ?? '',
    $s['followers'] ?? '',
    $s['posts'] ?? '',
    $s['mapEmbed'] ?? '',
    $s['heroBadge'] ?? '',
    $heroStory,
    $s['sobreText1'] ?? '',
    $s['sobreText2'] ?? '',
    $deliveryFee,
    $deliveryNote,
    in_array(($s['storeStatus'] ?? 'auto'), ['auto', 'open', 'closed'], true) ? ($s['storeStatus'] ?? 'auto') : 'auto',
    preg_match('/^\d{1,2}:\d{2}$/', (string) ($s['openTime'] ?? '')) ? $s['openTime'] : '19:30',
    preg_match('/^\d{1,2}:\d{2}:\d{2}$/', (string) ($s['closeTime'] ?? '')) ? substr($s['closeTime'], 0, 5) : (
      preg_match('/^\d{1,2}:\d{2}$/', (string) ($s['closeTime'] ?? '')) ? $s['closeTime'] : '22:00'
    ),
    aurora_format_open_days($s['openDays'] ?? [0, 3, 4, 5, 6]),
    (int) ($s['dataVersion'] ?? $row['data_version'] ?? 16),
  ]);

  try {
    $pdo->prepare('UPDATE settings SET store_schedule = ? WHERE id = 1')->execute([
      aurora_format_store_schedule($s['storeSchedule'] ?? null),
    ]);
  } catch (Throwable $e) {
    // ignore if column missing until ensure runs again
  }
}

function aurora_normalize_inventory_unit($unit): string {
  $u = strtolower(trim((string) $unit));
  $allowed = ['un', 'cx', 'kg', 'g', 'l', 'ml', 'pct', 'm', 'lt'];
  if ($u === 'lt') $u = 'l';
  if ($u === 'pacote') $u = 'pct';
  if ($u === 'caixa') $u = 'cx';
  if ($u === 'metro' || $u === 'metros') $u = 'm';
  return in_array($u, $allowed, true) ? ($u === 'lt' ? 'l' : $u) : 'un';
}

function aurora_normalize_inventory_category($category): string {
  $c = strtolower(trim((string) $category));
  $allowed = ['recheios', 'producao', 'embalagens', 'outros'];
  if ($c === 'produção' || $c === 'producão') $c = 'producao';
  return in_array($c, $allowed, true) ? $c : 'outros';
}

function aurora_normalize_inventory_qty($value): float {
  if ($value === null || $value === '') return 0.0;
  if (!is_numeric($value)) return 0.0;
  return max(0, round((float) $value, 2));
}

function aurora_normalize_inventory_money($value): float {
  if ($value === null || $value === '') return 0.0;
  if (is_string($value)) {
    $value = str_replace(['R$', ' '], '', $value);
    if (strpos($value, ',') !== false) {
      $value = str_replace('.', '', $value);
      $value = str_replace(',', '.', $value);
    }
  }
  if (!is_numeric($value)) return 0.0;
  return max(0, round((float) $value, 2));
}

function aurora_load_inventory_items(PDO $pdo): array {
  if (!aurora_table_exists($pdo, 'inventory_items')) {
    return [];
  }
  aurora_ensure_inventory_items_table($pdo);
  $rows = $pdo->query(
    'SELECT * FROM inventory_items ORDER BY sort_order ASC, name ASC'
  )->fetchAll(PDO::FETCH_ASSOC);
  $items = [];
  foreach ($rows as $row) {
    $stock = aurora_normalize_inventory_qty($row['stock'] ?? 0);
    $unitCost = aurora_normalize_inventory_money($row['unit_cost'] ?? 0);
    $item = [
      'id' => (string) ($row['id'] ?? ''),
      'name' => (string) ($row['name'] ?? ''),
      'category' => aurora_normalize_inventory_category($row['category'] ?? 'outros'),
      'unit' => aurora_normalize_inventory_unit($row['unit'] ?? 'un'),
      'stock' => $stock,
      'unitCost' => $unitCost,
      'totalValue' => round($stock * $unitCost, 2),
      'sortOrder' => (int) ($row['sort_order'] ?? 0),
    ];
    if ($row['min_stock'] !== null && $row['min_stock'] !== '') {
      $item['minStock'] = aurora_normalize_inventory_qty($row['min_stock']);
    }
    $notes = trim((string) ($row['notes'] ?? ''));
    if ($notes !== '') $item['notes'] = $notes;
    $items[] = $item;
  }
  return $items;
}

function aurora_normalize_inventory_input(array $item): array {
  $name = trim((string) ($item['name'] ?? ''));
  $id = trim((string) ($item['id'] ?? ''));
  if ($id === '') $id = 'inv_' . bin2hex(random_bytes(6));
  $stock = aurora_normalize_inventory_qty($item['stock'] ?? 0);
  $unitCost = aurora_normalize_inventory_money($item['unitCost'] ?? $item['unit_cost'] ?? 0);
  $out = [
    'id' => $id,
    'name' => $name,
    'category' => aurora_normalize_inventory_category($item['category'] ?? 'outros'),
    'unit' => aurora_normalize_inventory_unit($item['unit'] ?? 'un'),
    'stock' => $stock,
    'unitCost' => $unitCost,
    'totalValue' => round($stock * $unitCost, 2),
    'sortOrder' => (int) ($item['sortOrder'] ?? 0),
  ];
  if (array_key_exists('minStock', $item) && $item['minStock'] !== '' && $item['minStock'] !== null) {
    $out['minStock'] = aurora_normalize_inventory_qty($item['minStock']);
  }
  $notes = trim((string) ($item['notes'] ?? ''));
  if ($notes !== '') $out['notes'] = $notes;
  return $out;
}

function aurora_save_one_inventory_item(PDO $pdo, array $payload): array {
  if (!aurora_db_ready($pdo)) {
    throw new RuntimeException('Tabelas MySQL não encontradas.');
  }
  aurora_ensure_inventory_items_table($pdo);
  $item = aurora_normalize_inventory_input($payload);
  if ($item['name'] === '') {
    throw new InvalidArgumentException('Informe o nome do item.');
  }

  $exists = $pdo->prepare('SELECT id, sort_order FROM inventory_items WHERE id = ? LIMIT 1');
  $exists->execute([$item['id']]);
  $existing = $exists->fetch(PDO::FETCH_ASSOC);
  $isNew = !$existing;
  if ($isNew && $item['sortOrder'] <= 0) {
    $max = (int) $pdo->query('SELECT COALESCE(MAX(sort_order), -1) FROM inventory_items')->fetchColumn();
    $item['sortOrder'] = $max + 1;
  } elseif (!$isNew && !array_key_exists('sortOrder', $payload)) {
    $item['sortOrder'] = (int) ($existing['sort_order'] ?? 0);
  }

  $minStock = $item['minStock'] ?? null;
  $notes = $item['notes'] ?? null;

  if ($isNew) {
    $stmt = $pdo->prepare(
      'INSERT INTO inventory_items (id, name, category, unit, stock, unit_cost, min_stock, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
      $item['id'], $item['name'], $item['category'], $item['unit'], $item['stock'],
      $item['unitCost'], $minStock, $notes, $item['sortOrder'],
    ]);
  } else {
    $stmt = $pdo->prepare(
      'UPDATE inventory_items SET name = ?, category = ?, unit = ?, stock = ?, unit_cost = ?, min_stock = ?, notes = ?, sort_order = ?
       WHERE id = ?'
    );
    $stmt->execute([
      $item['name'], $item['category'], $item['unit'], $item['stock'], $item['unitCost'],
      $minStock, $notes, $item['sortOrder'], $item['id'],
    ]);
  }

  return $item;
}

function aurora_delete_one_inventory_item(PDO $pdo, string $itemId): void {
  aurora_ensure_inventory_items_table($pdo);
  $id = trim($itemId);
  if ($id === '') {
    throw new InvalidArgumentException('Item inválido.');
  }
  $stmt = $pdo->prepare('DELETE FROM inventory_items WHERE id = ?');
  $stmt->execute([$id]);
}
