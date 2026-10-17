import { createHash, createHmac } from "node:crypto";

/** Minimal AWS Signature Version 4 signer (used for the SES mail driver; no AWS SDK dependency). */

const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export type SignInput = {
  method: string;
  url: string;
  region: string;
  service: string;
  headers: Record<string, string>;
  body: string | Buffer;
  accessKeyId: string;
  secretAccessKey: string;
  /** ISO basic format, e.g. 20150830T123600Z. Defaults to now. */
  amzDate?: string;
};

export function amzDateOf(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export function canonicalRequest(input: SignInput, amzDate: string): { canonical: string; signedHeaders: string } {
  const url = new URL(input.url);
  const headers: Record<string, string> = { host: url.host, "x-amz-date": amzDate };
  for (const [k, v] of Object.entries(input.headers)) headers[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  const names = Object.keys(headers).sort();
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const path = url.pathname.split("/").map((seg) => encodeRfc3986(decodeURIComponent(seg))).join("/") || "/";
  const canonical = [
    input.method.toUpperCase(),
    path,
    query,
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    names.join(";"),
    sha256Hex(input.body),
  ].join("\n");
  return { canonical, signedHeaders: names.join(";") };
}

/** Returns the headers to send (input headers + host-independent x-amz-date + Authorization). */
export function signV4(input: SignInput): { headers: Record<string, string>; signature: string; canonicalHash: string } {
  const amzDate = input.amzDate ?? amzDateOf(new Date());
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const { canonical, signedHeaders } = canonicalRequest(input, amzDate);
  const canonicalHash = sha256Hex(canonical);
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, canonicalHash].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  return {
    signature,
    canonicalHash,
    headers: {
      ...input.headers,
      "x-amz-date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}
