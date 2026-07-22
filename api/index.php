<?php
declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$queryString = $_SERVER['QUERY_STRING'] ?? '';
$target = 'http://127.0.0.1:3001/api' . ($queryString !== '' ? '?' . $queryString : '');
$input = file_get_contents('php://input');
$headers = [];

if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        $lower = strtolower((string) $name);
        if ($lower === 'host' || $lower === 'content-length') {
            continue;
        }
        $headers[] = $name . ': ' . $value;
    }
}

$context = stream_context_create([
    'http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => ($input !== false && $input !== '') ? $input : null,
        'ignore_errors' => true,
        'timeout' => 30
    ]
]);

$responseBody = @file_get_contents($target, false, $context);
$responseHeaders = $http_response_header ?? [];

if ($responseBody === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'error' => 'No se pudo conectar con el backend local'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$statusCode = 200;
foreach ($responseHeaders as $headerLine) {
    if (preg_match('/^HTTP\/\S+\s+(\d+)/', $headerLine, $match)) {
        $statusCode = (int) $match[1];
        continue;
    }

    [$name, $value] = array_pad(explode(':', $headerLine, 2), 2, '');
    $name = trim($name);
    $value = trim($value);
    if ($name !== '' && $value !== '') {
        header($name . ': ' . $value, false);
    }
}

http_response_code($statusCode);
echo $responseBody;
