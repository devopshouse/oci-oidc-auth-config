# podman-oci — Alpine + Node 24 + OCI CLI + Podman
#
# Storage driver: native overlay via kernel idmap mounts (kernel 5.12+).
# The container rootfs in K8s/CRI-O is overlayfs; overlay-on-overlay is blocked
# by the kernel. Fix: graphroot points to /builds/podman-storage — GitLab Runner
# K8s executor mounts /builds as an emptyDir (ext4/xfs), not overlayfs.
# mount_program is empty to prevent fuse-overlayfs (/dev/fuse unavailable in OKE).
#
# Requirement: Kubernetes pod must have hostUsers: false (user namespaces).
# Add to the GitLab Runner config (runner-values.tpl or equivalent):
#   [[runners.kubernetes.pod_spec]]
#     name       = "user-namespaces"
#     patch_type = "merge"
#     patch      = '{"spec":{"hostUsers":false}}'
#
# Usage in GitLab CI:
#   image:
#     name: ghcr.io/devopshouse/oci-oidc-auth-config/podman-oci:v3
#     entrypoint: [""]
#   script:
#     - source <(curl -sSfL "$OCI_AUTH_BASE_URL/scripts/setup-gitlab.sh")
#     - docker build -t "$OCIR_URL/$IMAGE_NAME:$CI_COMMIT_SHA" .
#     - docker push "$OCIR_URL/$IMAGE_NAME:$CI_COMMIT_SHA"

FROM node:24-alpine

RUN apk add --no-cache \
      ca-certificates \
      curl \
      bash \
      python3 \
      py3-pip \
      podman \
 && apk add --no-cache --virtual .build-deps \
      cargo \
      gcc \
      musl-dev \
      libffi-dev \
      openssl-dev \
      python3-dev \
      make \
 && pip install --no-cache-dir --break-system-packages oci-cli \
 && apk del .build-deps \
 && printf '#!/bin/sh\ncmd="$1"; shift\ncase "$cmd" in\n  build) exec /usr/bin/podman build --isolation=chroot "$@" ;;\n  *)     exec /usr/bin/podman "$cmd" "$@" ;;\nesac\n' > /usr/local/bin/podman \
 && cp /usr/local/bin/podman /usr/local/bin/docker \
 && chmod +x /usr/local/bin/podman /usr/local/bin/docker

# Policy: accept any image (registry auth is handled by setup-gitlab.sh).
RUN mkdir -p /etc/containers \
 && printf '[storage]\ndriver = "overlay"\nrunroot = "/run/containers/storage"\ngraphroot = "/builds/podman-storage"\n\n[storage.options.overlay]\nmount_program = ""\n' \
    > /etc/containers/storage.conf \
 && printf '{"default":[{"type":"insecureAcceptAnything"}]}\n' \
    > /etc/containers/policy.json \
 && printf 'unqualified-search-registries = ["docker.io"]\n' \
    > /etc/containers/registries.conf

# setup-gitlab.sh writes $DOCKER_CONFIG/config.json; Podman respects this path.
ENV DOCKER_CONFIG=/root/.docker
