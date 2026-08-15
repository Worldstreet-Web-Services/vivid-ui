import type { Metadata } from "next";
import { Geist, Mona_Sans } from "next/font/google";
import "./globals.css";

// The same two faces as the rest of Worldstreet, in the same roles and under
// the same variable names, so Vivid is recognisably the same product family.
// Geist for readouts and body: a variable font, so every weight ships in one
// file, and its Latin-extended coverage carries the tone marks and dotted
// vowels of Yorùbá, Igbo and Hausa that a display face would drop mid-word.
// Mona Sans for the wordmark and the control labels.
const body = Geist({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const display = Mona_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vivid",
  description:
    "Vivid is a voice with a presence. She speaks English, Yorùbá, Igbo, Hausa and Pidgin.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body suppressHydrationWarning className="antialiased">
        {children}
      </body>
    </html>
  );
}
