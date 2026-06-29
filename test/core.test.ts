import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  appendExports,
  deriveOcirRegistry,
  exchangeOidcForUpst,
  generateRsaKeyPair,
  parseJwtPayload,
  resolveOciConfig,
  resolveOcirConfig,
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

const fullOcirConfig = {
  OCIR_USERNAME: 'myns/ocir-user',
  OCIR_PASSWORD: 'auth-token-value',
  OCIR_URL: 'ocir.sa-saopaulo-1.oci.oraclecloud.com/myns',
  OCIR_REGISTRY: 'ocir.sa-saopaulo-1.oci.oraclecloud.com'
};

describe('resolveOcirConfig', () => {
  it('returns undefined when no OCIR vars are present', () => {
    expect(resolveOcirConfig({ env: {} })).toBeUndefined();
  });

  it('parses OCIR_CONFIG_JSON_B64', () => {
    const configJsonBase64 = Buffer.from(JSON.stringify(fullOcirConfig)).toString('base64');
    expect(resolveOcirConfig({ configJsonBase64, env: {} })).toEqual(fullOcirConfig);
  });

  it('parses plain OCIR_CONFIG_JSON', () => {
    expect(resolveOcirConfig({ configJson: JSON.stringify(fullOcirConfig), env: {} })).toEqual(fullOcirConfig);
  });

  it('reads individual OCIR_* environment variables', () => {
    expect(
      resolveOcirConfig({
        env: {
          OCIR_USERNAME: fullOcirConfig.OCIR_USERNAME,
          OCIR_PASSWORD: fullOcirConfig.OCIR_PASSWORD,
          OCIR_URL: fullOcirConfig.OCIR_URL,
          OCIR_REGISTRY: fullOcirConfig.OCIR_REGISTRY
        }
      })
    ).toEqual(fullOcirConfig);
  });

  it('gives OCIR_CONFIG_JSON_B64 precedence over individual values', () => {
    const configJsonBase64 = Buffer.from(JSON.stringify(fullOcirConfig)).toString('base64');
    const result = resolveOcirConfig({
      configJsonBase64,
      values: { OCIR_REGISTRY: 'ocir.us-ashburn-1.oci.oraclecloud.com' }
    });
    expect(result?.OCIR_REGISTRY).toBe(fullOcirConfig.OCIR_REGISTRY);
  });

  it('gives OCIR_CONFIG_JSON precedence over individual values', () => {
    const result = resolveOcirConfig({
      configJson: JSON.stringify(fullOcirConfig),
      values: { OCIR_REGISTRY: 'ocir.us-ashburn-1.oci.oraclecloud.com' }
    });
    expect(result?.OCIR_REGISTRY).toBe(fullOcirConfig.OCIR_REGISTRY);
  });

  it('throws on partial individual OCIR_* variables', () => {
    expect(() =>
      resolveOcirConfig({ env: { OCIR_USERNAME: 'myns/ocir-user', OCIR_PASSWORD: 'token' } })
    ).toThrow(/Partial OCIR configuration/);
  });

  it('throws on invalid OCI_OIDC_CONFIG_B64 (OCIR path)', () => {
    expect(() => resolveOcirConfig({ configJsonBase64: 'bm90LWpzb24=', env: {} })).toThrow(
      /OCI_OIDC_CONFIG_B64 decoded value/
    );
  });

  it('throws on missing keys in OCI_OIDC_CONFIG (OCIR path)', () => {
    expect(() =>
      resolveOcirConfig({ configJson: JSON.stringify({ OCIR_USERNAME: 'x' }), env: {} })
    ).toThrow(/OCI_OIDC_CONFIG/);
  });

  // Terraform module (devopshouse/terraform-oci-oidc-federation) emits lowercase keys
  // and no ocir_registry — the action must accept this and derive the registry from the URL.

  it('accepts lowercase keys from Terraform module JSON output', () => {
    const moduleJson = JSON.stringify({
      ocir_username: fullOcirConfig.OCIR_USERNAME,
      ocir_password: fullOcirConfig.OCIR_PASSWORD,
      ocir_url: fullOcirConfig.OCIR_URL
    });
    const result = resolveOcirConfig({ configJson: moduleJson, env: {} });
    expect(result?.OCIR_USERNAME).toBe(fullOcirConfig.OCIR_USERNAME);
    expect(result?.OCIR_PASSWORD).toBe(fullOcirConfig.OCIR_PASSWORD);
    expect(result?.OCIR_URL).toBe(fullOcirConfig.OCIR_URL);
    expect(result?.OCIR_REGISTRY).toBe(fullOcirConfig.OCIR_REGISTRY); // derived from URL
  });

  it('derives OCIR_REGISTRY from URL when key is absent in JSON', () => {
    const result = resolveOcirConfig({
      configJson: JSON.stringify({
        ocir_username: 'myns/user',
        ocir_password: 'tok',
        ocir_url: 'ocir.us-ashburn-1.oci.oraclecloud.com/myns'
      }),
      env: {}
    });
    expect(result?.OCIR_REGISTRY).toBe('ocir.us-ashburn-1.oci.oraclecloud.com');
  });

  it('accepts lowercase individual environment variables', () => {
    const result = resolveOcirConfig({
      env: {
        ocir_username: fullOcirConfig.OCIR_USERNAME,
        ocir_password: fullOcirConfig.OCIR_PASSWORD,
        ocir_url: fullOcirConfig.OCIR_URL
      }
    });
    expect(result?.OCIR_USERNAME).toBe(fullOcirConfig.OCIR_USERNAME);
    expect(result?.OCIR_REGISTRY).toBe(fullOcirConfig.OCIR_REGISTRY); // derived
  });

  it('explicit ocir_registry in JSON takes precedence over derived value', () => {
    const result = resolveOcirConfig({
      configJson: JSON.stringify({
        ocir_username: 'myns/user',
        ocir_password: 'tok',
        ocir_url: 'ocir.us-ashburn-1.oci.oraclecloud.com/myns',
        ocir_registry: 'custom.registry.example.com'
      }),
      env: {}
    });
    expect(result?.OCIR_REGISTRY).toBe('custom.registry.example.com');
  });
});

