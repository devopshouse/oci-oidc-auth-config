import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

export type OciConfig = {
  oci_idcs_endpoint: string;
  oci_client_id: string;
  oci_client_secret: string;
  oci_region: string;
  oci_tenancy_id: string;
  oci_compartment_id: string;
};

export type OcirConfig = {
  OCIR_USERNAME: string;
  OCIR_PASSWORD: string;
  OCIR_URL: string;
  OCIR_REGISTRY: string;
};

export type Env = Record<string, string | undefined>;

export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  mask(value: string): void;
};

export type OciFiles = {
  configPath: string;
  cliRcPath: string;
  tokenPath: string;
  keyPath: string;
  fingerprint: string;
};

const CONFIG_KEYS: Array<keyof OciConfig> = [
  'oci_idcs_endpoint',
  'oci_client_id',
  'oci_client_secret',
  'oci_region',
  'oci_tenancy_id',
  'oci_compartment_id'
];

export const REQUIRED_CONFIG_KEYS = [...CONFIG_KEYS];

// Required keys for OCIR. ocir_registry is optional — derived from ocir_url when absent.
const OCIR_REQUIRED_INPUT_KEYS = ['ocir_username', 'ocir_password', 'ocir_url'] as const;

// Map from canonical lowercase input key → uppercase OcirConfig field name.
const OCIR_KEY_MAP: Record<string, keyof OcirConfig> = {
  ocir_username: 'OCIR_USERNAME',
  ocir_password: 'OCIR_PASSWORD',
  ocir_url: 'OCIR_URL',
  ocir_registry: 'OCIR_REGISTRY'
};

/**
 * Derives the OCIR registry host from an OCIR URL that includes a namespace path.
 * e.g. "ocir.sa-saopaulo-1.oci.oraclecloud.com/myns" → "ocir.sa-saopaulo-1.oci.oraclecloud.com"
 */
export function deriveOcirRegistry(url: string): string {
  return url.split('/')[0];
}

export function upperEnvName(key: string): string {
  return key.toUpperCase();
}

