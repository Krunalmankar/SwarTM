<?php
/**
 * POST /api/subscribe.php
 * Stores a newsletter sign-up outside the web root and notifies the mailbox.
 */

declare(strict_types=1);

define('SWARTM_ENDPOINT', true);
require __DIR__ . '/_bootstrap.php';

$config = swartm_config();
swartm_guard_request($config);

// A quick autofill-and-click is normal for a one-field form, so the timing check is shorter.
if (swartm_is_spam(800)) {
    swartm_respond(true, 200, 'Subscribed. Thank you!');
}

swartm_rate_limit($config, 'newsletter');

$email = swartm_field('email', 254);
if ($email === null || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    swartm_respond(false, 422, 'Please enter a valid email address.', ['email' => 'Please enter a valid email address.']);
}

$email = mb_strtolower($email, 'UTF-8');
$file = swartm_storage($config) . '/newsletter-subscribers.csv';

$handle = @fopen($file, 'c+');
if ($handle === false) {
    error_log('[swartm] Newsletter storage not writable.');
    swartm_respond(false, 500, 'Something went wrong on our side. Please try again in a few minutes.');
}

$isNew = true;
try {
    flock($handle, LOCK_EX);
    while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
        if (isset($row[0]) && ltrim($row[0], "'") === $email) {
            $isNew = false;
            break;
        }
    }

    if ($isNew) {
        fseek($handle, 0, SEEK_END);
        if (ftell($handle) === 0) {
            fputcsv($handle, ['email', 'subscribed_at_utc'], ',', '"', '');
        }
        fputcsv($handle, [swartm_csv_safe($email), gmdate('c')], ',', '"', '');
        fflush($handle);
    }
} finally {
    flock($handle, LOCK_UN);
    fclose($handle);
}
@chmod($file, 0600);

if ($isNew) {
    swartm_send_mail(
        $config,
        'New newsletter subscriber',
        "A new subscriber joined the SwarTM newsletter:\n\n" . $email . "\n\nThe full list is stored in newsletter-subscribers.csv in the private storage folder."
    );
}

// Same response whether or not the address was already subscribed (no address enumeration).
swartm_respond(true, 200, 'Subscribed. Thank you!');
