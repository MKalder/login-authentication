-- Delete expired verification-token
DELETE FROM email_verification_tokens WHERE expires_at < NOW();

-- Delete expired reset-token löschen
DELETE FROM password_reset_tokens WHERE expires_at < NOW();