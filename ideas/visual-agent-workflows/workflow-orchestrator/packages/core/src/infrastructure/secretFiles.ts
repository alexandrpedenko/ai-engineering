import picomatch from "picomatch";

// Files that commonly hold credentials. Never opened or diffed through the
// orchestrator, and refused to Claude agents, even when they are project files.
export const SECRET_FILES = [
  "**/.env",
  "**/.env.*",
  "**/.envrc",
  "**/.npmrc",
  "**/.pypirc",
  "**/.netrc",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/id_rsa*",
  "**/id_dsa*",
  "**/id_ecdsa*",
  "**/id_ed25519*",
  "**/.ssh/**",
  "**/.aws/**",
  "**/.gnupg/**",
  "**/.git-credentials",
  "**/credentials.json",
  "**/service-account*.json",
  "**/*.tfvars",
  "**/*.tfstate",
  "**/*.tfstate.*",
  "**/.pgpass",
  "**/.kube/**",
  "**/.docker/config.json",
  "**/.vault-token",
  "**/*.keystore",
  "**/*.jks",
  "**/.htpasswd",
];

// Whether a "/"-separated relative path is a credential file. Case-insensitive:
// on macOS and Windows ".ENV" opens ".env".
export const isSecret: (path: string) => boolean = picomatch(SECRET_FILES, { dot: true, nocase: true });
