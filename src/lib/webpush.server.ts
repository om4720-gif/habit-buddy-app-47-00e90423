// Server-only Web Push sender (RFC 8291 aes128gcm + VAPID), built on WebCrypto
// so it runs in the Cloudflare Worker runtime. Import dynamically inside
// handlers only — never at module scope of a client-reachable file.

const encoder = new TextEncoder();

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const jsonBase64Url = (value: unknown) =>
  bytesToBase64Url(encoder.encode(JSON.stringify(value)));

/** Creates the `vapid` Authorization header value for one push endpoint. */
export async function createVapidAuthorization(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string,
) {
  const publicBytes = base64UrlToBytes(publicKey);
  const privateBytes = base64UrlToBytes(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Invalid VAPID key format.");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(publicBytes.slice(1, 33)),
      y: bytesToBase64Url(publicBytes.slice(33, 65)),
      d: bytesToBase64Url(privateBytes),
      ext: true,
      key_ops: ["sign"],
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const audience = new URL(endpoint).origin;
  const header = jsonBase64Url({ typ: "JWT", alg: "ES256" });
  const claims = jsonBase64Url({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  });
  const unsigned = header + "." + claims;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(unsigned) as BufferSource,
  );
  return "vapid t=" + unsigned + "." + bytesToBase64Url(new Uint8Array(signature)) + ", k=" + publicKey;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Encrypts a payload for one subscription (RFC 8291, aes128gcm content coding). */
async function encryptAes128Gcm(payload: Uint8Array, p256dh: string, auth: string) {
  const userPublicKey = base64UrlToBytes(p256dh);
  const authSecret = base64UrlToBytes(auth);
  if (userPublicKey.length !== 65 || userPublicKey[0] !== 4) {
    throw new Error("Invalid subscription key format.");
  }

  const pair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const ephemeralPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: await crypto.subtle.importKey(
          "raw",
          userPublicKey as BufferSource,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          [],
        ),
      },
      pair.privateKey,
      256,
    ),
  );

  const webPushInfo = encoder.encode("WebPush: info");
  const ikmInput = new Uint8Array(webPushInfo.length + 1 + userPublicKey.length + ephemeralPublicKey.length);
  ikmInput.set(webPushInfo, 0);
  ikmInput.set([0], webPushInfo.length);
  ikmInput.set(userPublicKey, webPushInfo.length + 1);
  ikmInput.set(ephemeralPublicKey, webPushInfo.length + 1 + userPublicKey.length);
  const ikm = await hkdf(authSecret, sharedSecret, ikmInput, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  // RFC 8188: both info strings end with a 0x00 byte. Without it the device derives
  // different keys, can't decrypt the message, and silently drops it.
  const contentEncryptionKey = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // aes128gcm record: plaintext || 0x02 delimiter || zero padding. One small record.
  const record = new Uint8Array(payload.length + 1);
  record.set(payload, 0);
  record.set([2], payload.length);

  const cek = await crypto.subtle.importKey("raw", contentEncryptionKey as BufferSource, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, cek, record as BufferSource),
  );

  const header = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false); // rs
  header[20] = ephemeralPublicKey.length; // idlen (uint8)
  header.set(ephemeralPublicKey, 21);

  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header, 0);
  body.set(ciphertext, header.length);
  return body;
}

export type SendResult = { ok: boolean; expired: boolean; status: number; error?: string | undefined };

/** Sends one encrypted Web Push message to one subscription endpoint. */
export async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: PushPayload,
  vapid: VapidKeys,
): Promise<SendResult> {
  try {
    const body = await encryptAes128Gcm(encoder.encode(JSON.stringify(payload)), p256dh, auth);
    const authorization = await createVapidAuthorization(endpoint, vapid.publicKey, vapid.privateKey, vapid.subject);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        TTL: "86400",
        Urgency: "high",
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
      },
      body: body as BufferSource,
    });
    const error = response.ok
      ? undefined
      : (await response.text().catch(() => "")).slice(0, 300) || undefined;
    return {
      ok: response.ok,
      expired: response.status === 404 || response.status === 410,
      status: response.status,
      error,
    };
  } catch (error) {
    return {
      ok: false,
      expired: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