const unifiedBlob = {
  ...fullConfig,
  ocir_username: 'myns/svc-ci-oidc-ocir',
  ocir_password: 'auth-token-value',
  ocir_url: 'ocir.sa-saopaulo-1.oci.oraclecloud.com/myns'
};

describe('resolveUnifiedConfig', () => {
  it('parses a unified blob and returns both oci and ocir', () => {
    const { oci, ocir } = resolveUnifiedConfig({ configJson: JSON.stringify(unifiedBlob), env: {} });
    expect(oci).toEqual(fullConfig);
    expect(ocir?.OCIR_USERNAME).toBe(unifiedBlob.ocir_username);
    expect(ocir?.OCIR_PASSWORD).toBe(unifiedBlob.ocir_password);
    expect(ocir?.OCIR_URL).toBe(unifiedBlob.ocir_url);
    expect(ocir?.OCIR_REGISTRY).toBe('ocir.sa-saopaulo-1.oci.oraclecloud.com'); // derived
  });

  it('parses a base64-encoded unified blob (OCI_OIDC_CONFIG_B64)', () => {
    const configJsonBase64 = Buffer.from(JSON.stringify(unifiedBlob)).toString('base64');
    const { oci, ocir } = resolveUnifiedConfig({ configJsonBase64, env: {} });
    expect(oci).toEqual(fullConfig);
    expect(ocir?.OCIR_USERNAME).toBe(unifiedBlob.ocir_username);
  });

  it('returns ocir=undefined when OCIR keys are absent from the blob', () => {
    const { oci, ocir } = resolveUnifiedConfig({ configJson: JSON.stringify(fullConfig), env: {} });
    expect(oci).toEqual(fullConfig);
    expect(ocir).toBeUndefined();
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
    const { oci, ocir } = resolveUnifiedConfig({ env });
    expect(oci).toEqual(fullConfig);
    expect(ocir).toBeUndefined();
  });

  it('throws on partial OCIR keys in blob', () => {
    const partialOcir = { ...fullConfig, ocir_username: 'myns/user' }; // missing password + url
    expect(() => resolveUnifiedConfig({ configJson: JSON.stringify(partialOcir), env: {} })).toThrow(
      /Missing required key\(s\)/
    );
  });
});

