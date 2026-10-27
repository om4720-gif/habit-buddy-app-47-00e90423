type PushDb = {
  from: (table: string) => any;
};

const decodeBase64Url = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const encodeBase64Url = (value: Uint8Array): string => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const jsonBase64Url = (value: unknown) => encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));

async function createVapidAuthorization(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const publicBytes = decodeBase64Url(publicKey);
  const privateBytes = decodeBase64Url(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Invalid VAPID key format.");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: encodeBase64Url(publicBytes.slice(1, 33)),
      y: encodeBase64Url(publicBytes.slice(33, 65)),
      d: encodeBase64Url(privateBytes),
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
    new TextEncoder().encode(unsigned),
  );
  return "vapid t=" + unsigned + "." + encodeBase64Url(new Uint8Array(signature)) + ", k=" + publicKey;
}

/**
 * Sends a payload-free Web Push message so grade names and scores never appear on a locked phone.
 * The service worker turns the push event into a generic "new grade" notification.
 */
export async function sendGradePushNotifications(db: PushDb, userId: string) {
  const publicKey = process.env["GRADE_PUSH_VAPID_PUBLIC_KEY"]?.trim();
  const privateKey = process.env["GRADE_PUSH_VAPID_PRIVATE_KEY"]?.trim();
  const subject = process.env["GRADE_PUSH_VAPID_SUBJECT"]?.trim() || "https://habit-buddy-app-47.lovable.app";
  if (!publicKey || !privateKey) return { configured: false, sent: 0, failed: 0, expired: 0 };

  const { data: rows, error } = await db
    .from("grade_push_subscriptions")
    .select("endpoint")
    .eq("user_id", userId);
  if (error) throw new Error("Could not load phone notification subscriptions.");

  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  for (const row of (rows ?? []) as { endpoint: string }[]) {
    try {
      const endpoint = new URL(row.endpoint);
      if (endpoint.protocol !== "https:") {
        expired.push(row.endpoint);
        failed++;
        continue;
      }
      const authorization = await createVapidAuthorization(row.endpoint, publicKey, privateKey, subject);
      const response = await fetch(row.endpoint, {
        method: "POST",
        headers: {
          Authorization: authorization,
          TTL: "86400",
          Urgency: "high",
        },
      });
      if (response.status === 404 || response.status === 410) {
        expired.push(row.endpoint);
      } else if (response.ok) {
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  if (expired.length > 0) {
    await db
      .from("grade_push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", expired);
  }
  return { configured: true, sent, failed, expired: expired.length };
}
