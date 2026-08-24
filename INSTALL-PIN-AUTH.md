# Confirmation PIN-Only Authentication Update

This update makes PIN the only account authentication method.

- The login page immediately asks for a 6-digit PIN.
- A complete PIN is checked automatically and opens its linked account.
- The separate Face Recognition, Temporary User, and Admin buttons are removed.
- Registration asks only for Name, Site, and a unique 6-digit PIN.
- The admin enters `135790` through the same PIN field.

Existing face-only accounts cannot log in after this update. Register those
people again with unique PINs.

## Replace the Files

Copy the files from this update into the matching paths in the Confirmation project:

```text
server.js
makeDb.js
dbCheck.js
pin-auth.sql
.env.example
src/App.jsx
src/styles.css
src/mobile.css
```

## Configure the Admin PIN and PIN Secret

Before rebuilding, add these values to the real `.env` file:

```env
ADMIN_PIN=135790
PIN_PEPPER=replace_with_a_long_random_secret_of_at_least_32_characters
PIN_MAX_ATTEMPTS=5
PIN_LOCKOUT_MINUTES=15
```

Generate a suitable secret in PowerShell:

```powershell
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

Copy the generated value after `PIN_PEPPER=`. Keep it private and do not change it after PIN accounts are registered. Changing it makes every existing PIN unusable.

Keep the real `.env` private. The admin enters `135790` in the same PIN field as
everyone else. That PIN is reserved for the admin and cannot be assigned to
another account; registration shows only `Pin cannot be used`.

## Rebuild

```powershell
docker compose down --remove-orphans
docker compose up -d --build --force-recreate
docker compose ps
```

The application runs `pin-auth.sql` automatically after the existing database schema files. It adds the authentication method and PIN hash columns without deleting existing users, records, machines, or images.

## Verify

```powershell
docker exec confirmation-app node dbCheck.js
```

Expected output includes:

```text
PIN authentication: ready
```

PIN values are never stored directly. The application stores a keyed hash,
enforces one account per PIN, and returns the same `Pin cannot be used` message
for unavailable, invalid, reserved, or duplicate PINs.
