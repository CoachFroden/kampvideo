import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        {
          key: "Content-Security-Policy",
          // Kamprommet is embedded by CoachTool. CoachTool production/preview URLs
          // are served from Vercel, while the older hosts below are kept for
          // backwards compatibility with existing shortcuts.
          value: "frame-ancestors 'self' https://coachfroden.github.io https://samnanger-g14-f10a1.web.app https://samnanger-g14-f10a1.firebaseapp.com https://*.vercel.app",
        },
      ],
    }];
  },
};

export default nextConfig;
