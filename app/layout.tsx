import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Cómputo/Plano · Materiales desde tu plano", description: "Interpretación asistida de planos y cómputo editable de materiales" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
