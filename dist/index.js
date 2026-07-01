import './sourcemap-register.cjs';import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");
;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:crypto");
;// CONCATENATED MODULE: external "node:os"
const external_node_os_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:os");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");
;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:child_process");
;// CONCATENATED MODULE: ./src/core.ts





/**
 * Maps OCI region identifiers to their three-letter OCIR region keys.
 * Format: <region-key>.ocir.io
 * Source: https://docs.oracle.com/en-us/iaas/Content/Registry/Concepts/registryprerequisites.htm
 */
const REGION_KEY_MAP = {
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
function regionToRegistry(region) {
    const key = REGION_KEY_MAP[region];
    if (!key) {
        const known = Object.keys(REGION_KEY_MAP).sort().join(', ');
        throw new Error(`Unknown OCI region "${region}" — cannot derive OCIR registry host. ` +
            `Known regions: ${known}.`);
    }
    return `${key}.ocir.io`;
}
const CONFIG_KEYS = [
    'oci_idcs_endpoint',
    'oci_client_id',
    'oci_client_secret',
    'oci_region',
    'oci_tenancy_id',
    'oci_compartment_id'
];
const REQUIRED_CONFIG_KEYS = [...CONFIG_KEYS];
function upperEnvName(key) {
    return key.toUpperCase();
}
function resolveOciConfig(input) {
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
    const resolved = {};
    const missing = [];
    for (const key of CONFIG_KEYS) {
        const value = values[key] ?? env[upperEnvName(key)];
        if (!value) {
            missing.push(`${key} (${upperEnvName(key)})`);
        }
        else {
            resolved[key] = value;
        }
    }
    if (missing.length > 0) {
        throw new Error(`Missing required OCI parameter(s): ${missing.join(', ')}. Supply config_json/OCI_OIDC_CONFIG_B64 or all individual values.`);
    }
    return resolved;
}
function parseConfigJson(rawJson, sourceLabel) {
    let parsed;
    try {
        parsed = JSON.parse(rawJson);
    }
    catch (error) {
        throw new Error(`${sourceLabel} is not valid JSON: ${error.message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${sourceLabel} must be a JSON object.`);
    }
    const record = parsed;
    const resolved = {};
    const missing = [];
    for (const key of CONFIG_KEYS) {
        const value = record[key];
        if (typeof value !== 'string' || value.trim() === '') {
            missing.push(key);
        }
        else {
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
function resolveUnifiedConfig(input) {
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
function parseJwtPayload(token) {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) {
        throw new Error('OIDC token is not a valid JWT.');
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('OIDC token payload is not a JSON object.');
    }
    return parsed;
}
function logJwtSummary(token, logger) {
    try {
        const payload = parseJwtPayload(token);
        logger.info(`OIDC issuer:   ${stringClaim(payload.iss)}`);
        logger.info(`OIDC audience: ${formatClaim(payload.aud)}`);
        logger.info(`OIDC subject:  ${stringClaim(payload.sub)}`);
    }
    catch (error) {
        logger.warn(`Unable to parse OIDC token payload for summary: ${error.message}`);
    }
}
async function getGithubOidcToken(input) {
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
    const body = (await response.json());
    if (typeof body.value !== 'string' || body.value === '') {
        throw new Error('GitHub did not return an OIDC token.');
    }
    input.logger.mask(body.value);
    logJwtSummary(body.value, input.logger);
    return body.value;
}
function getGitlabOidcToken(input) {
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
function generateRsaKeyPair() {
    const keyPair = (0,external_node_crypto_namespaceObject.generateKeyPairSync)('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    const publicKeyBody = keyPair.publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
    const publicKeyDer = (0,external_node_crypto_namespaceObject.createPublicKey)(keyPair.publicKey).export({ type: 'spki', format: 'der' });
    const fingerprint = (0,external_node_crypto_namespaceObject.createHash)('md5')
        .update(publicKeyDer)
        .digest('hex')
        .match(/.{2}/g)
        .join(':');
    return { privateKeyPem: keyPair.privateKey, publicKeyPem: keyPair.publicKey, publicKeyBody, fingerprint };
}
async function exchangeOidcForUpst(input) {
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
function writeOciFiles(input) {
    const home = input.home ?? (0,external_node_os_namespaceObject.homedir)();
    const ociDir = (0,external_node_path_namespaceObject.join)(home, '.oci');
    const tokenPath = (0,external_node_path_namespaceObject.join)(ociDir, 'oci-upst');
    const keyPath = (0,external_node_path_namespaceObject.join)(ociDir, 'upst_private_key.pem');
    const configPath = (0,external_node_path_namespaceObject.join)(ociDir, 'config');
    const cliRcPath = (0,external_node_path_namespaceObject.join)(ociDir, 'oci_cli_rc');
    (0,external_node_fs_namespaceObject.mkdirSync)(ociDir, { recursive: true, mode: 0o700 });
    (0,external_node_fs_namespaceObject.chmodSync)(ociDir, 0o700);
    (0,external_node_fs_namespaceObject.writeFileSync)(tokenPath, input.upst);
    (0,external_node_fs_namespaceObject.chmodSync)(tokenPath, 0o600);
    (0,external_node_fs_namespaceObject.writeFileSync)(keyPath, input.privateKeyPem);
    (0,external_node_fs_namespaceObject.chmodSync)(keyPath, 0o600);
    const fingerprint = input.fingerprint ?? fingerprintFromPrivateKey(input.privateKeyPem);
    (0,external_node_fs_namespaceObject.writeFileSync)(configPath, [
        `[${input.profile}]`,
        `tenancy=${input.config.oci_tenancy_id}`,
        `region=${input.config.oci_region}`,
        `key_file=${keyPath}`,
        `security_token_file=${tokenPath}`,
        `fingerprint=${fingerprint}`,
        ''
    ].join('\n'));
    (0,external_node_fs_namespaceObject.chmodSync)(configPath, 0o600);
    (0,external_node_fs_namespaceObject.writeFileSync)(cliRcPath, [`[${input.profile}]`, `compartment-id=${input.config.oci_compartment_id}`, ''].join('\n'));
    (0,external_node_fs_namespaceObject.chmodSync)(cliRcPath, 0o600);
    return { configPath, cliRcPath, tokenPath, keyPath, fingerprint };
}
function appendExports(file, values) {
    mkdirSync(dirname(file), { recursive: true });
    const lines = Object.entries(values).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
    writeFileSync(file, `${lines.join('\n')}\n`, { flag: 'a', mode: 0o600 });
}
/**
 * Writes (or merges into) the standard container auth config file (~/.docker/config.json).
 * Supports docker, podman (via DOCKER_CONFIG / REGISTRY_AUTH_FILE), and kaniko
 * (set DOCKER_CONFIG=/kaniko/.docker before calling).
 *
 * The `auth` field is `base64("username:password")` — the same format produced by
 * `docker login`. The file is written with mode 0600. Existing entries in `auths` are
 * preserved (merge, not overwrite).
 */
function writeContainerAuth(ocir, opts) {
    const dockerConfigDir = opts?.dockerConfigDir ?? process.env.DOCKER_CONFIG ?? (0,external_node_path_namespaceObject.join)((0,external_node_os_namespaceObject.homedir)(), '.docker');
    const configPath = (0,external_node_path_namespaceObject.join)(dockerConfigDir, 'config.json');
    (0,external_node_fs_namespaceObject.mkdirSync)(dockerConfigDir, { recursive: true });
    // Merge with any existing config.json to preserve other registry auths.
    let existing = {};
    if ((0,external_node_fs_namespaceObject.existsSync)(configPath)) {
        try {
            existing = JSON.parse((0,external_node_fs_namespaceObject.readFileSync)(configPath, 'utf8'));
        }
        catch {
            // Malformed JSON — start fresh rather than failing the whole job.
        }
    }
    const auth = Buffer.from(`${ocir.OCIR_USERNAME}:${ocir.OCIR_PASSWORD}`).toString('base64');
    const auths = existing.auths ?? {};
    auths[ocir.OCIR_REGISTRY] = { auth };
    const config = { ...existing, auths };
    (0,external_node_fs_namespaceObject.writeFileSync)(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    return { configPath, dockerConfigDir };
}
function installOciCli(logger) {
    if (commandExists('oci')) {
        logger.info('OCI CLI is already available on PATH.');
        return;
    }
    const localOci = (0,external_node_path_namespaceObject.join)(process.env.UV_TOOL_BIN_DIR || (0,external_node_path_namespaceObject.join)((0,external_node_os_namespaceObject.homedir)(), '.local/bin'), 'oci');
    if ((0,external_node_fs_namespaceObject.existsSync)(localOci)) {
        logger.info(`OCI CLI is already available at ${localOci}.`);
        return;
    }
    if (!commandExists('curl')) {
        throw new Error('curl is required to install the OCI CLI with uv.');
    }
    logger.info('Installing uv and OCI CLI...');
    (0,external_node_child_process_namespaceObject.execFileSync)('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { stdio: 'pipe' });
    const uv = (0,external_node_path_namespaceObject.join)((0,external_node_os_namespaceObject.homedir)(), '.local/bin/uv');
    (0,external_node_child_process_namespaceObject.execFileSync)(uv, ['tool', 'install', 'oci-cli'], {
        stdio: 'pipe',
        env: { ...process.env, PATH: `${(0,external_node_path_namespaceObject.join)((0,external_node_os_namespaceObject.homedir)(), '.local/bin')}:${process.env.PATH ?? ''}` }
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
function ocirBearerLogin(input) {
    const registry = regionToRegistry(input.region);
    const localBin = (0,external_node_path_namespaceObject.join)((0,external_node_os_namespaceObject.homedir)(), '.local/bin');
    const ociEnv = {
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
    const nsRaw = (0,external_node_child_process_namespaceObject.execFileSync)('oci', ['os', 'ns', 'get', '--query', 'data', '--raw-output'], {
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
    const rawResponse = (0,external_node_child_process_namespaceObject.execFileSync)('oci', ['raw-request', '--http-method', 'GET', '--target-uri', `https://${registry}/20180419/docker/token`], { stdio: 'pipe', env: ociEnv }).toString();
    const parsed = parseJsonObject(rawResponse, 'OCIR bearer token response');
    const data = parsed['data'];
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`OCIR bearer token response is missing a 'data' object: ${rawResponse}`);
    }
    const bearerJwt = data['token'];
    if (typeof bearerJwt !== 'string' || !bearerJwt) {
        throw new Error(`OCIR bearer token not found in response 'data': ${rawResponse}`);
    }
    input.logger.mask(bearerJwt);
    const ocirConfig = {
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
function writeGithubEnv(values, env) {
    const githubEnv = env?.GITHUB_ENV ?? process.env.GITHUB_ENV;
    if (githubEnv) {
        (0,external_node_fs_namespaceObject.writeFileSync)(githubEnv, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'a' });
    }
}
function fingerprintFromPrivateKey(privateKeyPem) {
    const publicKeyDer = (0,external_node_crypto_namespaceObject.createPublicKey)((0,external_node_crypto_namespaceObject.createPrivateKey)(privateKeyPem)).export({ type: 'spki', format: 'der' });
    return (0,external_node_crypto_namespaceObject.createHash)('md5').update(publicKeyDer).digest('hex').match(/.{2}/g).join(':');
}
function commandExists(command) {
    const result = (0,external_node_child_process_namespaceObject.spawnSync)(command, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
}
function shellQuote(value) {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
function parseJsonObject(text, description) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (error) {
        throw new Error(`${description} is not valid JSON: ${error.message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${description} must be a JSON object.`);
    }
    return parsed;
}
async function safeResponseText(response) {
    try {
        return await response.text();
    }
    catch {
        return '<unreadable response body>';
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function stringClaim(value) {
    return typeof value === 'string' ? value : '';
}
function formatClaim(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item)).join(',');
    }
    return typeof value === 'string' ? value : '';
}

;// CONCATENATED MODULE: ./src/github-action.ts


const logger = {
    info: (message) => console.log(message),
    warn: (message) => console.warn(`::warning::${escapeWorkflowCommand(message)}`),
    error: (message) => console.error(`::error::${escapeWorkflowCommand(message)}`),
    mask: (value) => console.log(`::add-mask::${escapeWorkflowCommand(value)}`)
};
async function run() {
    const { oci: config } = resolveUnifiedConfig({
        configJson: getInput('config_json') || undefined,
        ociValues: {
            oci_idcs_endpoint: getInput('oci_idcs_endpoint') || undefined,
            oci_client_id: getInput('oci_client_id') || undefined,
            oci_client_secret: getInput('oci_client_secret') || undefined,
            oci_region: getInput('oci_region') || undefined,
            oci_tenancy_id: getInput('oci_tenancy_id') || undefined,
            oci_compartment_id: getInput('oci_compartment_id') || undefined
        }
    });
    for (const value of Object.values(config)) {
        logger.mask(value);
    }
    const oidcToken = await getGithubOidcToken({
        audience: getInput('oidc_audience') || 'https://cloud.oracle.com',
        logger
    });
    const profile = getInput('oci_profile') || 'DEFAULT';
    const exchange = await exchangeOidcForUpst({ oidcToken, config, logger });
    const files = writeOciFiles({
        profile,
        config,
        upst: exchange.upst,
        privateKeyPem: exchange.privateKeyPem,
        fingerprint: exchange.fingerprint
    });
    writeGithubEnv({
        OCI_CLI_AUTH: 'security_token',
        PYTHONWARNINGS: 'ignore::SyntaxWarning'
    });
    // OCI CLI must be on PATH before the bearer login step.
    installOciCli(logger);
    addPath(`${process.env.HOME}/.local/bin`);
    if (getInput('ocir_login') !== 'false') {
        const ocir = ocirBearerLogin({ region: config.oci_region, profile, logger });
        writeGithubEnv({
            OCIR_REGISTRY: ocir.OCIR_REGISTRY,
            OCIR_URL: ocir.OCIR_URL,
            DOCKER_CONFIG: ocir.DOCKER_CONFIG,
            REGISTRY_AUTH_FILE: ocir.REGISTRY_AUTH_FILE
        });
        setOutput('ocir_registry', ocir.OCIR_REGISTRY);
        setOutput('ocir_url', ocir.OCIR_URL);
    }
    setOutput('oci_region', config.oci_region);
    setOutput('oci_tenancy_id', config.oci_tenancy_id);
    setOutput('oci_compartment_id', config.oci_compartment_id);
    setOutput('oci_idcs_endpoint', config.oci_idcs_endpoint);
    logger.info(`${files.configPath} and ${files.cliRcPath} written (profile: ${profile}, region: ${config.oci_region}).`);
}
run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exitCode = 1;
});
function getInput(name) {
    return process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`]?.trim() ?? '';
}
function setOutput(name, value) {
    if (process.env.GITHUB_OUTPUT) {
        (0,external_node_fs_namespaceObject.writeFileSync)(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: 'a' });
    }
    else {
        console.log(`::set-output name=${name}::${escapeWorkflowCommand(value)}`);
    }
}
function addPath(path) {
    if (process.env.GITHUB_PATH) {
        (0,external_node_fs_namespaceObject.writeFileSync)(process.env.GITHUB_PATH, `${path}\n`, { flag: 'a' });
    }
    else {
        console.log(`::add-path::${escapeWorkflowCommand(path)}`);
    }
}
function escapeWorkflowCommand(value) {
    return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}


//# sourceMappingURL=index.js.map