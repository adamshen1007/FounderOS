const WINDOWS_PATH_PATTERN = /(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\[^\\\s]+)/u;
const POSIX_PHYSICAL_PATH_PATTERN =
  /(?:^|[\s([{'"=:;,])\/(?!\/)[^\s)\]}>'",;\\/]+(?:\/[^\s)\]}>'",;\\/]*)*/u;
const URL_PATTERN = /(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.)/iu;
const CREDENTIAL_PAIR_PATTERN =
  /(?:api[_ -]?key|access[_ -]?token|authorization|bearer|password|private[_ -]?key|client[_ -]?secret|credential)\s*[:=]\s*\S+/iu;
const CREDENTIAL_VALUE_PATTERN =
  /(?:\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b|\bgh[pousr]_[A-Za-z0-9]+\b|\bxox[baprs]-[A-Za-z0-9-]+\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:secret|token|password|credential)[_-](?:value|material)\b)/u;

const PROHIBITED_KEYS = new Set([
  "accesstoken",
  "agent",
  "agentruntime",
  "apikey",
  "apitoken",
  "apikeyvalue",
  "auth",
  "authorization",
  "authorizationheader",
  "authheader",
  "baseuri",
  "baseurl",
  "bearertoken",
  "callback",
  "callbackpayload",
  "client",
  "clientpayload",
  "clientsecret",
  "clock",
  "cookie",
  "credential",
  "credentialheader",
  "credentialpayload",
  "credentialvalue",
  "currenttime",
  "datenow",
  "dns",
  "dnshook",
  "dnsresolver",
  "endpoint",
  "endpointoverride",
  "endpointuri",
  "endpointurl",
  "env",
  "environment",
  "environmentdump",
  "environmentvariables",
  "envdump",
  "fetch",
  "function",
  "functionpayload",
  "gate",
  "gateartifact",
  "gateresult",
  "handler",
  "header",
  "headers",
  "healthevidence",
  "hermes",
  "hermesmessage",
  "httpclient",
  "httpsclient",
  "lowlevelgate",
  "lowlevelgateresult",
  "mcp",
  "mcppayload",
  "networkclient",
  "networkpayload",
  "now",
  "observabilitybundle",
  "observabilityevidence",
  "observabilityreadinessevidence",
  "password",
  "plaintextsecret",
  "prebuiltreadinessartifact",
  "prebuiltrequestplan",
  "privatekey",
  "processenv",
  "productionproviderreadinessdecision",
  "providerclient",
  "providerhealthevidence",
  "providerpayload",
  "providerrequestplan",
  "providerresponsemapping",
  "providersdk",
  "proxyauthorization",
  "random",
  "randomsource",
  "rawcredential",
  "rawheaders",
  "rawsecret",
  "rawtoken",
  "readinessdecision",
  "refreshtoken",
  "requestheaders",
  "requestplan",
  "responseheaders",
  "responsemapping",
  "responsemappingevidence",
  "rng",
  "secret",
  "secretbytes",
  "secretvalue",
  "sessiontoken",
  "setcookie",
  "signingkey",
  "socket",
  "socketfactory",
  "sockethook",
  "tlsclient",
  "tlshook",
  "token",
  "toolpayload",
  "uri",
  "url",
  "xapikey",
]);

const PROHIBITED_ARTIFACT_SIGNATURES = [
  ["readinessdecisionid", "decisionfingerprint"],
  ["requestplanid", "requestplanfingerprint"],
  ["mappingevidenceid", "mappingevidencefingerprint"],
  ["healthevidenceid", "healthfingerprint"],
  ["readinessevidenceid", "readinessfingerprint"],
] as const;

const LEGITIMATE_SENSITIVE_COMPOUND_KEYS = new Set([
  "acceptedproviderclasses",
  "credentialreferenceavailability",
  "credentialreferenceclass",
  "credentialreferencefingerprint",
  "credentialreferenceid",
  "environmentclass",
  "providercapabilityfingerprint",
  "providercapabilityid",
  "providercapacitystate",
  "providerclass",
  "providerfamilyreference",
  "secretstoreclass",
]);

/**
 * Captures a plain composition wrapper without reading any property value until
 * its complete own-key and descriptor shape has been accepted.
 */
export function captureExactOwnEnumerableDataDescriptors<Key extends string>(
  value: unknown,
  allowedKeys: readonly Key[],
): Readonly<Record<Key, PropertyDescriptor>> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) return null;
  const actualKeys = [...(ownKeys as string[])].sort();
  const expectedKeys = [...allowedKeys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of allowedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return null;
    }
  }
  return descriptors as Readonly<Record<Key, PropertyDescriptor>>;
}

