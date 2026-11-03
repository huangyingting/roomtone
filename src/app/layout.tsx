import type { Metadata } from "next";
import "@/original/roomtone.css";

export const metadata: Metadata = {
  title: "Roomtone — design your apartment",
  description: "The original Roomtone home builder, with its original models and settings, optimized with Next.js and Three.js.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="stylesheet" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/fonts/fonts.css`} /></head><body>{children}</body></html>;
}
