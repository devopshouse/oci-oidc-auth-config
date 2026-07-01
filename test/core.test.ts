import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock node:child_process at the module level so ocirBearerLogin tests can
// control execFileSync without spawning real processes.
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0 }))
}));

import { execFileSync } from 'node:child_process';
import {
  REGION_KEY_MAP,
  appendExports,
  exchangeOidcForUpst,
  generateRsaKeyPair,
  ocirBearerLogin,
  parseJwtPayload,
  regionToRegistry,
  resolveOciConfig,
  resolveUnifiedConfig,
  writeContainerAuth,
  writeOciFiles
} from '../src/core.js';

const fullConfig = {
  oci_idcs_endpoint: 'https://idcs.example.com',
  oci_client_id: 'client-id',
  oci_client_secret: 'client-secret',
  oci_region: 'sa-saopaulo-1',
  oci_tenancy_id: 'ocid1.tenancy.oc1..example',
  oci_compartment_id: 'ocid1.compartment.oc1..example'
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  mask: vi.fn()
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveOciConfig', () => {
  it('parses config_json', () => {
    expect(resolveOciConfig({ configJson: JSON.stringify(fullConfig), env: {} })).toEqual(fullConfig);
  });

  it('parses OCI_CONFIG_JSON_B64', () => {
    const configJsonBase64 = Buffer.from(JSON.stringify(fullConfig)).toString('base64');
    expect(resolveOciConfig({ configJsonBase64, env: {} })).toEqual(fullConfig);
  });

  it('gives OCI_CONFIG_JSON_B64 precedence over individual values', () => {
    const configJsonBase64 = Buffer.from(JSON.stringify(fullConfig)).toString('base64');
    const resolved = resolveOciConfig({
      configJsonBase64,
      values: { oci_region: 'us-ashburn-1' }
    });
    expect(resolved.oci_region).toBe('sa-saopaulo-1');
  });

  it('gives config_json precedence over individual values', () => {
    const resolved = resolveOciConfig({
      configJson: JSON.stringify(fullConfig),
      values: { oci_region: 'us-ashburn-1' }
    });
    expect(resolved.oci_region).toBe('sa-saopaulo-1');
  });

  it('reads individual environment variables', () => {
    const resolved = resolveOciConfig({
      env: {
        OCI_IDCS_ENDPOINT: fullConfig.oci_idcs_endpoint,
        OCI_CLIENT_ID: fullConfig.oci_client_id,
        OCI_CLIENT_SECRET: fullConfig.oci_client_secret,
        OCI_REGION: fullConfig.oci_region,
        OCI_TENANCY_ID: fullConfig.oci_tenancy_id,
        OCI_COMPARTMENT_ID: fullConfig.oci_compartment_id
      }
    });
    expect(resolved).toEqual(fullConfig);
  });

  it('reports missing fields', () => {
    expect(() => resolveOciConfig({ configJson: JSON.stringify({ oci_region: 'sa-saopaulo-1' }) })).toThrow(
      /oci_idcs_endpoint/
    );
  });

  it('reports invalid OCI_OIDC_CONFIG_B64 payloads', () => {
    expect(() => resolveOciConfig({ configJsonBase64: 'not-base64', env: {} })).toThrow(
      /OCI_OIDC_CONFIG_B64 decoded value/
    );
  });
});

describe('resolveUnifiedConfig', () => {
  it('parses a unified blob (ocir_* keys ignored)', () => {
    const blob = { ...fullConfig, ocir_username: 'ignored', ocir_password: 'ignored', ocir_url: 'ignored' };
    const { oci } = resolveUnifiedConfig({ configJson: JSON.stringify(blob), env: {} });
    expect(oci).toEqual(fullConfig);
  });

  it('parses a base64-encoded unified blob (OCI_OIDC_CONFIG_B64)', () => {
    const configJsonBase64 = Buffer.from(JSON.stringify(fullConfig)).toString('base64');
    const { oci } = resolveUnifiedConfig({ configJsonBase64, env: {} });
    expect(oci).toEqual(fullConfig);
  });

  it('falls back to individual env vars when no JSON blob is provided', () => {
    const env = {
      OCI_IDCS_ENDPOINT: fullConfig.oci_idcs_endpoint,
      OCI_CLIENT_ID: fullConfig.oci_client_id,
      OCI_CLIENT_SECRET: fullConfig.oci_client_secret,
      OCI_REGION: fullConfig.oci_region,
      OCI_TENANCY_ID: fullConfig.oci_tenancy_id,
      OCI_COMPARTMENT_ID: fullConfig.oci_compartment_id
    };
    const { oci } = resolveUnifiedConfig({ env });
    expect(oci).toEqual(fullConfig);
  });

  it('throws when OCI keys are missing (ocir-only blob)', () => {
    expect(() =>
      resolveUnifiedConfig({
        configJson: JSON.stringify({ ocir_username: 'x', ocir_password: 'y', ocir_url: 'z' }),
        env: {}
      })
    ).toThrow(/Missing required/);
  });
});