export function resolveOciConfig(input: {
  configJson?: string;
  configJsonBase64?: string;
  env?: Env;
  values?: Partial<OciConfig>;
}): OciConfig {
  const configJsonBase64 = input.configJsonBase64?.trim();
  if (configJsonBase64) {
    const decoded = Buffer.from(configJsonBase64, 'base64').toString('utf8');
    return parseConfigJson(decoded, 'OCI_OIDC_CONFIG_B64 decoded value');
  }

  const configJson = input.configJson?.trim();
  if (configJson) {
    return parseConfigJson(configJson, 'config_json');
  }

  const env = input.env ?? process.env;
  const values = input.values ?? {};
  const resolved = {} as OciConfig;
  const missing: string[] = [];

  for (const key of CONFIG_KEYS) {
    const value = values[key] ?? env[upperEnvName(key)];
    if (!value) {
      missing.push(`${key} (${upperEnvName(key)})`);
    } else {
      resolved[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required OCI parameter(s): ${missing.join(', ')}. Supply config_json/OCI_OIDC_CONFIG_B64 or all individual values.`
    );
  }

  return resolved;
}

export function resolveOcirConfig(input: {
  configJson?: string;
  configJsonBase64?: string;
  env?: Env;
  values?: Partial<OcirConfig>;
}): OcirConfig | undefined {
  const configJsonBase64 = input.configJsonBase64?.trim();
  if (configJsonBase64) {
    const decoded = Buffer.from(configJsonBase64, 'base64').toString('utf8');
    return parseOcirConfigJson(decoded, 'OCI_OIDC_CONFIG_B64 decoded value');
  }

  const configJson = input.configJson?.trim();
  if (configJson) {
    return parseOcirConfigJson(configJson, 'OCI_OIDC_CONFIG');
  }

  const env = input.env ?? process.env;
  const values = input.values ?? {};

  // Build a case-insensitive lookup from both values and env.
  // Both lowercase (from Terraform module) and UPPERCASE (legacy) keys are accepted.
  const lookup: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string' && v) lookup[k.toLowerCase()] = v;
  }
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string' && v) lookup[k.toLowerCase()] ??= v;
  }

  const present: string[] = [];
  const missing: string[] = [];
  const resolved = {} as OcirConfig;

  for (const inputKey of OCIR_REQUIRED_INPUT_KEYS) {
    const value = lookup[inputKey];
    if (value) {
      resolved[OCIR_KEY_MAP[inputKey]] = value;
      present.push(inputKey);
    } else {
      missing.push(inputKey);
    }
  }

  if (present.length === 0) {
    return undefined;
  }

  if (missing.length > 0) {
    throw new Error(
      `Partial OCIR configuration: missing ${missing.join(', ')}. Supply OCI_OIDC_CONFIG_B64, OCI_OIDC_CONFIG, or all three individual OCIR_* variables (ocir_username, ocir_password, ocir_url).`
    );
  }

  // ocir_registry is optional — derive from the URL when absent.
  resolved.OCIR_REGISTRY = lookup['ocir_registry'] ?? deriveOcirRegistry(resolved.OCIR_URL);

  return resolved;
}

function parseOcirConfigJson(rawJson: string, sourceLabel: string): OcirConfig | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`${sourceLabel} is not valid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a JSON object.`);
  }

  const record = parsed as Record<string, unknown>;
  const resolved = {} as OcirConfig;
  const present: string[] = [];
  const missing: string[] = [];

  // Build a case-insensitive key map so both "ocir_username" (Terraform module)
  // and "OCIR_USERNAME" (legacy) are accepted.
  const lc: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === 'string') lc[k.toLowerCase()] = v;
  }

  for (const inputKey of OCIR_REQUIRED_INPUT_KEYS) {
    const value = lc[inputKey];
    if (!value || value.trim() === '') {
      missing.push(inputKey);
    } else {
      resolved[OCIR_KEY_MAP[inputKey]] = value;
      present.push(inputKey);
    }
  }

  // No OCIR keys in blob — caller opted out of OCIR (e.g. no create_ocir_user).
  if (present.length === 0) {
    return undefined;
  }

  if (missing.length > 0) {
    throw new Error(`Missing required key(s) in ${sourceLabel}: ${missing.join(', ')}`);
  }

  // ocir_registry is optional — derive from the URL when absent.
  resolved.OCIR_REGISTRY = lc['ocir_registry']?.trim() || deriveOcirRegistry(resolved.OCIR_URL);

  return resolved;
}

function parseConfigJson(rawJson: string, sourceLabel: string): OciConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`${sourceLabel} is not valid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a JSON object.`);
  }

  const record = parsed as Record<string, unknown>;
  const resolved = {} as OciConfig;
  const missing: string[] = [];

  for (const key of CONFIG_KEYS) {
    const value = record[key];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
    } else {
      resolved[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required key(s) in ${sourceLabel}: ${missing.join(', ')}`);
  }

  return resolved;
}

/**
 * Resolves both OCI and OCIR configuration from a single unified JSON blob
 * (OCI_OIDC_CONFIG / OCI_OIDC_CONFIG_B64) or falls back to individual env vars.
 *
 * The unified blob is the output of the `terraform-oci-oidc-federation` module:
 * one flat object with both oci_* and ocir_* fields.
 *
 * OCIR fields are optional in the JSON path — if all three required keys
 * (ocir_username, ocir_password, ocir_url) are absent or empty, `ocir` is
 * undefined rather than an error. When using individual env vars and none of
 * the OCIR_* vars are set, `ocir` is also undefined.
 */
export function resolveUnifiedConfig(input: {
  configJson?: string;
  configJsonBase64?: string;
  env?: Env;
  ociValues?: Partial<OciConfig>;
  ocirValues?: Partial<OcirConfig>;
}): { oci: OciConfig; ocir: OcirConfig | undefined } {
  const configJsonBase64 = input.configJsonBase64?.trim();
  if (configJsonBase64) {
    const decoded = Buffer.from(configJsonBase64, 'base64').toString('utf8');
    const oci = parseConfigJson(decoded, 'OCI_OIDC_CONFIG_B64 decoded value');
    const ocir = parseOcirConfigJson(decoded, 'OCI_OIDC_CONFIG_B64 decoded value');
    return { oci, ocir };
  }

  const configJson = input.configJson?.trim();
  if (configJson) {
    const oci = parseConfigJson(configJson, 'config_json');
    const ocir = parseOcirConfigJson(configJson, 'config_json');
    return { oci, ocir };
  }

  // Fall back to individual env vars / explicit values
  const oci = resolveOciConfig({ env: input.env, values: input.ociValues });
  const ocir = resolveOcirConfig({ env: input.env, values: input.ocirValues });
  return { oci, ocir };
}

export function parseJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    throw new Error('OIDC token is not a valid JWT.');
  }

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const decoded = Buffer.from(padded, 'base64').toString('utf8');
  const parsed = JSON.parse(decoded) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OIDC token payload is not a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

export function logJwtSummary(token: string, logger: Logger): void {
  try {
    const payload = parseJwtPayload(token);
    logger.info(`OIDC issuer:   ${stringClaim(payload.iss)}`);
    logger.info(`OIDC audience: ${formatClaim(payload.aud)}`);
    logger.info(`OIDC subject:  ${stringClaim(payload.sub)}`);
  } catch (error) {
    logger.warn(`Unable to parse OIDC token payload for summary: ${(error as Error).message}`);
  }
}

