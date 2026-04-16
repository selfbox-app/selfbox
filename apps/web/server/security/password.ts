import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_HASH_VERSION = 's1';
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function legacySha256(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function verifyScryptHash(password: string, storedHash: string): boolean {
  const [version, salt, expectedHash] = storedHash.split('$');

  if (version !== SCRYPT_HASH_VERSION || !salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString(
    'base64url',
  );

  return safeEqual(actualHash, expectedHash);
}

function verifyLegacyHash(password: string, storedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) {
    return false;
  }

  const actualHash = legacySha256(password);
  return safeEqual(actualHash, storedHash.toLowerCase());
}

export function hashLinkPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES).toString('base64url');
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString(
    'base64url',
  );

  return `${SCRYPT_HASH_VERSION}$${salt}$${hash}`;
}

export function verifyLinkPassword(
  password: string | undefined,
  storedHash: string | null,
): boolean {
  if (!password || !storedHash) {
    return false;
  }

  if (storedHash.startsWith(`${SCRYPT_HASH_VERSION}$`)) {
    return verifyScryptHash(password, storedHash);
  }

  return verifyLegacyHash(password, storedHash);
}
