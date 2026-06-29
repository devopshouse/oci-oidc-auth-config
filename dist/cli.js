#!/usr/bin/env node
import './sourcemap-register.cjs';import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:crypto");
;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");
;// CONCATENATED MODULE: external "node:os"
const external_node_os_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:os");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");
;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:child_process");
;// CONCATENATED MODULE: ./src/core.ts





const CONFIG_KEYS = [
    'oci_idcs_endpoint',
    'oci_client_id',
    'oci_client_secret',
    'oci_region',
    'oci_tenancy_id',
    'oci_compartment_id'
];
const REQUIRED_CONFIG_KEYS = [...CONFIG_KEYS];
// Required keys for OCIR. ocir_registry is optional — derived from ocir_url when absent.
const OCIR_REQUIRED_INPUT_KEYS = ['ocir_username', 'ocir_password', 'ocir_url'];
// Map from canonical lowercase input key → uppercase OcirConfig field name.
const OCIR_KEY_MAP = {
    ocir_username: 'OCIR_USERNAME',
    ocir_password: 'OCIR_PASSWORD',
    ocir_url: 'OCIR_URL',
    ocir_registry: 'OCIR_REGISTRY'
};
/**
 * Derives the OCIR registry host from an OCIR URL that includes a namespace path.
 * e.g. "ocir.sa-saopaulo-1.oci.oraclecloud.com/myns" → "ocir.sa-saopaulo-1.oci.oraclecloud.com"
 */
function deriveOcirRegistry(url) {
    return url.split('/')[0];
}
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
function resolveOcirConfig(input) {
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
    const lookup = {};
    for (const [k, v] of Object.entries(values)) {
        if (typeof v === 'string' && v)
            lookup[k.toLowerCase()] = v;
    }
    for (const [k, v] of Object.entries(env)) {
        if (typeof v === 'string' && v)
            lookup[k.toLowerCase()] ??= v;
    }
    const present = [];
    const missing = [];
    const resolved = {};
    for (const inputKey of OCIR_REQUIRED_INPUT_KEYS) {
        const value = lookup[inputKey];
        if (value) {
            resolved[OCIR_KEY_MAP[inputKey]] = value;
            present.push(inputKey);
        }
        else {
            missing.push(inputKey);
        }
    }
    if (present.length === 0) {
        return undefined;
    }
    if (missing.length > 0) {
        throw new Error(`Partial OCIR configuration: missing ${missing.join(', ')}. Supply OCI_OIDC_CONFIG_B64, OCI_OIDC_CONFIG, or all three individual OCIR_* variables (ocir_username, ocir_password, ocir_url).`);
    }
    // ocir_registry is optional — derive from the URL when absent.
    resolved.OCIR_REGISTRY = lookup['ocir_registry'] ?? deriveOcirRegistry(resolved.OCIR_URL);
    return resolved;
}
function parseOcirConfigJson(rawJson, sourceLabel) {
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
    const present = [];
    const missing = [];
    // Build a case-insensitive key map so both "ocir_username" (Terraform module)
    // and "OCIR_USERNAME" (legacy) are accepted.
    const lc = {};
    for (const [k, v] of Object.entries(record)) {
        if (typeof v === 'string')
            lc[k.toLowerCase()] = v;
    }
    for (const inputKey of OCIR_REQUIRED_INPUT_KEYS) {
        const value = lc[inputKey];
        if (!value || value.trim() === '') {
            missing.push(inputKey);
        }
        else {
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
function resolveUnifiedConfig(input) {
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
        const token = (0,external_node_fs_namespaceObject.readFileSync)(file, 'utf8').trim();
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
    (0,external_node_fs_namespaceObject.mkdirSync)((0,external_node_path_namespaceObject.dirname)(file), { recursive: true });
    const lines = Object.entries(values).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
    (0,external_node_fs_namespaceObject.writeFileSync)(file, `${lines.join('\n')}\n`, { flag: 'a', mode: 0o600 });
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
function writeGithubEnv(values, env) {
    const githubEnv = env?.GITHUB_ENV ?? process.env.GITHUB_ENV;
    if (githubEnv) {
        writeFileSync(githubEnv, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'a' });
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

;// CONCATENATED MODULE: ./src/cli.ts

const logger = {
    info: (message) => console.log(message),
    warn: (message) => console.warn(`warning: ${message}`),
    error: (message) => console.error(`error: ${message}`),
    mask: (_value) => undefined
};
async function run() {
    const profile = process.env.OCI_PROFILE || 'DEFAULT';
    const { oci: config, ocir } = resolveUnifiedConfig({
        configJsonBase64: process.env.OCI_OIDC_CONFIG_B64,
        configJson: process.env.OCI_OIDC_CONFIG,
        env: process.env
    });
    const token = getGitlabOidcToken({ env: process.env, logger });
    const exchange = await exchangeOidcForUpst({ oidcToken: token, config, logger });
    const files = writeOciFiles({
        profile,
        config,
        upst: exchange.upst,
        privateKeyPem: exchange.privateKeyPem,
        fingerprint: exchange.fingerprint
    });
    const exports = {
        OCI_IDCS_ENDPOINT: config.oci_idcs_endpoint,
        OCI_CLIENT_ID: config.oci_client_id,
        OCI_CLIENT_SECRET: config.oci_client_secret,
        OCI_REGION: config.oci_region,
        OCI_TENANCY_ID: config.oci_tenancy_id,
        OCI_COMPARTMENT_ID: config.oci_compartment_id,
        OCI_PROFILE: profile,
        OCI_CLI_AUTH: 'security_token',
        PYTHONWARNINGS: 'ignore::SyntaxWarning'
    };
    if (ocir) {
        logger.mask(ocir.OCIR_PASSWORD);
        Object.assign(exports, ocir);
        if (process.env.OCIR_LOGIN !== 'false') {
            const { configPath, dockerConfigDir } = writeContainerAuth(ocir);
            exports.DOCKER_CONFIG = dockerConfigDir;
            exports.REGISTRY_AUTH_FILE = configPath; // podman / buildah honour this
            logger.info(`Container auth written to ${configPath} (DOCKER_CONFIG=${dockerConfigDir}).`);
        }
    }
    if (process.env.OCI_AUTH_ENV_FILE) {
        appendExports(process.env.OCI_AUTH_ENV_FILE, exports);
    }
    if (process.env.INSTALL_OCI_CLI !== 'false') {
        installOciCli(logger);
    }
    logger.info(`${files.configPath} and ${files.cliRcPath} written (profile: ${profile}, region: ${config.oci_region}).`);
}
run().catch((error) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});


//# sourceMappingURL=index.js.map