export async function getGithubOidcToken(input: { audience: string; env?: Env; logger: Logger }): Promise<string> {
  const env = input.env ?? process.env;
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;

  if (!requestToken || !requestUrl) {
    throw new Error("GitHub OIDC variables not available. Ensure 'permissions: id-token: write' is set on the job.");
  }

  const separator = requestUrl.includes('?') ? '&' : '?';
  const response = await fetch(`${requestUrl}${separator}audience=${encodeURIComponent(input.audience)}`, {
    headers: { Authorization: `bearer ${requestToken}` }
  });

  if (!response.ok) {
    throw new Error(`GitHub OIDC token request failed with HTTP ${response.status}: ${await safeResponseText(response)}`);
  }

  const body = (await response.json()) as { value?: unknown };
  if (typeof body.value !== 'string' || body.value === '') {
    throw new Error('GitHub did not return an OIDC token.');
  }

  input.logger.mask(body.value);
  logJwtSummary(body.value, input.logger);
  return body.value;
}

export function getGitlabOidcToken(input: { env?: Env; logger: Logger }): string {
  const env = input.env ?? process.env;
  const file = env.CI_JOB_JWT_FILE;
  const directToken = env.OCI_OIDC_TOKEN;

  if (file) {
    const token = readFileSync(file, 'utf8').trim();
    if (!token) {
      throw new Error(`CI_JOB_JWT_FILE=${file} is empty.`);
    }
    input.logger.mask(token);
    logJwtSummary(token, input.logger);
    return token;
  }

  if (directToken) {
    input.logger.mask(directToken);
    logJwtSummary(directToken, input.logger);
    return directToken;
  }

  throw new Error('CI_JOB_JWT_FILE or OCI_OIDC_TOKEN is required for GitLab OIDC.');
}

export function generateRsaKeyPair(): { privateKeyPem: string; publicKeyPem: string; publicKeyBody: string; fingerprint: string } {
  const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  const publicKeyBody = keyPair.publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  const publicKeyDer = createPublicKey(keyPair.publicKey).export({ type: 'spki', format: 'der' }) as Buffer;
  const fingerprint = createHash('md5')
    .update(publicKeyDer)
    .digest('hex')
    .match(/.{2}/g)!
    .join(':');

  return { privateKeyPem: keyPair.privateKey, publicKeyPem: keyPair.publicKey, publicKeyBody, fingerprint };
}

