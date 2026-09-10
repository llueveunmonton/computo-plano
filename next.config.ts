import type { NextConfig } from "next";

const lanOrigin = process.env.PULSO_DEV_ORIGIN;
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", ...(lanOrigin ? [lanOrigin] : [])],
  // El runner CLI usa procesos desacoplados que algunos entornos de demo restringen.
  // La API oficial de TypeScript realiza el mismo chequeo sin ese proceso auxiliar.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
