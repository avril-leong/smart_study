/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['officeparser', 'unpdf'],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals.push('officeparser', 'unpdf')
    }
    return config
  },
};

export default nextConfig;
