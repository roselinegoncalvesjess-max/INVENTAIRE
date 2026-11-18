import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { initSchema, pool } from "./db.js";
import { amorcerClassement } from "./classement.js";
import { ecritureReservee, exigerConnexion, exigerRole, routesAuth } from "./auth.js";
import dechargesRouter from "./routes/decharges.js";
import equipementsRouter from "./routes/equipements.js";
import utilisateursRouter from "./routes/utilisateurs.js";
import classementRouter from "./routes/classement.js";
import structuresRouter from "./routes/structures.js";

const app = express();
app.disable("x-powered-by");

// En-têtes de sécurité (l'application est ouverte sur le réseau)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "1mb" }));

// Connexion (publique), puis tout le reste exige un compte
app.use("/api/auth", routesAuth);
app.use("/api/decharges", exigerConnexion, ecritureReservee("admin", "agent"), dechargesRouter);
app.use("/api/equipements", exigerConnexion, ecritureReservee("admin", "agent"), equipementsRouter);
app.use("/api/classement", exigerConnexion, ecritureReservee("admin", "agent"), classementRouter);
app.use("/api/structures", exigerConnexion, ecritureReservee("admin", "agent"), structuresRouter);
app.use("/api/utilisateurs", exigerConnexion, exigerRole("admin"), utilisateursRouter);
app.use("/api", (req, res) => res.status(404).json({ message: "Adresse inconnue." }));

// En production, le serveur sert aussi l'interface React compilée (client/dist)
const dist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile("index.html", { root: dist }));
}

// Gestion des erreurs : message lisible pour l'interface
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Requête illisible." });
  res.status(500).json({ message: "Erreur du serveur. Vérifiez la connexion à PostgreSQL." });
});

const port = Number(process.env.PORT) || 3001;
const adressesReseau = () => Object.values(networkInterfaces()).flat()
  .filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address);

initSchema()
  .then(async () => { const n = await amorcerClassement(pool); if (n) console.log(`Classement proposé pour ${n} équipement(s) : à valider dans « À classer ».`); })
  // HOST=127.0.0.1 quand un proxy HTTPS local est placé devant (sinon : tout le réseau)
  .then(() => app.listen(port, process.env.HOST || "0.0.0.0", () => {
    console.log(`API inventaire : http://localhost:${port}/api`);
    if (existsSync(dist)) {
      console.log(`Application : http://localhost:${port}`);
      for (const ip of adressesReseau()) console.log(`  sur le réseau : http://${ip}:${port}`);
    } else {
      console.log("Interface non compilée : lancez « npm.cmd run build » dans client (ou utilisez le serveur Vite en développement).");
    }
  }))
  .catch(err => {
    console.error("Connexion à PostgreSQL impossible :", err.message);
    console.error("Vérifiez le fichier server/.env et que la base « inventaire » existe.");
    process.exit(1);
  });
