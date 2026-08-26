import { prisma } from "../lib/prisma";

async function main() {
  const result = await prisma.refreshToken.updateMany({ where: { revoked: false }, data: { revoked: true } });
  console.log(JSON.stringify({ refreshTokensRevoques: result.count, date: new Date().toISOString() }));
}

main()
  .catch((error) => {
    console.error("Echec de la revocation globale des refresh tokens", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
