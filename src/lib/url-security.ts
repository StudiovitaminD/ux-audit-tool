import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

function isPrivateAddress(host: string) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  const parts = normalized.split(".").map(Number);
  const privateV4 = isIP(normalized) === 4 && (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254));
  const privateV6 = isIP(normalized) === 6 && (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:"));
  return privateV4 || privateV6;
}

export function assertPublicHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are allowed.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "metadata.google.internal" || isPrivateAddress(host)) throw new Error("Private and internal hosts are not allowed.");
  return url;
}

export async function assertPublicHttpUrlResolved(value: string) {
  const url = assertPublicHttpUrl(value);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The URL resolves to a private or internal address.");
  }
  return url;
}
