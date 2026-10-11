import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const repoName = 'images-badges';
const basePath = isGitHubPages ? `/${repoName}` : '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: isGitHubPages ? `/${repoName}/` : '',
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
