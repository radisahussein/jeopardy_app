import type { Metadata } from "next";
import { Russo_One, Chakra_Petch } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const russoOne = Russo_One({
  variable: "--font-russo",
  subsets: ["latin"],
  weight: "400",
});

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Jeopardy Host",
  description: "Host your own Jeopardy game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${russoOne.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#191970] text-white font-chakra">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
