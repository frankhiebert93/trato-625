/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent your site from being embedded in iframes (clickjacking)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stop browsers from guessing file types (MIME sniffing attacks)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Only send the origin in Referer header, not the full URL
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable access to camera/mic/location from third-party embeds
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Force HTTPS for 1 year (only active on production via HTTPS)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
