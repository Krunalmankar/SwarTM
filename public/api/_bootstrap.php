<?php
/**
 * Shared, security-hardened helpers for the SwarTM form endpoints.
 *
 * This file is never served directly (blocked in api/.htaccess and guarded below).
 * Configuration lives OUTSIDE the public web root in `swartm-config.php`
 * (see deploy/swartm-config.sample.php). Requires PHP 8.1+ with mbstring.
 */

declare(strict_types=1);

if (!defined('SWARTM_ENDPOINT')) {
    http_response_code(404);
    exit;
}

// Never leak errors to visitors; they go to the server error log instead.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

const SWARTM_MAX_BODY_BYTES = 20000;
const SWARTM_UNAVAILABLE = 'The form is temporarily unavailable. Please try again later.';
const SWARTM_SERVER_ERROR = 'Something went wrong on our side. Please try again in a few minutes.';

/** Sends the response and stops. JSON for fetch(), a redirect for plain form posts. */
function swartm_respond(bool $ok, int $status, string $message, array $errors = []): never
{
    if (swartm_wants_json()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $payload = ['ok' => $ok, 'message' => $message];
        if ($errors) {
            $payload['errors'] = $errors;
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    // Plain HTML form post (JavaScript disabled): Post/Redirect/Get.
    header('Location: ' . ($ok ? '/thank-you/' : '/form-error/'), true, 303);
    exit;
}

function swartm_wants_json(): bool
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    return is_string($accept) && str_contains($accept, 'application/json');
}

/** Loads configuration from outside the web root. */
function swartm_config(): array
{
    $candidates = array_filter([
        getenv('SWARTM_CONFIG') ?: null,
        !empty($_SERVER['DOCUMENT_ROOT']) ? dirname((string) $_SERVER['DOCUMENT_ROOT']) . '/swartm-config.php' : null,
        dirname(__DIR__, 2) . '/swartm-config.php',
    ]);

    foreach ($candidates as $path) {
        if (is_file($path) && is_readable($path)) {
            $config = require $path;
            if (is_array($config)) {
                return swartm_validate_config($config);
            }
        }
    }

    error_log('[swartm] swartm-config.php not found outside the web root. See deploy/swartm-config.sample.php.');
    swartm_respond(false, 503, SWARTM_UNAVAILABLE);
}

function swartm_validate_config(array $config): array
{
    $config = array_merge([
        'mail_to' => '',
        'mail_from' => '',
        'mail_from_name' => 'Website',
        'allowed_origins' => [],
        'storage_dir' => '',
        'ip_salt' => '',
        'rate_limit_max' => 5,
        'rate_limit_window' => 900,
        'min_elapsed_ms' => 2500,
        'use_envelope_sender' => true,
    ], $config);

    $problems = [];
    foreach (['mail_to', 'mail_from'] as $key) {
        if (!is_string($config[$key]) || !filter_var($config[$key], FILTER_VALIDATE_EMAIL)) {
            $problems[] = $key;
        }
    }
    if (!is_array($config['allowed_origins']) || !$config['allowed_origins']) {
        $problems[] = 'allowed_origins';
    }
    if (!is_string($config['ip_salt']) || strlen($config['ip_salt']) < 32 || str_contains($config['ip_salt'], 'CHANGE-ME')) {
        $problems[] = 'ip_salt';
    }
    if (!is_string($config['storage_dir']) || $config['storage_dir'] === '') {
        $problems[] = 'storage_dir';
    }

    if ($problems) {
        error_log('[swartm] Invalid config values: ' . implode(', ', $problems));
        swartm_respond(false, 503, SWARTM_UNAVAILABLE);
    }

    return $config;
}

/** Request checks every endpoint runs first. */
function swartm_guard_request(array $config): void
{
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        http_response_code(405);
        exit;
    }

    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length <= 0 || $length > SWARTM_MAX_BODY_BYTES) {
        swartm_respond(false, 413, 'Your message is too long.');
    }

    if (!swartm_origin_allowed($config['allowed_origins'])) {
        swartm_respond(false, 403, 'This form can only be sent from our website.');
    }
}

/**
 * Cross-site request protection: browsers always send Origin on POST.
 * Falls back to Referer, and rejects requests that carry neither.
 */
function swartm_origin_allowed(array $allowed): bool
{
    $allowed = array_map(static fn ($o) => rtrim(strtolower((string) $o), '/'), $allowed);

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (is_string($origin) && $origin !== '' && $origin !== 'null') {
        return in_array(rtrim(strtolower($origin), '/'), $allowed, true);
    }

    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if (is_string($referer) && $referer !== '') {
        $parts = parse_url($referer);
        if (!empty($parts['scheme']) && !empty($parts['host'])) {
            $refOrigin = strtolower($parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : ''));
            return in_array($refOrigin, $allowed, true);
        }
    }

    return false;
}

/**
 * Reads one text field from the POST body as clean UTF-8.
 * Returns '' when missing, or null when it is not valid text or exceeds $maxLength.
 */
