# Changelog

## [2.0.0](https://github.com/devopshouse/oci-oidc-auth-config/compare/v1.0.4...v2.0.0) (2026-11-24)


### ✨ Features

* accept list(string) or list(object) for gitlab.projects ([8f554f3](https://github.com/devopshouse/oci-oidc-auth-config/commit/8f554f344c117d443fe5fdb71fc564d5a4b22181))
* add git, helm and kubectl to podman-oci image ([c624a47](https://github.com/devopshouse/oci-oidc-auth-config/commit/c624a471bac207ffa873e0157a1eeaf7441cbeeb))
* add podman-oci image for rootless Docker-compatible builds on GitLab K8s runners ([1e902cc](https://github.com/devopshouse/oci-oidc-auth-config/commit/1e902cc8a2ae43b95b763a7ac1a29440e34064e5))
* echo active branch or tag derived from OCI_AUTH_BASE_URL at startup ([a458a79](https://github.com/devopshouse/oci-oidc-auth-config/commit/a458a79965d794a3623965150c0e14de2e96f94f))
* install the OCI CLI in the CI images with uv ([a340c83](https://github.com/devopshouse/oci-oidc-auth-config/commit/a340c83022eaf9da4655cddf5f8bf65a9a468a26))
* log in to OCIR only when ocir_login is true ([c528d38](https://github.com/devopshouse/oci-oidc-auth-config/commit/c528d3843b8379183286ce3f33ffa6bd67e07754))
* migrate GitHub Action to TypeScript v2 and add GitLab CI support ([c3b391c](https://github.com/devopshouse/oci-oidc-auth-config/commit/c3b391c0f7f771165d1e5d95c89a6deb9db6b50c))
* per-project ref/ref_type overrides for gitlab and github ([4d3685d](https://github.com/devopshouse/oci-oidc-auth-config/commit/4d3685de26e467ae56c5c9fceddcd041cb763655))
* per-repo ref override and any-ref trust for github repositories ([f39b051](https://github.com/devopshouse/oci-oidc-auth-config/commit/f39b051590eb06734467f97c93026f5960d83d9a))
* replace OCIR static credentials with ephemeral bearer token ([7208ff1](https://github.com/devopshouse/oci-oidc-auth-config/commit/7208ff1149459367fde01ba039a25910cd88d766))
* select a service account from a config_json map ([19cfe9b](https://github.com/devopshouse/oci-oidc-auth-config/commit/19cfe9bbc00624b91e1c11fba06ab2970af71c07))
* tag the CI images with the tool version and build time ([84278c7](https://github.com/devopshouse/oci-oidc-auth-config/commit/84278c71b944a0b6f78c2cbd20e2a0721654e628))


### 🐛 Bug Fixes

* correct kaniko-oci image reference in gitlab-ci example ([fe4c60c](https://github.com/devopshouse/oci-oidc-auth-config/commit/fe4c60cc162570b8b55fd09ba9c90b1d98028229))
* echo OCI_OIDC_AUTH_VERSION directly instead of deriving from URL ([f8cf18e](https://github.com/devopshouse/oci-oidc-auth-config/commit/f8cf18ed1aff98605de1b5f526e6a3de9dd86eb9))
* log OCI auth version inside CLI, above OIDC issuer output ([7618844](https://github.com/devopshouse/oci-oidc-auth-config/commit/7618844edde1aa7a566449b9a06d27a8be62ee07))
* move OCI auth version echo outside subshell ([8f8e67e](https://github.com/devopshouse/oci-oidc-auth-config/commit/8f8e67efa46c40e0954c44afb585e04992b9e8ae))
* publish the CI images under the names the examples use ([fa66102](https://github.com/devopshouse/oci-oidc-auth-config/commit/fa661029763b59072f6c27d25f2842647549bf19))
* remove npm and upgrade Alpine packages in the CI images ([cfe72c4](https://github.com/devopshouse/oci-oidc-auth-config/commit/cfe72c48b7b88c62ec62c22fe015f1fad4f7a9bf))
* **scripts:** mark setup-kaniko-auth.sh as legacy and fail clearly without ocir_* credentials ([99e23c8](https://github.com/devopshouse/oci-oidc-auth-config/commit/99e23c8acfa5cd54b742ef5b65aef93824114476))
* support CI_JOB_JWT_V2 as fallback OIDC token source in setup-gitlab.sh ([ae5fab5](https://github.com/devopshouse/oci-oidc-auth-config/commit/ae5fab542d311d4f78486a8be363a8e485ae9a45))


### 📚 Documentation

* bump hashicorp/setup-terraform to v4 in the examples ([cd6212a](https://github.com/devopshouse/oci-oidc-auth-config/commit/cd6212a2b35466d58ca322886e1508c644a033cc))
* describe the OCIR bearer-token login and drop ocir_* from the JSON examples ([dfcd54b](https://github.com/devopshouse/oci-oidc-auth-config/commit/dfcd54b6275d7d403ba9f3ccc6b50cec91b73547))
* document ref=* wildcard behavior in tfvars example ([720e888](https://github.com/devopshouse/oci-oidc-auth-config/commit/720e888d22caf6ebd95c25d97d4c0472aa0ab8b5))
* **examples:** rewrite oci-oidc-configuration for terraform-oci-oidc-federation service_accounts ([5cdc1f8](https://github.com/devopshouse/oci-oidc-auth-config/commit/5cdc1f85fa914f3efbce8e9b86e1ededcb03c988))
* simplify the GitLab OCIR push example ([fa663dc](https://github.com/devopshouse/oci-oidc-auth-config/commit/fa663dcfc5308d3151f88967320fecf2b1313b70))


### 🔩 Miscellaneous

* ignore additional PLAN and HANDOFF markdown variants ([bef4e22](https://github.com/devopshouse/oci-oidc-auth-config/commit/bef4e22d85a191952b5dfa205f1a38d45672b5ef))

## [1.0.4](https://github.com/devopshouse/oci-oidc-auth-config/compare/v1.0.3...v1.0.4) (2026-04-20)


### 🐛 Bug Fixes

* inline composite sub-actions to remove relative path references ([b539cfc](https://github.com/devopshouse/oci-oidc-auth-config/commit/b539cfc049b694d7852335f21c2e975c2f3303d7))


## [1.0.3](https://github.com/devopshouse/oci-oidc-auth-config/compare/v1.0.2...v1.0.3) (2026-04-10)


### 🔩 Miscellaneous

* add CODEOWNERS ([41523f3](https://github.com/devopshouse/oci-oidc-auth-config/commit/41523f3003726e75d0e95bcedfb9fd0ca0558edc))

## [1.0.1](https://github.com/devopshouse/oci-oidc-auth-config/compare/v1.0.0...v1.0.1) (2026-04-10)


### 📚 Documentation

* fix misleading tip about OCI Vault in README ([2d82939](https://github.com/devopshouse/oci-oidc-auth-config/commit/2d829397742902f18712baeeb0327125f2d619c0))

## [1.1.3](https://github.com/devopshouse/oci-oidc-auth-config/compare/v1.1.2...v1.1.3) (2026-04-10)


### 🔩 Miscellaneous

* add MIT license ([adf222f](https://github.com/devopshouse/oci-oidc-auth-config/commit/adf222f87d50212d2958382dc3b910b3c02c848b))

## [1.1.2](https://github.com/devopshouse/oci-oidc-auth-config/compare/v1.1.1...v1.1.2) (2026-04-10)


### 🔧 CI/CD

* pin all GitHub Actions to SHA for supply chain security ([f6a320c](https://github.com/devopshouse/oci-oidc-auth-config/commit/f6a320c2eaaf88302212cc614b55dadc76d43f99))

## [1.1.1](https://github.com/devopshouse/oci-oidc-auth-config/compare/v1.1.0...v1.1.1) (2026-04-10)


### 🔩 Miscellaneous

* rename OCI CLI cache key to identify runner type ([76d14c4](https://github.com/devopshouse/oci-oidc-auth-config/commit/76d14c45b5812fd35fba3c4d2922e0e1768b8ff9))
* update release-please config and force release ([ebf8e26](https://github.com/devopshouse/oci-oidc-auth-config/commit/ebf8e26d643fa9d3affc6bc4cde528ab0f9e36ee))

## [1.1.0](https://github.com/devopshouse/oci-oidc-auth-config/compare/v1.0.0...v1.1.0) (2026-04-10)


### Features

* improve workflows ([6d3c010](https://github.com/devopshouse/oci-oidc-auth-config/commit/6d3c0107f8d4817be7fb41df94d5a324aecf1134))
