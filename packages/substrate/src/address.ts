import type { SubstrateClient } from "./client.ts";
import { httpClient } from "./httpClient.ts";
import { noneClient } from "./noneClient.ts";

const HTTP_ADDRESS = /^https?:\/\//;

export function isValidSubstrateAddress(address: string): boolean {
  return address === "none" || HTTP_ADDRESS.test(address);
}

export function substrateClientFor(address: string, keyFile?: string): SubstrateClient {
  if (address === "none") return noneClient();
  return httpClient(address, keyFile);
}
