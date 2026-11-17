import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { COOKIE_TEMA, normalizarTema } from "@/lib/tema.ts";

export const metadata: Metadata = {
  title: "VORA | Aprovacao e publicacao",
  description:
    "Sistema interno da VORA para aprovacao do cliente e publicacao automatizada de criativos.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O tema fica num cookie: quem escolheu o layout VORA ve o painel escuro,
  // o cliente que abre o link continua no padrao claro.
  const tema = normalizarTema((await cookies()).get(COOKIE_TEMA)?.value);

  return (
    <html lang="pt-BR" data-tema={tema}>
      <head>
        {/* Inter para a interface e JetBrains Mono para rotulos; a Creato
            (titulos) e local, em public/fontes. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
