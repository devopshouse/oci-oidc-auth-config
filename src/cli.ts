#!/usr/bin/env node
import {
  appendExports,
  exchangeOidcForUpst,
  getGitlabOidcToken,
  installOciCli,
  ocirBearerLogin,
  resolveUnifiedConfig,
  writeOciFiles
} from './core.js';

const logger = {
  info: (message: string) => console.log(message),
  warn: (message: string) => console.warn(`warning: ${message}`),
  error: (message: string) => console.error(`error: ${message}`),
  mask: (_value: string) => undefined
};

async function run(): Promise<void> {
  const profile = process.env.OCI_PROFILE || 'DEFAULT';
  const { oci: config } = resolveUnifiedConfig({
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

  const exports: Record<string, string> = {
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

  // OCI CLI must be on PATH before the bearer login step.
  if (process.env.INSTALL_OCI_CLI !== 'false') {
    installOciCli(logger);
  }

  if (process.env.OCIR_LOGIN !== 'false') {
    const ocir = ocirBearerLogin({ region: config.oci_region, profile, logger });
    exports.OCIR_REGISTRY = ocir.OCIR_REGISTRY;
    exports.OCIR_URL = ocir.OCIR_URL;
    exports.DOCKER_CONFIG = ocir.DOCKER_CONFIG;
    exports.REGISTRY_AUTH_FILE = ocir.REGISTRY_AUTH_FILE;
  }

  if (process.env.OCI_AUTH_ENV_FILE) {
    appendExports(process.env.OCI_AUTH_ENV_FILE, exports);
  }

  logger.info(`${files.configPath} and ${files.cliRcPath} written (profile: ${profile}, region: ${config.oci_region}).`);
}

run().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
