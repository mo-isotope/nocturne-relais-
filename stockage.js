/* ============================================================================
   STOCKAGE DES SCORES

   Deux modes, choisis automatiquement :

   1. Si la variable d'environnement DATABASE_URL existe, les scores vont dans
      une base PostgreSQL. C'est le seul mode réellement durable : il survit
      aux mises en veille et aux redéploiements.
      Des offres gratuites sans date d'expiration : Neon, Supabase, Aiven.

   2. Sinon, ils vont dans un fichier JSON à côté du serveur. Pratique en local,
      mais sur un hébergement gratuit le disque est éphémère : le fichier
      repart de zéro à chaque redémarrage du conteneur.
   ========================================================================== */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const MAX_GARDES = 500;

/* --- mode fichier --------------------------------------------------------- */
function stockageFichier(fichier) {
  let scores = [];
  let differe = null;
  try {
    scores = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    if (!Array.isArray(scores)) scores = [];
  } catch (e) { scores = []; }

  return {
    nom: 'fichier ' + fichier,
    durable: false,
    async demarrer() { return scores.length; },
    async meilleurs(n) { return scores.slice(0, n); },
    async ajouter(p) {
      scores.push(p);
      scores.sort((a, b) => b.score - a.score);
      if (scores.length > MAX_GARDES) scores.length = MAX_GARDES;
      if (!differe) differe = setTimeout(async () => {
        differe = null;
        try { await fsp.writeFile(fichier, JSON.stringify(scores)); }
        catch (e) { console.log('Écriture impossible :', e.message); }
      }, 2000);
      return { rang: scores.indexOf(p) + 1, total: scores.length };
    },
  };
}

/* --- mode base de données ------------------------------------------------- */
function stockagePostgres(url, pg) {
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: url, ssl, max: 3 });

  return {
    nom: 'base PostgreSQL',
    durable: true,
    async demarrer() {
      await pool.query(`CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        nom TEXT NOT NULL,
        perso TEXT,
        terrain TEXT,
        temps INTEGER NOT NULL,
        tues INTEGER NOT NULL,
        niveau INTEGER NOT NULL,
        chapitre INTEGER NOT NULL,
        victoire BOOLEAN NOT NULL,
        difficulte INTEGER NOT NULL,
        score INTEGER NOT NULL,
        date TEXT NOT NULL,
        armes TEXT,
        passifs TEXT
      )`);
      // bases créées avant l'ajout du détail : on complète sans rien perdre
      await pool.query('ALTER TABLE scores ADD COLUMN IF NOT EXISTS armes TEXT');
      await pool.query('ALTER TABLE scores ADD COLUMN IF NOT EXISTS passifs TEXT');
      await pool.query('CREATE INDEX IF NOT EXISTS scores_tri ON scores (score DESC)');
      const r = await pool.query('SELECT COUNT(*)::int AS n FROM scores');
      return r.rows[0].n;
    },
    async meilleurs(n) {
      const r = await pool.query(
        `SELECT nom, perso, terrain, temps, tues, niveau, chapitre, victoire,
                difficulte, score, date, armes, passifs
           FROM scores ORDER BY score DESC, id ASC LIMIT $1`, [n]);
      return r.rows;
    },
    async ajouter(p) {
      await pool.query(
        `INSERT INTO scores (nom,perso,terrain,temps,tues,niveau,chapitre,
                             victoire,difficulte,score,date,armes,passifs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [p.nom, p.perso, p.terrain, p.temps, p.tues, p.niveau, p.chapitre,
         p.victoire, p.difficulte, p.score, p.date, p.armes, p.passifs]);
      const r = await pool.query(
        'SELECT COUNT(*)::int AS mieux FROM scores WHERE score > $1', [p.score]);
      const t = await pool.query('SELECT COUNT(*)::int AS n FROM scores');
      return { rang: r.rows[0].mieux + 1, total: t.rows[0].n };
    },
  };
}

/* --- choix automatique ---------------------------------------------------- */
function creerStockage(opts) {
  opts = opts || {};
  const url = opts.url !== undefined ? opts.url : process.env.DATABASE_URL;
  if (url) {
    const pg = opts.pg || require('pg');
    return stockagePostgres(url, pg);
  }
  return stockageFichier(opts.fichier ||
    process.env.SCORES_FICHIER || path.join(__dirname, 'scores.json'));
}

module.exports = { creerStockage, MAX_GARDES };
