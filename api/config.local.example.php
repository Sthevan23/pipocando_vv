<?php
/**
 * Copie para config.local.php e preencha a senha do MySQL (hPanel Hostinger).
 *
 * No servidor: host = localhost
 * No PC (teste remoto): host = hostname do Remote MySQL no hPanel
 */
$httpHost = $_SERVER['HTTP_HOST'] ?? 'cli';
$isLocalDev = (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/i', $httpHost);
$remoteHost = 'COLOQUE_O_HOSTNAME_REMOTE_MYSQL_AQUI';

return [
  'host' => $isLocalDev ? $remoteHost : 'localhost',
  'port' => 3306,
  'name' => 'u586160337_pipocandovv',
  'user' => 'u586160337_pipocandovv',
  'pass' => 'COLOQUE_A_SENHA_DO_MYSQL_AQUI',
  'charset' => 'utf8mb4',
];
