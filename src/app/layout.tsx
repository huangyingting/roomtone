import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomtone — a little space of your own",
  description: "Build a home, room by room. A relaxing 3D home designer with furniture, gardens, finishes and changing light.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
