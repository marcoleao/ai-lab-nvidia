import type { NextConfig } from 'next';
const config: NextConfig = {
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_BASE_URL || 'http://api:4100'}/api/:path*` }]; },
};
export default config;
