<?php
/**
 * SwarTM form configuration.
 *
 * 1. Copy this file to `swartm-config.php`.
 * 2. Upload it to your hosting account's HOME folder, ONE LEVEL ABOVE `public_html`
 *    (e.g. /home/<cpanel-user>/swartm-config.php). Never put it inside public_html.
 * 3. Fill in the values below.
 */

return [
    // Mailbox that receives enquiries and newsletter notifications.
    'mail_to' => 'hello@your-domain.com',

    // Sender address. Must be a mailbox on YOUR domain (create it in cPanel > Email Accounts),
    // otherwise messages are likely to be rejected as spam.
    'mail_from' => 'website@your-domain.com',
    'mail_from_name' => 'SwarTM Website',

    // Exact origins allowed to post the forms (scheme + host, no trailing slash).
    'allowed_origins' => [
        'https://www.your-domain.com',
        'https://your-domain.com',
    ],

    // Private folder for rate-limit data and newsletter sign-ups. Outside public_html.
    'storage_dir' => __DIR__ . '/swartm-data',

    // Long random secret used to hash IP addresses (at least 32 characters).
    // Generate one at https://www.random.org/strings/ or with: php -r "echo bin2hex(random_bytes(32));"
    'ip_salt' => 'CHANGE-ME-to-a-long-random-string-of-64-characters',

    // At most this many submissions per visitor per window (seconds).
    'rate_limit_max' => 5,
    'rate_limit_window' => 900,

    // Submissions faster than this after page load are treated as bots.
    'min_elapsed_ms' => 2500,

    // Pass the sender to sendmail with -f (improves deliverability on most cPanel hosts).
    // Set to false if your host rejects it.
    'use_envelope_sender' => true,
];
