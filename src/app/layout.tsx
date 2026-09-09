import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "شطرنج الملوك — لعبة شطرنج كاملة ضد الذكاء الاصطناعي وأونلاين",
  description:
    "لعبة شطرنج كاملة بجميع القوانين: العب ضد الوزير (ذكاء اصطناعي يعلق على نقلاتك)، أو تحدَّ لاعبين حقيقيين أونلاين، مع إحصائيات ولوحة متصدرين وأصوات وتصميم ملكي فاخر.",
  keywords: ["شطرنج", "chess", "لعبة شطرنج", "شطرنج أونلاين", "ذكاء اصطناعي", "AI chess"],
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%99%9B%3C/text%3E%3C/svg%3E",
  },
  openGraph: {
    title: "شطرنج الملوك",
    description: "شطرنج كامل ضد ذكاء اصطناعي متعليق أو لاعبين حقيقيين أونلاين",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#161310",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} ${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
