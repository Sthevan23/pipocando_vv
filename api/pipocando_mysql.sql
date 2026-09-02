-- =========================================================
-- Pipocando VV — schema MySQL (Hostinger / phpMyAdmin)
-- Charset: utf8mb4
--
-- COMO USAR:
-- 1) hPanel Hostinger > Bancos de dados MySQL > banco u586160337_pipocandovv
-- 2) phpMyAdmin > selecione o banco > aba SQL > cole este arquivo > Executar
-- 3) Crie api/config.local.php com host, usuário, senha e nome do banco
-- 4) Suba os arquivos PHP da API (db.php, mysql_store.php, data.php completo, etc.)
--
-- NOTA: O site também funciona só com catalog.json (sem MySQL).
--       O banco é para pedidos, admin na nuvem e sincronização entre celulares.
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `finance`;
DROP TABLE IF EXISTS `coupons`;
DROP TABLE IF EXISTS `clients`;
DROP TABLE IF EXISTS `product_flavor_prices`;
DROP TABLE IF EXISTS `product_flavors`;
DROP TABLE IF EXISTS `product_images`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `gallery`;
DROP TABLE IF EXISTS `faq`;
DROP TABLE IF EXISTS `reviews`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `admins`;

CREATE TABLE `admins` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admins_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `name` VARCHAR(190) NOT NULL,
  `tagline` VARCHAR(255) DEFAULT NULL,
  `logo` VARCHAR(500) DEFAULT NULL,
  `banner` VARCHAR(500) DEFAULT NULL,
  `sobre_image` VARCHAR(500) DEFAULT NULL,
  `whatsapp` VARCHAR(30) DEFAULT NULL,
  `instagram` VARCHAR(255) DEFAULT NULL,
  `instagram_user` VARCHAR(120) DEFAULT NULL,
  `facebook` VARCHAR(255) DEFAULT NULL,
  `email` VARCHAR(190) DEFAULT NULL,
  `address` VARCHAR(500) DEFAULT NULL,
  `hours` VARCHAR(255) DEFAULT NULL,
  `followers` VARCHAR(50) DEFAULT NULL,
  `posts` VARCHAR(50) DEFAULT NULL,
  `map_embed` TEXT,
  `hero_badge` VARCHAR(255) DEFAULT NULL,
  `hero_story` JSON DEFAULT NULL,
  `sobre_text1` TEXT,
  `sobre_text2` TEXT,
  `delivery_fee` DECIMAL(10,2) NOT NULL DEFAULT 8.00,
  `delivery_note` VARCHAR(255) DEFAULT 'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5',
  `data_version` INT UNSIGNED NOT NULL DEFAULT 2,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `categories` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `products` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(190) NOT NULL,
  `description` TEXT,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `price_from` TINYINT(1) NOT NULL DEFAULT 0,
  `category_id` VARCHAR(64) NOT NULL,
  `image` MEDIUMTEXT DEFAULT NULL,
  `featured` TINYINT(1) NOT NULL DEFAULT 0,
  `slug` VARCHAR(190) NOT NULL,
  `size` VARCHAR(50) DEFAULT NULL,
  `promo_active` TINYINT(1) NOT NULL DEFAULT 0,
  `promo_price` DECIMAL(10,2) DEFAULT NULL,
  `promo_label` VARCHAR(120) DEFAULT NULL,
  `best_seller` TINYINT(1) NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `available` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Disponivel para pedido no site',
  `stock` INT DEFAULT NULL COMMENT 'NULL = sem controle de estoque',
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_products_slug` (`slug`),
  KEY `idx_products_category` (`category_id`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_flavors` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` VARCHAR(64) NOT NULL,
  `flavor` VARCHAR(190) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_pf_product` (`product_id`),
  CONSTRAINT `fk_pf_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_flavor_prices` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` VARCHAR(64) NOT NULL,
  `flavor` VARCHAR(190) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pfp` (`product_id`, `flavor`),
  CONSTRAINT `fk_pfp_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_images` (
  `filename` VARCHAR(255) NOT NULL,
  `mime` VARCHAR(80) NOT NULL DEFAULT 'image/jpeg',
  `data` LONGBLOB NOT NULL,
  `bytes` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `gallery` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `image` VARCHAR(500) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `clients` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(190) NOT NULL,
  `email` VARCHAR(190) DEFAULT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `address` VARCHAR(500) DEFAULT NULL,
  `loyalty_bonus` INT NOT NULL DEFAULT 0 COMMENT 'Pedidos fora do site (ajuste fidelidade)',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_clients_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `orders` (
  `id` VARCHAR(64) NOT NULL,
  `number` VARCHAR(40) NOT NULL,
  `client_id` VARCHAR(64) DEFAULT NULL,
  `client_name` VARCHAR(190) NOT NULL,
  `client_whatsapp` VARCHAR(30) DEFAULT NULL,
  `total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('novo','preparo','entrega','finalizado','cancelado') NOT NULL DEFAULT 'novo',
  `ordered_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_orders_number` (`number`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_client` (`client_id`),
  CONSTRAINT `fk_orders_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) DEFAULT NULL,
  `product_name` VARCHAR(190) NOT NULL,
  `flavor` VARCHAR(190) DEFAULT NULL,
  `qty` INT NOT NULL DEFAULT 1,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `idx_oi_order` (`order_id`),
  CONSTRAINT `fk_oi_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `finance` (
  `id` VARCHAR(64) NOT NULL,
  `type` ENUM('entrada','saida') NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `entry_date` DATE NOT NULL,
  `order_id` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_finance_date` (`entry_date`),
  KEY `idx_finance_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `coupons` (
  `id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `type` ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
  `value` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `min_order` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `label` VARCHAR(120) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coupons_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reviews` (
  `id` VARCHAR(64) NOT NULL,
  `author` VARCHAR(120) NOT NULL,
  `text` TEXT NOT NULL,
  `rating` TINYINT UNSIGNED DEFAULT 5,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `faq` (
  `id` VARCHAR(64) NOT NULL,
  `question` VARCHAR(255) NOT NULL,
  `answer` TEXT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------- DADOS INICIAIS ----------
-- Admin: admin@pipocandovv.com.br / pipoca123 (troque depois no painel)
INSERT INTO `admins` (`email`, `password_hash`) VALUES (
  'admin@pipocandovv.com.br',
  'pipoca123'
);

INSERT INTO `settings` (
  `id`, `name`, `tagline`, `logo`, `banner`, `sobre_image`, `whatsapp`,
  `instagram`, `instagram_user`, `facebook`, `email`, `address`, `hours`,
  `followers`, `posts`, `map_embed`, `hero_badge`, `hero_story`,
  `sobre_text1`, `sobre_text2`, `delivery_fee`, `delivery_note`, `data_version`
) VALUES (
  1,
  'Pipocando VV',
  'Pipocas Trufadas',
  '',
  'products/pipoca-g.jpg',
  '',
  '5527999634430',
  'https://www.instagram.com/pipocandovv',
  '@pipocandovv',
  '',
  'contato@pipocandovv.com.br',
  'Rua Burarama, 168, Cobilandia — Vila Velha, ES',
  'Seg a Sáb · 19h30 às 22h',
  '', '',
  '',
  'Pipocas trufadas · artesanais · Vila Velha, ES',
  JSON_OBJECT(
    'brandName', 'Pipocando',
    'brandAccent', 'VV',
    'brandSub', 'Pipocas Trufadas',
    'slogan', 'A pipoca que virou sobremesa!',
    'heroLine1', 'A pipoca que virou',
    'heroLine2Prefix', 'sobremesa mais',
    'heroWords', JSON_ARRAY('doce', 'especial', 'irresistível'),
    'heroCategories', 'Pipocas trufadas · artesanais · lembrancinhas',
    'placeShort', 'Cobilandia, Vila Velha',
    'siteUrl', 'https://pipocandovv.com.br/',
    'adminUrl', 'https://pipocandovv.com.br/admin/login.html',
    'whatsappOrderMsg', 'Olá! Quero pedir pipocas gourmet 🍿',
    'whatsappFloatMsg', 'Olá! Tenho uma dúvida 🍿'
  ),
  '',
  '',
  5.00,
  'Vila Velha R$ 5 · Vitória R$ 10 · Cariacica R$ 5',
  2
);

INSERT INTO `categories` (`id`, `name`, `slug`, `sort_order`) VALUES
('cat-pipocas', '🍿 Pipocas Trufadas', 'pipocas-trufadas', 0),
('cat-combos', 'Combos', 'combos', 1),
('cat-lembrancinhas', '🎀 Lembrancinhas', 'lembrancinhas', 2);

INSERT INTO `products` (
  `id`, `name`, `description`, `price`, `price_from`, `category_id`, `image`,
  `featured`, `slug`, `size`, `promo_active`, `promo_price`, `promo_label`,
  `best_seller`, `active`, `available`, `sort_order`
) VALUES
(
  'p-pipoca-p', 'Pipoca Trufada P',
  'Pote 250 ml com pipocas caramelizadas e cobertura generosa — escolha 1 sabor.',
  17.00, 0, 'cat-pipocas', 'products/pipoca-p.jpg',
  1, 'pipoca-trufada-p', '250ml', 0, NULL, '',
  1, 1, 1, 0
),
(
  'p-pipoca-m', 'Pipoca Trufada M',
  'Pote 500 ml dividido — escolha até 2 coberturas diferentes ou iguais.',
  26.00, 0, 'cat-pipocas', 'products/pipoca-m.jpg',
  1, 'pipoca-trufada-m', '500ml', 0, NULL, '',
  1, 1, 1, 1
),
(
  'p-pipoca-g', 'Pipoca Trufada G',
  'Pote 1 litro para compartilhar — até 2 coberturas no pote dividido.',
  50.00, 0, 'cat-pipocas', 'products/pipoca-g.jpg',
  1, 'pipoca-trufada-g', '1000ml', 0, NULL, '',
  1, 1, 1, 2
),
(
  'p-combo-dupla', 'Combo Dupla VV',
  '2 potes M com sabores à sua escolha — ideal para presentear.',
  48.00, 0, 'cat-combos', 'products/combo-dupla.jpg',
  1, 'combo-dupla-vv', '2×500ml', 1, 45.00, 'Promoção',
  0, 1, 1, 3
),
(
  'p-lembrancinha-vermelha', 'Lembrancinha Laço Vermelho',
  'Pacote com 20 unidades de 15 g cada. Inclui saquinho, adesivo personalizado e laço vermelho. Sob encomenda — prazo mínimo de 5 dias.',
  130.00, 0, 'cat-lembrancinhas', 'products/lembrancinha-vermelha.jpg',
  1, 'lembrancinha-laco-vermelho', '20×15g', 0, NULL, '',
  0, 1, 1, 4
),
(
  'p-lembrancinha-azul', 'Lembrancinha Laço Azul',
  'Pacote com 20 unidades de 15 g cada. Inclui saquinho, adesivo personalizado e laço azul. Sob encomenda — prazo mínimo de 5 dias.',
  110.00, 0, 'cat-lembrancinhas', 'products/lembrancinha-azul.jpg',
  1, 'lembrancinha-laco-azul', '20×15g', 0, NULL, '',
  0, 1, 1, 5
);

INSERT INTO `product_flavors` (`product_id`, `flavor`, `sort_order`) VALUES
('p-pipoca-p', 'Ninho', 0),
('p-pipoca-p', 'Choconuts', 1),
('p-pipoca-p', 'Cookie', 2),
('p-pipoca-p', 'Nutella', 3),
('p-pipoca-p', 'Bueno', 4),
('p-pipoca-m', 'Ninho', 0),
('p-pipoca-m', 'Choconuts', 1),
('p-pipoca-m', 'Cookie', 2),
('p-pipoca-m', 'Nutella', 3),
('p-pipoca-m', 'Bueno', 4),
('p-pipoca-g', 'Ninho', 0),
('p-pipoca-g', 'Choconuts', 1),
('p-pipoca-g', 'Cookie', 2),
('p-pipoca-g', 'Nutella', 3),
('p-pipoca-g', 'Bueno', 4),
('p-combo-dupla', 'Ninho', 0),
('p-combo-dupla', 'Choconuts', 1),
('p-combo-dupla', 'Cookie', 2),
('p-combo-dupla', 'Nutella', 3),
('p-combo-dupla', 'Bueno', 4);

INSERT INTO `gallery` (`image`, `sort_order`) VALUES
('products/galeria-1.jpg', 0),
('products/galeria-2.jpg', 1),
('products/galeria-3.jpg', 2),
('products/galeria-4.jpg', 3),
('products/lembrancinha-vermelha.jpg', 4),
('products/lembrancinha-azul.jpg', 5);

INSERT INTO `faq` (`id`, `question`, `answer`, `sort_order`) VALUES
(
  'faq-1',
  'Quantos sabores posso escolher?',
  'No tamanho P, 1 cobertura. Nos tamanhos M e G, até 2 coberturas — pode repetir ou combinar sabores diferentes.',
  0
),
(
  'faq-2',
  'Qual a base da pipoca?',
  'Trabalhamos com pipoca caramelizada ou caramelizada com Ninho — você escolhe na montagem do pedido.',
  1
),
(
  'faq-3',
  'Como funcionam as lembrancinhas?',
  'Vendemos em pacotes de 20 unidades de 15 g. O valor já inclui saquinho, adesivo personalizado e laço (vermelho ou azul). Sob encomenda — prazo mínimo de 5 dias. Consulte personalização no WhatsApp.',
  2
);

-- Fim — Pipocando VV
