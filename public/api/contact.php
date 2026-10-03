<?php
/**
 * POST /api/contact.php
 * Validates a contact enquiry and emails it to the configured mailbox.
 */

declare(strict_types=1);

define('SWARTM_ENDPOINT', true);
require __DIR__ . '/_bootstrap.php';

$config = swartm_config();
swartm_guard_request($config);

// Bots get a fake success and nothing is sent.
if (swartm_is_spam((int) $config['min_elapsed_ms'])) {
    swartm_respond(true, 200, 'Thank you.');
}

swartm_rate_limit($config, 'contact');

$name = swartm_field('name', 100);
$email = swartm_field('email', 254);
$company = swartm_field('company', 150);
$interest = swartm_field('interest', 100);
$message = swartm_field('message', 4000, true);

$errors = [];
if ($name === null || $name === '') {
    $errors['name'] = 'Please enter your name (up to 100 characters).';
}
if ($email === null || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Please enter a valid email address.';
}
if ($company === null) {
    $errors['company'] = 'Company name is too long.';
}
if ($interest === null) {
    $errors['interest'] = 'Please choose an option.';
}
if ($message === null) {
    $errors['message'] = 'Your message is too long (4,000 characters maximum).';
} elseif (mb_strlen($message, 'UTF-8') < 10) {
    $errors['message'] = 'Please tell us a little more (at least 10 characters).';
}

if ($errors) {
    swartm_respond(false, 422, 'Please check the highlighted fields.', $errors);
}

$topic = $interest !== '' ? $interest : 'General';
$subject = sprintf('Website enquiry: %s from %s', $topic, $name);

$body = implode("\n", [
    'New enquiry from the SwarTM website contact form.',
    '',
    'Name:      ' . $name,
    'Email:     ' . $email,
    'Company:   ' . ($company !== '' ? $company : '-'),
    'Interest:  ' . $topic,
    'Received:  ' . gmdate('Y-m-d H:i') . ' UTC',
    '',
    'Message:',
    '--------',
    $message,
    '',
    '--',
    'Reply to this email to respond to the sender.',
]);

if (!swartm_send_mail($config, $subject, $body, $email)) {
    swartm_respond(false, 500, 'We could not send your message right now. Please try again in a few minutes.');
}

swartm_respond(true, 200, 'Thank you. We will reply within one working day.');
