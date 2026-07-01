import { writeFileSync } from 'node:fs';
import {
  exchangeOidcForUpst,
  getGithubOidcToken,
  installOciCli,
  ocirBearerLogin,
  resolveUnifiedConfig,
  writeGithubEnv,
  writeOciFiles
} from './core.js';

const logger = {
  info: (message: string) => console.log(message),
  warn: (message: string) => console.warn(`::warning::${escapeWorkflowCommand(message)}`),
  error: (message: string) => console.error(`::error::${escapeWorkflowCommand(message)}`),
  mask: (value: string) => console.log(`::add-mask::${escapeWorkflowCommand(value)}`)
};

async function run(): Promise<void> {
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

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  process.exitCode = 1;
});

function getInput(name: string): string {
  return process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`]?.trim() ?? '';
}

function setOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: 'a' });
  } else {
    console.log(`::set-output name=${name}::${escapeWorkflowCommand(value)}`);
  }
}

function addPath(path: string): void {
  if (process.env.GITHUB_PATH) {
    writeFileSync(process.env.GITHUB_PATH, `${path}\n`, { flag: 'a' });
  } else {
    console.log(`::add-path::${escapeWorkflowCommand(path)}`);
  }
}

function escapeWorkflowCommand(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
