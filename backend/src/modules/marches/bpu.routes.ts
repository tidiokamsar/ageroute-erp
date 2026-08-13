import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { prisma } from "../../lib/prisma";
import { logAudit } from "../../lib/audit";
import { ApiError } from "../../middleware/error.middleware";
import { z } from "zod";

export const bpuRouter = Router({ mergeParams: true }); // /api/marches/:marcheId/bpu
bpuRouter.use(requireAuth);

const articleSchema = z.object({
  lotId: z.string().uuid().optional(),
  code: z.string().min(1),
  designation: z.string().min(1),
  unite: z.string().min(1),
  quantitePrevue: z.number().positive(),
  prixUnitaireGnf: z.number().positive().transform((v) => BigInt(Math.round(v))),
  ordre: z.number().int().optional(),
});

bpuRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const articles = await prisma.bpuArticle.findMany({
      where: { marcheId: req.params.marcheId },
      include: { lot: { select: { numero: true, designation: true } } },
      orderBy: [{ ordre: "asc" }, { code: "asc" }],
    });
    res.json(articles);
  } catch (err) { next(err); }
});

bpuRouter.post("/", requireRole("ADMIN", "DMC", "DAF"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = articleSchema.parse(req.body);
    const montantGnf = BigInt(Math.round(data.quantitePrevue * Number(data.prixUnitaireGnf)));
    const created = await prisma.bpuArticle.create({ data: { ...data, marcheId: req.params.marcheId, montantGnf } });
    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "BpuArticle", entityId: created.id });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

bpuRouter.put("/:id", requireRole("ADMIN", "DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    const data = articleSchema.partial().parse(req.body);
    const current = await prisma.bpuArticle.findUnique({ where: { id: req.params.id } });
    if (!current) throw new ApiError(404, "Article introuvable");
    const quantite = (data.quantitePrevue ?? current.quantitePrevue);
    const prix = (data.prixUnitaireGnf ?? current.prixUnitaireGnf);
    const montantGnf = BigInt(Math.round(quantite * Number(prix)));
    const updated = await prisma.bpuArticle.update({ where: { id: req.params.id }, data: { ...data, montantGnf } });
    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "BpuArticle", entityId: req.params.id });
    res.json(updated);
  } catch (err) { next(err); }
});

bpuRouter.delete("/:id", requireRole("ADMIN", "DMC"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Authentification requise");
    await prisma.bpuArticle.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.user.id, action: "DELETE", entityType: "BpuArticle", entityId: req.params.id });
    res.status(204).send();
  } catch (err) { next(err); }
});
