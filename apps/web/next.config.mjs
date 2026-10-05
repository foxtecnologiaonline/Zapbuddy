/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@zapbuddy/core', '@zapbuddy/db'],
  webpack: (config) => {
    // packages/core e packages/db são TS fonte com imports relativos `.js`
    // (estilo ESM/NodeNext); o webpack precisa resolver esses specifiers para `.ts`.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