function normalizedKey(key: string): string {
  return key
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}

function prohibitedKey(key: string): boolean {
  const normalized = normalizedKey(key);
  if (LEGITIMATE_SENSITIVE_COMPOUND_KEYS.has(normalized)) return false;
  const tokens = key
    .normalize("NFC")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/gu)
    .filter((token) => token.length > 0);
  const tokenSet = new Set(tokens);
  return (
    PROHIBITED_KEYS.has(normalized) ||
    tokens.some((token) =>
      [
        "callback",
        "client",
        "clock",
        "credential",
        "endpoint",
        "env",
        "environment",
        "function",
        "header",
        "headers",
        "network",
        "provider",
        "secret",
        "token",
        "url",
      ].includes(token),
    ) ||
    (tokenSet.has("time") && (tokenSet.has("source") || tokenSet.has("provider"))) ||
    (tokenSet.has("prebuilt") && tokenSet.has("artifact")) ||
    (tokenSet.has("transport") && tokenSet.has("plan")) ||
    (tokenSet.has("capability") && tokenSet.has("result")) ||
    /(?:callback|client|clock|credential|environment|function|headers?|network|provider|secret|token)/u.test(
      normalized,
    ) ||
    /(?:apikey|apitoken|authorizationheader|bearertoken|clientsecret|password|privatekey|rawcredential|rawheaders|rawsecret|rawtoken|refreshtoken|secretbytes|secretvalue|sessiontoken|signingkey)$/u.test(
      normalized,
    ) ||
    /(?:callback|client|dnshook|dnsresolver|endpoint|endpointoverride|endpointuri|endpointurl|sockethook|socketfactory|tlshook|uri|url)$/u.test(
      normalized,
    ) ||
    /(?:gateartifact|gateresult|healthevidence|observabilityevidence|observabilityreadinessevidence|readinessdecision|requestplan|responsemapping|responsemappingevidence)$/u.test(
      normalized,
    ) ||
    /(?:capabilityresult|transportplan)$/u.test(normalized)
  );
}

function unsafeString(value: string): boolean {
  return (
    WINDOWS_PATH_PATTERN.test(value) ||
    POSIX_PHYSICAL_PATH_PATTERN.test(value) ||
    URL_PATTERN.test(value) ||
    CREDENTIAL_PAIR_PATTERN.test(value) ||
    CREDENTIAL_VALUE_PATTERN.test(value)
  );
}

/**
 * Finds material that cannot be accepted at the dry-run readiness boundary.
 * Roots are passed separately so the authorized public field names themselves
 * are not confused with prohibited nested prebuilt artifacts.
 */
export function findProhibitedProductionProviderReadinessInputMaterial(
  roots: readonly (readonly [field: string, value: unknown])[],
): string | null {
  const pending = roots.map(([field, value]) => ({ path: field, value }));

  while (pending.length > 0) {
    const { path, value } = pending.pop()!;
    if (typeof value === "function") return path;
    if (typeof value === "string") {
      if (unsafeString(value)) return path;
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      value.forEach((child, index) => pending.push({ path: `${path}.${index}`, value: child }));
      continue;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.entries(descriptors)
      .filter(([, descriptor]) => descriptor.enumerable)
      .map(([key]) => key);
    const normalizedKeys = new Set(keys.map(normalizedKey));
    if (
      PROHIBITED_ARTIFACT_SIGNATURES.some(
        ([first, second]) => normalizedKeys.has(first) && normalizedKeys.has(second),
      )
    ) {
      return path;
    }

    for (const key of keys) {
      const descriptor = descriptors[key]!;
      const childPath = `${path}.${key}`;
      if (!("value" in descriptor) || prohibitedKey(key)) {
        return childPath;
      }
      pending.push({ path: childPath, value: descriptor.value });
    }
  }

  return null;
}
