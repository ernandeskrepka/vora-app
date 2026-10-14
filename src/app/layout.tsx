import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VORA | Aprovacao e publicacao",
  description: "Sistema interno da VORA para aprovacao do cliente e publicacao automatizada de criativos.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