describe('deriveOcirRegistry', () => {
  it('strips the namespace path from an OCIR URL', () => {
    expect(deriveOcirRegistry('ocir.sa-saopaulo-1.oci.oraclecloud.com/myns')).toBe(
      'ocir.sa-saopaulo-1.oci.oraclecloud.com'
    );
  });

  it('returns the host unchanged when there is no path component', () => {
    expect(deriveOcirRegistry('ocir.us-ashburn-1.oci.oraclecloud.com')).toBe(
      'ocir.us-ashburn-1.oci.oraclecloud.com'
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

describe('writeContainerAuth', () => {
  it('writes auths[registry].auth as base64("user:pass")', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const result = writeContainerAuth(fullOcirConfig, { dockerConfigDir: dir });

    expect(result.dockerConfigDir).toBe(dir);
    expect(result.configPath).toBe(join(dir, 'config.json'));

    const cfg = JSON.parse(readFileSync(result.configPath, 'utf8')) as { auths: Record<string, { auth: string }> };
    expect(cfg.auths[fullOcirConfig.OCIR_REGISTRY]).toBeDefined();

    const decoded = Buffer.from(cfg.auths[fullOcirConfig.OCIR_REGISTRY].auth, 'base64').toString('utf8');
    expect(decoded).toBe(`${fullOcirConfig.OCIR_USERNAME}:${fullOcirConfig.OCIR_PASSWORD}`);
  });

  it('merges with existing config.json, preserving other auths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const existing = { auths: { 'other.registry.example.com': { auth: 'ZXhpc3Rpbmc=' } }, credsStore: 'osxkeychain' };
    const configPath = join(dir, 'config.json');
    require('node:fs').writeFileSync(configPath, JSON.stringify(existing));

    writeContainerAuth(fullOcirConfig, { dockerConfigDir: dir });

    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as typeof existing & { auths: Record<string, unknown> };
    expect(cfg.auths['other.registry.example.com']).toEqual({ auth: 'ZXhpc3Rpbmc=' });
    expect(cfg.auths[fullOcirConfig.OCIR_REGISTRY]).toBeDefined();
    expect(cfg.credsStore).toBe('osxkeychain');
  });

  it('writes mode 0600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const result = writeContainerAuth(fullOcirConfig, { dockerConfigDir: dir });
    const mode = statSync(result.configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('creates the directory if it does not exist', () => {
    const base = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const nested = join(base, 'sub', 'dir');
    const result = writeContainerAuth(fullOcirConfig, { dockerConfigDir: nested });
    const cfg = JSON.parse(readFileSync(result.configPath, 'utf8')) as { auths: Record<string, unknown> };
    expect(cfg.auths[fullOcirConfig.OCIR_REGISTRY]).toBeDefined();
  });

  it('recovers from malformed existing config.json and writes fresh', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oci-docker-'));
    const configPath = join(dir, 'config.json');
    require('node:fs').writeFileSync(configPath, 'not-json');

    writeContainerAuth(fullOcirConfig, { dockerConfigDir: dir });

    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as { auths: Record<string, unknown> };
    expect(cfg.auths[fullOcirConfig.OCIR_REGISTRY]).toBeDefined();
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
