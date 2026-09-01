import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./admin.css";

export const metadata: Metadata = {
  title: "Samnanger Kamprom",
  description: "Lukket kamp- og videoportal",
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = { themeColor: "#07130e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="no"><body>{children}</body></html>;
}
