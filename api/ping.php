<?php
/**
 * Health check ultraleve — sem MySQL, sem includes.
 * Usado para saber se a Hostinger liberou processos PHP.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');
echo '{"ok":true,"light":true,"ts":' . time() . '}';
