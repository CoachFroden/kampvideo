import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./admin.css";
import "./admin-upload.css";

export const metadata: Metadata = {
  title: {
    default: "Samnanger Kamprom",
    template: "%s · Samnanger Kamprom",
  },
  applicationName: "Kamprommet",
  description: "Lukket kamp- og videoportal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kamprommet",
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#07130e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="no"><body>{children}</body></html>;
}