describe('regionToRegistry', () => {
  it('maps known regions to <key>.ocir.io', () => {
    expect(regionToRegistry('sa-saopaulo-1')).toBe('gru.ocir.io');
    expect(regionToRegistry('us-ashburn-1')).toBe('iad.ocir.io');
    expect(regionToRegistry('eu-frankfurt-1')).toBe('fra.ocir.io');
    expect(regionToRegistry('ap-tokyo-1')).toBe('nrt.ocir.io');
    expect(regionToRegistry('uk-london-1')).toBe('lhr.ocir.io');
  });

  it('throws a descriptive error for unknown regions', () => {
    expect(() => regionToRegistry('xx-nowhere-1')).toThrow(/Unknown OCI region "xx-nowhere-1"/);
    expect(() => regionToRegistry('xx-nowhere-1')).toThrow(/Known regions:/);
  });

  it('covers all entries in REGION_KEY_MAP', () => {
    for (const region of Object.keys(REGION_KEY_MAP)) {
      expect(() => regionToRegistry(region)).not.toThrow();
      expect(regionToRegistry(region)).toMatch(/^[a-z]+\.ocir\.io$/);
    }
  });
});

describe('ocirBearerLogin', () => {
  const tmpDir = () => mkdtempSync(join(tmpdir(), 'oci-ocir-bearer-'));
  const execMock = vi.mocked(execFileSync);

  it('throws when region is unknown (no CLI call)', () => {
    expect(() => ocirBearerLogin({ region: 'xx-unknown-1', logger, dockerConfigDir: tmpDir() })).toThrow(
      /Unknown OCI region/
    );
    expect(execMock).not.toHaveBeenCalled();
  });

  it('writes BEARER_TOKEN auth to docker config', () => {
    const namespace = 'mytenancy';
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.test.sig';

    // First call: oci os ns get
    execMock.mockReturnValueOnce(Buffer.from(`${namespace}\n`) as unknown as string);
    // Second call: oci raw-request
    execMock.mockReturnValueOnce(
      Buffer.from(JSON.stringify({ data: { token: jwt } })) as unknown as string
    );

    const dockerConfigDir = tmpDir();
    const result = ocirBearerLogin({ region: 'sa-saopaulo-1', logger, dockerConfigDir });

    expect(result.OCIR_REGISTRY).toBe('gru.ocir.io');
    expect(result.OCIR_URL).toBe(`gru.ocir.io/${namespace}`);
    expect(result.DOCKER_CONFIG).toBe(dockerConfigDir);
    expect(result.REGISTRY_AUTH_FILE).toBe(join(dockerConfigDir, 'config.json'));

    const cfg = JSON.parse(readFileSync(join(dockerConfigDir, 'config.json'), 'utf8')) as {
      auths: Record<string, { auth: string }>;
    };
    const decoded = Buffer.from(cfg.auths['gru.ocir.io'].auth, 'base64').toString('utf8');
    expect(decoded).toBe(`BEARER_TOKEN:${jwt}`);
    expect(logger.mask).toHaveBeenCalledWith(jwt);
  });

  it('passes raw-request to correct registry endpoint', () => {
    execMock.mockReturnValueOnce(Buffer.from('myns\n') as unknown as string);
    execMock.mockReturnValueOnce(
      Buffer.from(JSON.stringify({ data: { token: 'tok' } })) as unknown as string
    );

    ocirBearerLogin({ region: 'us-ashburn-1', logger, dockerConfigDir: tmpDir() });

    const rawRequestCall = execMock.mock.calls[1];
    const args = rawRequestCall?.[1] as string[];
    expect(args).toContain('https://iad.ocir.io/20180419/docker/token');
  });

  it('throws when bearer token is missing from response data', () => {
    execMock.mockReturnValueOnce(Buffer.from('myns\n') as unknown as string);
    execMock.mockReturnValueOnce(Buffer.from(JSON.stringify({ data: {} })) as unknown as string);

    expect(() => ocirBearerLogin({ region: 'us-ashburn-1', logger, dockerConfigDir: tmpDir() })).toThrow(
      /OCIR bearer token not found/
    );
  });

  it('throws when response is missing a data object', () => {
    execMock.mockReturnValueOnce(Buffer.from('myns\n') as unknown as string);
    execMock.mockReturnValueOnce(Buffer.from(JSON.stringify({ status: '200 OK' })) as unknown as string);

    expect(() => ocirBearerLogin({ region: 'eu-frankfurt-1', logger, dockerConfigDir: tmpDir() })).toThrow(
      /missing a 'data' object/
    );
  });
});

