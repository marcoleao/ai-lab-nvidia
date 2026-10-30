import type { NextConfig } from 'next';
const config: NextConfig = {
  ...(process.env.REGRESSION_TEST_HOST === '1' ? { allowedDevOrigins: ['127.0.0.1'] } : {}),
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_BASE_URL || 'http://api:4100'}/api/:path*` }]; },
};
export default config;
