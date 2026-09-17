import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Prisma خارجي حتى لا يدخل محركاتها حزمة Cloudflare (تُستخدم فقط على Node)
  serverExternalPackages: ["@prisma/client", ".prisma/client", "prisma"],
  // في التطوير: تمرير خدمة الوقت الحقيقي (wrangler dev على 3030) عبر نفس الأصل
  // على Cloudflare يستخدم العميل REALTIME_URL المطلق، وهذا المسار لا يُطلب
  async rewrites() {
    return [
      {
        source: "/rt/:path*",
        destination: "http://127.0.0.1:3030/:path*",
      },
    ];
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