describe('JWT parsing', () => {
  it('parses base64url payload without logging the token', () => {
    const payload = Buffer.from(JSON.stringify({ iss: 'issuer', aud: 'audience', sub: 'subject' })).toString('base64url');
    expect(parseJwtPayload(`header.${payload}.signature`)).toEqual({ iss: 'issuer', aud: 'audience', sub: 'subject' });
  });
});

describe('OCI files', () => {
  it('writes config, rc, token and private key files', () => {
    const home = mkdtempSync(join(tmpdir(), 'oci-auth-test-'));
    const keys = generateRsaKeyPair();
    const files = writeOciFiles({
      home,
      profile: 'TEST',
      config: fullConfig,
      upst: 'upst-token',
      privateKeyPem: keys.privateKeyPem,
      fingerprint: keys.fingerprint
    });

    expect(readFileSync(files.configPath, 'utf8')).toContain('[TEST]');
    expect(readFileSync(files.configPath, 'utf8')).toContain(`tenancy=${fullConfig.oci_tenancy_id}`);
    expect(readFileSync(files.cliRcPath, 'utf8')).toContain(`compartment-id=${fullConfig.oci_compartment_id}`);
    expect(readFileSync(files.tokenPath, 'utf8')).toBe('upst-token');
    expect(readFileSync(files.keyPath, 'utf8')).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('appends shell-safe exports', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'oci-auth-env-')), 'oci.env');
    appendExports(file, { OCI_CLIENT_SECRET: "foo'bar" });
    expect(readFileSync(file, 'utf8')).toBe("export OCI_CLIENT_SECRET='foo'\\''bar'\n");
  });
});

// OcirConfig shape used internally by writeContainerAuth.
const bearerOcirConfig = {
  OCIR_USERNAME: 'BEARER_TOKEN',
  OCIR_PASSWORD: 'eyJhbGciOiJSUzI1NiJ9.test.sig',
  OCIR_URL: 'gru.ocir.io/mytenancy',
  OCIR_REGISTRY: 'gru.ocir.io'
};

describe('writeContainerAuth', () => {
  it('writes auths[registry].auth as base64("user:pass")', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const result = writeContainerAuth(bearerOcirConfig, { dockerConfigDir: dir });

    expect(result.dockerConfigDir).toBe(dir);
    expect(result.configPath).toBe(join(dir, 'config.json'));

    const cfg = JSON.parse(readFileSync(result.configPath, 'utf8')) as { auths: Record<string, { auth: string }> };
    expect(cfg.auths[bearerOcirConfig.OCIR_REGISTRY]).toBeDefined();

    const decoded = Buffer.from(cfg.auths[bearerOcirConfig.OCIR_REGISTRY].auth, 'base64').toString('utf8');
    expect(decoded).toBe(`${bearerOcirConfig.OCIR_USERNAME}:${bearerOcirConfig.OCIR_PASSWORD}`);
  });

  it('merges with existing config.json, preserving other auths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const existing = { auths: { 'other.registry.example.com': { auth: 'ZXhpc3Rpbmc=' } }, credsStore: 'osxkeychain' };
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify(existing));

    writeContainerAuth(bearerOcirConfig, { dockerConfigDir: dir });

    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as typeof existing & { auths: Record<string, unknown> };
    expect(cfg.auths['other.registry.example.com']).toEqual({ auth: 'ZXhpc3Rpbmc=' });
    expect(cfg.auths[bearerOcirConfig.OCIR_REGISTRY]).toBeDefined();
    expect(cfg.credsStore).toBe('osxkeychain');
  });

  it('writes mode 0600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const result = writeContainerAuth(bearerOcirConfig, { dockerConfigDir: dir });
    const mode = statSync(result.configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('creates the directory if it does not exist', () => {
    const base = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const nested = join(base, 'sub', 'dir');
    const result = writeContainerAuth(bearerOcirConfig, { dockerConfigDir: nested });
    const cfg = JSON.parse(readFileSync(result.configPath, 'utf8')) as { auths: Record<string, unknown> };
    expect(cfg.auths[bearerOcirConfig.OCIR_REGISTRY]).toBeDefined();
  });

  it('recovers from malformed existing config.json and writes fresh', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, 'not-json');

    writeContainerAuth(bearerOcirConfig, { dockerConfigDir: dir });

    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as { auths: Record<string, unknown> };
    expect(cfg.auths[bearerOcirConfig.OCIR_REGISTRY]).toBeDefined();
  });
});

describe('exchangeOidcForUpst', () => {
  it('returns token from OCI token exchange response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'upst-token' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await exchangeOidcForUpst({
      oidcToken: 'oidc-token',
      config: fullConfig,
      logger,
      retryBaseMs: 1
    });

    expect(result.upst).toBe('upst-token');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports HTTP failures after retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })));

    await expect(
      exchangeOidcForUpst({
        oidcToken: 'oidc-token',
        config: fullConfig,
        logger,
        maxAttempts: 1,
        retryBaseMs: 1
      })
    ).rejects.toThrow(/HTTP 400/);
  });
});
