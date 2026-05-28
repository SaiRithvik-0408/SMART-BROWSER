// SmartBrowser - password vault.
//
// Entries are persisted to disk with the password field encrypted via
// Electron's `safeStorage` API, which wraps the OS-level secret store:
//   - Windows: DPAPI (per-user master key, no extra setup)
//   - macOS:   Keychain
//   - Linux:   libsecret / kwallet (falls back to no-op if unavailable)
//
// safeStorage is only safe when `safeStorage.isEncryptionAvailable() === true`.
// On unsupported Linux setups we refuse to store passwords rather than write
// plaintext to disk.

const { safeStorage } = require('electron');
const { Store } = require('./store');

let store = null;
function ensure() {
  if (!store) store = new Store('passwords', { defaultValue: [] });
  return store;
}

function isAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function encrypt(plain) {
  if (!plain) return '';
  try { return safeStorage.encryptString(String(plain)).toString('base64'); }
  catch { return ''; }
}

function decrypt(encoded) {
  if (!encoded) return '';
  try {
    const buf = Buffer.from(encoded, 'base64');
    return safeStorage.decryptString(buf);
  } catch { return ''; }
}

// Return entries WITHOUT decrypting passwords (for the list view). Use
// `reveal()` to fetch a single password on demand.
function list() {
  const items = ensure().get() || [];
  return items.map(({ password, ...rest }) => ({ ...rest, hasPassword: !!password }));
}

function reveal(id) {
  if (!isAvailable()) return { error: 'OS encryption unavailable' };
  const items = ensure().get() || [];
  const it = items.find((x) => x.id === id);
  if (!it) return { error: 'Not found' };
  return { password: decrypt(it.password) };
}

function upsert({ id, site, username, password, notes }) {
  if (!site || !username) return { error: 'Site and username are required' };
  if (!isAvailable() && password) return { error: 'OS encryption unavailable - cannot store password securely' };
  const items = ensure().get() || [];
  const now = Date.now();
  const encrypted = password ? encrypt(password) : '';
  if (id) {
    const idx = items.findIndex((x) => x.id === id);
    if (idx >= 0) {
      items[idx] = {
        ...items[idx],
        site, username, notes: notes || '',
        password: password ? encrypted : items[idx].password,
        updatedAt: now,
      };
      ensure().set(items);
      return { id };
    }
  }
  const newId = `pw-${now}-${Math.random().toString(36).slice(2, 8)}`;
  items.push({ id: newId, site, username, password: encrypted, notes: notes || '', createdAt: now, updatedAt: now });
  ensure().set(items);
  return { id: newId };
}

function remove(id) {
  const items = ensure().get() || [];
  const next = items.filter((x) => x.id !== id);
  ensure().set(next);
  return { ok: true };
}

module.exports = { isAvailable, list, reveal, upsert, remove };