function swartm_field(string $name, int $maxLength, bool $multiline = false): ?string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value)) {
        return null;
    }
    if (!mb_check_encoding($value, 'UTF-8')) {
        return null;
    }

    $value = str_replace(["\r\n", "\r"], "\n", $value);
    // Strip control/invisible format characters; multi-line fields keep newlines and tabs.
    $value = $multiline
        ? preg_replace('/[^\P{C}\n\t]/u', '', $value)
        : preg_replace('/\p{C}/u', '', $value);
    $value = trim((string) $value);

    return mb_strlen($value, 'UTF-8') > $maxLength ? null : $value;
}

/** Spam heuristics. Callers give bots a fake success so they learn nothing. */
function swartm_is_spam(int $minElapsedMs): bool
{
    $honeypot = $_POST['website'] ?? '';
    if (!is_string($honeypot) || $honeypot !== '') {
        return true;
    }

    $elapsed = $_POST['elapsed_ms'] ?? '';
    return is_string($elapsed) && $elapsed !== '' && ctype_digit($elapsed) && (int) $elapsed < $minElapsedMs;
}

/** Private, writable storage directory outside the web root. */
function swartm_storage(array $config, string $sub = ''): string
{
    $dir = rtrim($config['storage_dir'], '/\\') . ($sub !== '' ? '/' . $sub : '');
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        error_log('[swartm] Cannot create storage directory.');
        swartm_respond(false, 500, SWARTM_SERVER_ERROR);
    }

    $docRoot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    $real = realpath($dir);
    if ($docRoot && $real && ($real === $docRoot || str_starts_with($real, $docRoot . DIRECTORY_SEPARATOR))) {
        error_log('[swartm] storage_dir must be outside the public web root.');
        swartm_respond(false, 500, SWARTM_SERVER_ERROR);
    }
    return $dir;
}

/**
 * Sliding-window rate limit per client and form. The IP is stored only as a
 * salted hash, and entries untouched for 24 hours are deleted.
 */
function swartm_rate_limit(array $config, string $bucket): void
{
    $dir = swartm_storage($config, 'ratelimit');
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $file = $dir . '/' . hash_hmac('sha256', $bucket . '|' . $ip, $config['ip_salt']) . '.json';
    $now = time();
    $window = max(60, (int) $config['rate_limit_window']);
    $max = max(1, (int) $config['rate_limit_max']);

    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        error_log('[swartm] Rate-limit storage not writable.');
        return; // Fail open rather than block genuine enquiries.
    }

    $limited = false;
    try {
        flock($handle, LOCK_EX);
        $raw = stream_get_contents($handle);
        $hits = json_decode(is_string($raw) && $raw !== '' ? $raw : '[]', true);
        $hits = is_array($hits)
            ? array_values(array_filter($hits, static fn ($t) => is_int($t) && $t > $now - $window))
            : [];

        if (count($hits) >= $max) {
            $limited = true;
        } else {
            $hits[] = $now;
            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, (string) json_encode($hits));
            fflush($handle);
        }
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }

    // Occasional clean-up of stale entries (about 1 in 50 requests).
    if (random_int(1, 50) === 1) {
        foreach (glob($dir . '/*.json') ?: [] as $old) {
            if (is_file($old) && filemtime($old) < $now - 86400) {
                @unlink($old);
            }
        }
    }

    if ($limited) {
        header('Retry-After: ' . $window);
        swartm_respond(false, 429, 'Too many attempts. Please wait a few minutes and try again.');
    }
}

/** Collapses anything that could break out of a mail header. */
function swartm_header_safe(string $value): string
{
    return trim((string) preg_replace('/[\x00-\x1F\x7F]+/', ' ', $value));
}

function swartm_encode_header(string $value, int $maxChars = 120): string
{
    $clean = mb_substr(swartm_header_safe($value), 0, $maxChars, 'UTF-8');
    return '=?UTF-8?B?' . base64_encode($clean) . '?=';
}

/** Sends a plain-text email through the host's mail transport. */
function swartm_send_mail(array $config, string $subject, string $body, ?string $replyTo = null): bool
{
    $from = swartm_header_safe($config['mail_from']);
    $headers = [
        'From: ' . swartm_encode_header((string) $config['mail_from_name'], 60) . ' <' . $from . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'X-Mailer: SwarTM-Website',
    ];
    if ($replyTo !== null && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $headers[] = 'Reply-To: ' . swartm_header_safe($replyTo);
    }

    $sent = mail(
        swartm_header_safe($config['mail_to']),
        swartm_encode_header($subject),
        wordwrap($body, 900, "\n", true),
        implode("\r\n", $headers),
        $config['use_envelope_sender'] ? '-f' . $from : ''
    );

    if (!$sent) {
        error_log('[swartm] mail() failed.');
    }
    return $sent;
}

/** Prevents spreadsheet formula injection when the CSV is opened in Excel. */
function swartm_csv_safe(string $value): string
{
    return preg_match('/^[=+\-@\t\r]/', $value) ? "'" . $value : $value;
}
