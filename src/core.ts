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

// Internal shape used by writeContainerAuth.
type OcirConfig = {
  OCIR_USERNAME: string;
  OCIR_PASSWORD: string;
  OCIR_URL: string;
  OCIR_REGISTRY: string;
};

/** Result of a successful OCIR bearer login. Exported values for GITHUB_ENV / env.sh. */
export type OcirBearerResult = {
  OCIR_REGISTRY: string;
  OCIR_URL: string;
  DOCKER_CONFIG: string;
  REGISTRY_AUTH_FILE: string;
};

/**
 * Maps OCI region identifiers to their three-letter OCIR region keys.
 * Format: <region-key>.ocir.io
 * Source: https://docs.oracle.com/en-us/iaas/Content/Registry/Concepts/registryprerequisites.htm
 */
export const REGION_KEY_MAP: Readonly<Record<string, string>> = {
  'af-johannesburg-1': 'jnb',
  'ap-chiyoda-1': 'nja',
  'ap-chuncheon-1': 'yny',
  'ap-hyderabad-1': 'hyd',
  'ap-ibaraki-1': 'uky',
  'ap-melbourne-1': 'mel',
  'ap-mumbai-1': 'bom',
  'ap-osaka-1': 'kix',
  'ap-seoul-1': 'icn',
  'ap-singapore-1': 'sin',
  'ap-sydney-1': 'syd',
  'ap-tokyo-1': 'nrt',
  'ca-montreal-1': 'yul',
  'ca-toronto-1': 'yyz',
  'eu-amsterdam-1': 'ams',
  'eu-frankfurt-1': 'fra',
  'eu-madrid-1': 'mad',
  'eu-marseille-1': 'mrs',
  'eu-milan-1': 'lin',
  'eu-paris-1': 'cdg',
  'eu-stockholm-1': 'arn',
  'eu-zurich-1': 'zrh',
  'il-jerusalem-1': 'mtl',
  'me-abudhabi-1': 'auh',
  'me-dubai-1': 'dxb',
  'me-jeddah-1': 'jed',
  'me-riyadh-1': 'ruh',
  'mx-monterrey-1': 'mty',
  'mx-queretaro-1': 'qro',
  'sa-bogota-1': 'bog',
  'sa-santiago-1': 'scl',
  'sa-saopaulo-1': 'gru',
  'sa-vinhedo-1': 'vcp',
  'uk-cardiff-1': 'cwl',
  'uk-london-1': 'lhr',
  'us-ashburn-1': 'iad',
  'us-chicago-1': 'ord',
  'us-phoenix-1': 'phx',
  'us-saltlake-2': 'slc',
  'us-sanjose-1': 'sjc'
};

/**
 * Returns the OCIR registry host for the given region.
 * Throws a descriptive error if the region is not in the map.
 */
export function regionToRegistry(region: string): string {
  const key = REGION_KEY_MAP[region];
  if (!key) {
    const known = Object.keys(REGION_KEY_MAP).sort().join(', ');
    throw new Error(
      `Unknown OCI region "${region}" — cannot derive OCIR registry host. ` +
      `Known regions: ${known}.`
    );
  }
  return `${key}.ocir.io`;
}

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
 * Resolves OCI configuration from a single unified JSON blob
 * (OCI_OIDC_CONFIG / OCI_OIDC_CONFIG_B64) or falls back to individual env vars.
 *
 * The unified blob is the output of the `terraform-oci-oidc-federation` module.
 * Any ocir_* fields in the blob are intentionally ignored — OCIR login is now
 * performed via a short-lived bearer token derived from the UPST (see ocirBearerLogin).
 */
