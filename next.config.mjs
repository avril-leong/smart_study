/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['officeparser', 'pdf-parse'],
  },
};

export default nextConfig;