export async function exchangeOidcForUpst(input: {
  oidcToken: string;
  config: Pick<OciConfig, 'oci_idcs_endpoint' | 'oci_client_id' | 'oci_client_secret'>;
  logger: Logger;
  maxAttempts?: number;
  retryBaseMs?: number;
}): Promise<{ upst: string; privateKeyPem: string; fingerprint: string }> {
  const keyPair = generateRsaKeyPair();
  const tokenUrl = `${input.config.oci_idcs_endpoint.replace(/\/+$/, '')}/oauth2/v1/token`;
  const maxAttempts = input.maxAttempts ?? 4;
  const retryBaseMs = input.retryBaseMs ?? 2000;
  let lastStatus = 0;
  let lastBody = '';

  input.logger.mask(input.config.oci_client_id);
  input.logger.mask(input.config.oci_client_secret);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requested_token_type: 'urn:oci:token-type:oci-upst',
      public_key: keyPair.publicKeyBody,
      subject_token: input.oidcToken,
      subject_token_type: 'jwt'
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${input.config.oci_client_id}:${input.config.oci_client_secret}`).toString('base64')}`
      },
      body
    });

    lastStatus = response.status;
    lastBody = await safeResponseText(response);

    if (response.ok) {
      const parsed = parseJsonObject(lastBody, 'OCI token exchange response');
      const upst = parsed.token ?? parsed.access_token;
      if (typeof upst !== 'string' || upst === '') {
        throw new Error(`OCI response did not include a UPST token: ${lastBody}`);
      }
      input.logger.mask(upst);
      return { upst, privateKeyPem: keyPair.privateKeyPem, fingerprint: keyPair.fingerprint };
    }

    if (attempt < maxAttempts) {
      const delayMs = attempt * retryBaseMs;
      input.logger.warn(`OCI token exchange failed with HTTP ${response.status} (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }

  throw new Error(`OCI token exchange failed with HTTP ${lastStatus} after ${maxAttempts} attempts: ${lastBody}`);
}

export function writeOciFiles(input: {
  home?: string;
  profile: string;
  config: Pick<OciConfig, 'oci_tenancy_id' | 'oci_region' | 'oci_compartment_id'>;
  upst: string;
  privateKeyPem: string;
  fingerprint?: string;
}): OciFiles {
  const home = input.home ?? homedir();
  const ociDir = join(home, '.oci');
  const tokenPath = join(ociDir, 'oci-upst');
  const keyPath = join(ociDir, 'upst_private_key.pem');
  const configPath = join(ociDir, 'config');
  const cliRcPath = join(ociDir, 'oci_cli_rc');

  mkdirSync(ociDir, { recursive: true, mode: 0o700 });
  chmodSync(ociDir, 0o700);

  writeFileSync(tokenPath, input.upst);
  chmodSync(tokenPath, 0o600);

  writeFileSync(keyPath, input.privateKeyPem);
  chmodSync(keyPath, 0o600);

  const fingerprint = input.fingerprint ?? fingerprintFromPrivateKey(input.privateKeyPem);

  writeFileSync(
    configPath,
    [
      `[${input.profile}]`,
      `tenancy=${input.config.oci_tenancy_id}`,
      `region=${input.config.oci_region}`,
      `key_file=${keyPath}`,
      `security_token_file=${tokenPath}`,
      `fingerprint=${fingerprint}`,
      ''
    ].join('\n')
  );
  chmodSync(configPath, 0o600);

  writeFileSync(cliRcPath, [`[${input.profile}]`, `compartment-id=${input.config.oci_compartment_id}`, ''].join('\n'));
  chmodSync(cliRcPath, 0o600);

  return { configPath, cliRcPath, tokenPath, keyPath, fingerprint };
}

export function appendExports(file: string, values: Record<string, string>): void {
  mkdirSync(dirname(file), { recursive: true });
  const lines = Object.entries(values).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
  writeFileSync(file, `${lines.join('\n')}\n`, { flag: 'a', mode: 0o600 });
}

export type ContainerAuthResult = {
  configPath: string;
  dockerConfigDir: string;
};

/**
 * Writes (or merges into) the standard container auth config file (~/.docker/config.json).
 * Supports docker, podman (via DOCKER_CONFIG / REGISTRY_AUTH_FILE), and kaniko
 * (set DOCKER_CONFIG=/kaniko/.docker before calling).
 *
 * The `auth` field is `base64("username:password")` — the same format produced by
 * `docker login`. The file is written with mode 0600. Existing entries in `auths` are
 * preserved (merge, not overwrite).
 */
export function writeContainerAuth(
  ocir: OcirConfig,
  opts?: { dockerConfigDir?: string }
): ContainerAuthResult {
  const dockerConfigDir = opts?.dockerConfigDir ?? process.env.DOCKER_CONFIG ?? join(homedir(), '.docker');
  const configPath = join(dockerConfigDir, 'config.json');

  mkdirSync(dockerConfigDir, { recursive: true });

  // Merge with any existing config.json to preserve other registry auths.
  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch {
      // Malformed JSON — start fresh rather than failing the whole job.
    }
  }

  const auth = Buffer.from(`${ocir.OCIR_USERNAME}:${ocir.OCIR_PASSWORD}`).toString('base64');
  const auths = (existing.auths as Record<string, unknown> | undefined) ?? {};
  auths[ocir.OCIR_REGISTRY] = { auth };

  const config = { ...existing, auths };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });

  return { configPath, dockerConfigDir };
}

export function installOciCli(logger: Logger): void {
  if (commandExists('oci')) {
    logger.info('OCI CLI is already available on PATH.');
    return;
  }

  const localOci = join(process.env.UV_TOOL_BIN_DIR || join(homedir(), '.local/bin'), 'oci');
  if (existsSync(localOci)) {
    logger.info(`OCI CLI is already available at ${localOci}.`);
    return;
  }

  if (!commandExists('curl')) {
    throw new Error('curl is required to install the OCI CLI with uv.');
  }

  logger.info('Installing uv and OCI CLI...');
  execFileSync('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { stdio: 'pipe' });

  const uv = join(homedir(), '.local/bin/uv');
  execFileSync(uv, ['tool', 'install', 'oci-cli'], {
    stdio: 'pipe',
    env: { ...process.env, PATH: `${join(homedir(), '.local/bin')}:${process.env.PATH ?? ''}` }
  });
}

export function writeGithubEnv(values: Record<string, string>, env?: Env): void {
  const githubEnv = env?.GITHUB_ENV ?? process.env.GITHUB_ENV;
  if (githubEnv) {
    writeFileSync(githubEnv, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'a' });
  }
}

function fingerprintFromPrivateKey(privateKeyPem: string): string {
  const publicKeyDer = createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'der' }) as Buffer;
  return createHash('md5').update(publicKeyDer).digest('hex').match(/.{2}/g)!.join(':');
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function parseJsonObject(text: string, description: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${description} is not valid JSON: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${description} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unreadable response body>';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringClaim(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function formatClaim(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(',');
  }
  return typeof value === 'string' ? value : '';
}