export function resolveUnifiedConfig(input: {
  configJson?: string;
  configJsonBase64?: string;
  env?: Env;
  ociValues?: Partial<OciConfig>;
}): { oci: OciConfig } {
  const configJsonBase64 = input.configJsonBase64?.trim();
  if (configJsonBase64) {
    const decoded = Buffer.from(configJsonBase64, 'base64').toString('utf8');
    return { oci: parseConfigJson(decoded, 'OCI_OIDC_CONFIG_B64 decoded value') };
  }

  const configJson = input.configJson?.trim();
  if (configJson) {
    return { oci: parseConfigJson(configJson, 'config_json') };
  }

  return { oci: resolveOciConfig({ env: input.env, values: input.ociValues }) };
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

/**
 * Logs in to OCIR using a short-lived bearer token derived from the active OCI UPST profile.
 *
 * Steps:
 *  1. Derives the OCIR registry host from `region` via REGION_KEY_MAP.
 *  2. Fetches the tenancy Object Storage namespace (`oci os ns get`).
 *  3. Obtains a short-lived Docker bearer token (`oci raw-request GET /20180419/docker/token`).
 *  4. Writes ~/.docker/config.json (or DOCKER_CONFIG) with the bearer credentials.
 *
 * The OCI CLI must be installed and the security-token profile written before calling.
 * All `oci` invocations use OCI_CLI_AUTH=security_token and the PATH that includes
 * ~/.local/bin so the CLI installed by installOciCli is reachable.
 */
export function ocirBearerLogin(input: {
  region: string;
  profile?: string;
  dockerConfigDir?: string;
  logger: Logger;
  /** Override the oci CLI executor — used in tests. Defaults to process.env. */
  ociEnvOverride?: Env;
}): OcirBearerResult {
  const registry = regionToRegistry(input.region);
  const localBin = join(homedir(), '.local/bin');
  const ociEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...(input.ociEnvOverride ?? {}),
    PATH: `${localBin}:${process.env.PATH ?? ''}`,
    OCI_CLI_AUTH: 'security_token',
    PYTHONWARNINGS: 'ignore::SyntaxWarning'
  };
  if (input.profile && input.profile !== 'DEFAULT') {
    ociEnv['OCI_CLI_PROFILE'] = input.profile;
  }

  input.logger.info(`Fetching OCIR namespace for registry ${registry}…`);
  const nsRaw = execFileSync('oci', ['os', 'ns', 'get', '--query', 'data', '--raw-output'], {
    stdio: 'pipe',
    env: ociEnv
  })
    .toString()
    .trim();
  if (!nsRaw) {
    throw new Error('oci os ns get returned an empty namespace.');
  }
  const namespace = nsRaw;
  const ocirUrl = `${registry}/${namespace}`;

  input.logger.info(`Fetching OCIR bearer token for ${registry}…`);
  const rawResponse = execFileSync(
    'oci',
    ['raw-request', '--http-method', 'GET', '--target-uri', `https://${registry}/20180419/docker/token`],
    { stdio: 'pipe', env: ociEnv }
  ).toString();

  const parsed = parseJsonObject(rawResponse, 'OCIR bearer token response');
  const data = parsed['data'];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`OCIR bearer token response is missing a 'data' object: ${rawResponse}`);
  }
  const bearerJwt = (data as Record<string, unknown>)['token'];
  if (typeof bearerJwt !== 'string' || !bearerJwt) {
    throw new Error(`OCIR bearer token not found in response 'data': ${rawResponse}`);
  }
  input.logger.mask(bearerJwt);

  const ocirConfig: OcirConfig = {
    OCIR_USERNAME: 'BEARER_TOKEN',
    OCIR_PASSWORD: bearerJwt,
    OCIR_URL: ocirUrl,
    OCIR_REGISTRY: registry
  };

  const { configPath, dockerConfigDir } = writeContainerAuth(ocirConfig, {
    dockerConfigDir: input.dockerConfigDir
  });

  input.logger.info(`OCIR bearer auth written to ${configPath} (registry: ${registry}, url: ${ocirUrl}).`);

  return {
    OCIR_REGISTRY: registry,
    OCIR_URL: ocirUrl,
    DOCKER_CONFIG: dockerConfigDir,
    REGISTRY_AUTH_FILE: configPath
  };
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
