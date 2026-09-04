import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const repoName = 'images-badges';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isGitHubPages ? `/${repoName}` : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
