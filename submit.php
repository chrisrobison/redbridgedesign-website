<?php
/**
 * Red Bridge Design — submit.php
 * Logs contact form submissions to a text file and sends an email notification.
 */

// ── Config ──────────────────────────────────────────────────────────────────
define('TO_EMAIL',  'mike@redbridgedesign.com, mvargasdixon@gmail.com');
define('FROM_EMAIL', 'noreply@redbridgedesign.com');
define('FROM_NAME',  'Red Bridge Design Website');
define('LOG_FILE',   __DIR__ . '/submissions.log');

// ── Only accept POST requests ─────────────────────────────────────────────
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// ── Sanitize helpers ─────────────────────────────────────────────────────
function clean(string $value): string {
    return htmlspecialchars(strip_tags(trim($value)), ENT_QUOTES, 'UTF-8');
}

// Strip newlines from fields used in email headers to prevent injection
function clean_header(string $value): string {
    return preg_replace('/[\r\n]/', '', clean($value));
}

// ── Collect & sanitize fields ─────────────────────────────────────────────
$name             = clean_header($_POST['name']             ?? '');
$email            = clean_header($_POST['email']            ?? '');
$phone            = clean_header($_POST['phone']            ?? '');
$service          = clean_header($_POST['service']          ?? '');
$property_address = clean($_POST['property-address']        ?? '');
$project_size     = clean($_POST['project-size']            ?? '');
$message          = clean($_POST['message']                 ?? '');
$rush         = isset($_POST['rush']) ? 'Yes' : 'No';
$timestamp    = date('Y-m-d H:i:s T');
$ip           = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

// ── Basic server-side validation ──────────────────────────────────────────
$errors = [];
if (empty($name))                          $errors[] = 'Name is required.';
if (empty($email) || !filter_var($_POST['email'], FILTER_VALIDATE_EMAIL))
                                           $errors[] = 'Valid email is required.';
if (empty($service))                       $errors[] = 'Service is required.';
if (strlen($property_address) < 5)         $errors[] = 'Property address is required.';
if (strlen($message) < 10)                 $errors[] = 'Message is too short.';

if ($errors) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'errors' => $errors]);
    exit;
}

// ── Log to file ───────────────────────────────────────────────────────────
$log_entry  = str_repeat('-', 60) . PHP_EOL;
$log_entry .= "Submitted : {$timestamp}" . PHP_EOL;
$log_entry .= "IP        : {$ip}"        . PHP_EOL;
$log_entry .= "Name      : {$name}"      . PHP_EOL;
$log_entry .= "Email     : {$email}"     . PHP_EOL;
$log_entry .= "Phone     : {$phone}"     . PHP_EOL;
$log_entry .= "Service   : {$service}"   . PHP_EOL;
$log_entry .= "Address   : {$property_address}" . PHP_EOL;
$log_entry .= "Size/Scope: {$project_size}" . PHP_EOL;
$log_entry .= "Rush      : {$rush}"      . PHP_EOL;
$log_entry .= "Message   :" . PHP_EOL . $message . PHP_EOL;
$log_entry .= PHP_EOL;

file_put_contents(LOG_FILE, $log_entry, FILE_APPEND | LOCK_EX);

// ── Build email ───────────────────────────────────────────────────────────
$rush_line = ($rush === 'Yes') ? "\n*** RUSH TURNAROUND REQUESTED ***\n" : '';

$body = <<<TEXT
New project request from the Red Bridge Design website.
{$rush_line}
---------------------------------------------------------
Name      : {$name}
Email     : {$email}
Phone     : {$phone}
Service   : {$service}
Address   : {$property_address}
Size/Scope: {$project_size}
Rush      : {$rush}
---------------------------------------------------------
Message:
{$message}

---------------------------------------------------------
Submitted : {$timestamp}
IP        : {$ip}
TEXT;

// Address may contain HTML-encoded entities from clean() — decode for the subject line
$subject_address = html_entity_decode($property_address, ENT_QUOTES, 'UTF-8');
// Strip newlines defensively (header injection)
$subject_address = preg_replace('/[\r\n]+/', ' ', $subject_address);
$subject = ($rush === 'Yes' ? '[RUSH] ' : '')
         . "New Project Request from {$name} — {$subject_address}";

$headers  = "From: " . FROM_NAME . " <" . FROM_EMAIL . ">\r\n";
$headers .= "Reply-To: {$name} <{$email}>\r\n";
$headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

// ── Send email ────────────────────────────────────────────────────────────
$sent = mail(TO_EMAIL, $subject, $body, $headers);

// ── Respond to the browser ────────────────────────────────────────────────
if ($sent) {
    echo json_encode(['ok' => true]);
} else {
    // Submission was logged even if mail fails — not a total loss.
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Mail not sent — submission was logged.']);
}
