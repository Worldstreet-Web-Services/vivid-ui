import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vivid",
  description:
    "Vivid is a voice with a presence. She speaks English, Yorùbá, Igbo, Hausa and Pidgin.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
