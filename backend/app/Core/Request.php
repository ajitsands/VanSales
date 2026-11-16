<?php
namespace App\Core;

class Request
{
    public array $user = [];
    public ?array $vendor = null;
    public array $params = [];
    private ?array $jsonBody = null;

    public function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public function path(): string
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $pos = strpos($uri, '?');
        if ($pos !== false) {
            $uri = substr($uri, 0, $pos);
        }
        return '/' . trim($uri, '/');
    }

    public function body(): array
    {
        if ($this->jsonBody === null) {
            $raw = file_get_contents('php://input');
            $decoded = json_decode($raw ?: '{}', true);
            $this->jsonBody = is_array($decoded) ? $decoded : [];
        }
        return $this->jsonBody;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    public function bearerToken(): ?string
    {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $auth = $headers['Authorization'] ?? $headers['authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
            return $m[1];
        }
        return null;
    }
}

