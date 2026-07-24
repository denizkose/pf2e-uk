export const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function getRepositoryUrl(repository) {
  const raw = typeof repository === "string" ? repository : repository?.url;
  if (typeof raw !== "string") {
    throw new Error("package.json must define repository.url");
  }

  const url = raw.replace(/^git\+/, "").replace(/\.git$/, "");
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(url)) {
    throw new Error("repository.url must be an HTTPS GitHub repository URL");
  }
  return url;
}

export function getReleaseUrls({ repositoryUrl, moduleId, version }) {
  return {
    url: repositoryUrl,
    manifest: `${repositoryUrl}/releases/latest/download/module.json`,
    download: `${repositoryUrl}/releases/download/v${version}/${moduleId}-${version}.zip`,
    bugs: `${repositoryUrl}/issues`,
    changelog: `${repositoryUrl}/blob/main/CHANGELOG.md`,
  };
}
