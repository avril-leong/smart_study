/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['officeparser', 'pdf-parse'],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals.push('officeparser', 'pdf-parse')
    }
    return config
  },
};

export default nextConfig;
