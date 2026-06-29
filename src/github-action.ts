import { writeFileSync } from 'node:fs';
import {
  exchangeOidcForUpst,
  getGithubOidcToken,
  installOciCli,
  resolveUnifiedConfig,
  writeContainerAuth,
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
  const { oci: config, ocir } = resolveUnifiedConfig({
    configJson: getInput('config_json') || undefined,
    ociValues: {
      oci_idcs_endpoint: getInput('oci_idcs_endpoint') || undefined,
      oci_client_id: getInput('oci_client_id') || undefined,
      oci_client_secret: getInput('oci_client_secret') || undefined,
      oci_region: getInput('oci_region') || undefined,
      oci_tenancy_id: getInput('oci_tenancy_id') || undefined,
      oci_compartment_id: getInput('oci_compartment_id') || undefined
    },
    ocirValues: {
      OCIR_USERNAME: getInput('ocir_username') || undefined,
      OCIR_PASSWORD: getInput('ocir_password') || undefined,
      OCIR_URL: getInput('ocir_url') || undefined,
      OCIR_REGISTRY: getInput('ocir_registry') || undefined
    }
  });

  for (const value of Object.values(config)) {
    logger.mask(value);
  }

  const oidcToken = await getGithubOidcToken({
    audience: getInput('oidc_audience') || 'https://cloud.oracle.com',
    logger
  });

  const exchange = await exchangeOidcForUpst({ oidcToken, config, logger });
  const files = writeOciFiles({
    profile: getInput('oci_profile') || 'DEFAULT',
    config,
    upst: exchange.upst,
    privateKeyPem: exchange.privateKeyPem,
    fingerprint: exchange.fingerprint
  });

  writeGithubEnv({
    OCI_CLI_AUTH: 'security_token',
    PYTHONWARNINGS: 'ignore::SyntaxWarning'
  });
  if (ocir) {
    logger.mask(ocir.OCIR_PASSWORD);
    writeGithubEnv(ocir);

    if (getInput('ocir_login') !== 'false') {
      const { configPath, dockerConfigDir } = writeContainerAuth(ocir);
      writeGithubEnv({ DOCKER_CONFIG: dockerConfigDir, REGISTRY_AUTH_FILE: configPath });
      logger.info(`Container auth written to ${configPath} (DOCKER_CONFIG=${dockerConfigDir}).`);
    }
  }

  installOciCli(logger);
  addPath(`${process.env.HOME}/.local/bin`);

  setOutput('oci_region', config.oci_region);
  setOutput('oci_tenancy_id', config.oci_tenancy_id);
  setOutput('oci_compartment_id', config.oci_compartment_id);
  setOutput('oci_idcs_endpoint', config.oci_idcs_endpoint);
  logger.info(`${files.configPath} and ${files.cliRcPath} written (profile: ${getInput('oci_profile') || 'DEFAULT'}, region: ${config.oci_region}).`);
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
