<?php
namespace App\Core;

class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, callable|array $handler, array $middlewares = []): void
    {
        $regex = preg_replace('/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/', '(?P<$1>[^/]+)', $pattern);
        $this->routes[] = [
            'method'      => strtoupper($method),
            'regex'       => '#^' . $regex . '$#',
            'handler'     => $handler,
            'middlewares' => $middlewares,
        ];
    }

    public function dispatch(Request $request): void
    {
        $method = $request->method();
        $path = $request->path();

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            if (preg_match($route['regex'], $path, $matches)) {
                $params = [];
                foreach ($matches as $k => $v) {
                    if (is_string($k)) {
                        $params[$k] = $v;
                    }
                }
                $request->params = $params;

                foreach ($route['middlewares'] as $mw) {
                    $mw($request);
                }

                $handler = $route['handler'];
                if (is_array($handler)) {
                    [$class, $fn] = $handler;
                    $ctrl = new $class();
                    $ctrl->$fn($request);
                } else {
                    $handler($request);
                }
                return;
            }
        }

        Response::error('Route not found: ' . $method . ' ' . $path, 404);
    }
}

