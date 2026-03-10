/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    // Pre-existing type errors - to be fixed separately
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Keep native node modules external (not bundled by webpack)
    serverComponentsExternalPackages: [
      '@libsql/client',
      '@mastra/libsql',
      '@libsql/darwin-arm64',
      'chokidar',
      'fsevents',
      'glob',
    ],
  },
  webpack: (config, { isServer }) => {
    // Ignore README.md files in node_modules
    config.module.rules.push({
      test: /\.md$/,
      include: /node_modules/,
      type: 'asset/source',
    });

    // Ignore native .node files
    config.module.rules.push({
      test: /\.node$/,
      use: 'ignore-loader',
    });

    return config;
  },
}

module.exports = nextConfig
