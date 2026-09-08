/* ============================================================================
   NOCTURNE — serveur relais
   Il ne simule rien : il met en relation deux joueurs dans un salon et
   transmet leurs messages. Toute la logique de jeu reste chez l'hôte.

   Lancement :
     npm install
     node serveur.js
   Le port est pris dans la variable d'environnement PORT si elle existe
   (c'est ce que font Render, Railway, Fly, Heroku…), sinon 8080.
   ========================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const salles = new Map();          // code -> { hote, invite }

// Le serveur fait deux choses : il sert la page du jeu, et il relaie les
// messages entre les deux joueurs. Le jeu et le relais sont donc au même
// endroit, ce qui évite d'avoir deux adresses à retenir.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const serveur = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  // état du relais, pratique pour vérifier que tout tourne
  if (url === '/etat') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      service: 'nocturne-relais',
      salons: salles.size,
      joueurs: [...salles.values()].reduce((n, s) => n + (s.hote?1:0) + (s.invite?1:0), 0),
    }));
  }

  // --- tableau des scores ---
  if (url === '/scores' && req.method === 'GET') {
    return stock.meilleurs(50).then((liste) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8',
                           'Cache-Control': 'no-store' });
      res.end(JSON.stringify(liste));
    }).catch((e) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ erreur: 'stockage indisponible' }));
    });
  }
  if (url === '/scores' && req.method === 'POST') {
    const cle = req.socket.remoteAddress || '?';
    const now = Date.now();
    if (now - (derniersEnvois.get(cle) || 0) < 3000) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end('{"erreur":"trop rapide"}');
    }
    return lireCorps(req).then((c) => {
      const borne = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));
      const p = {
        nom:        nettoyer(c.nom, 16) || 'Anonyme',
        perso:      nettoyer(c.perso, 20),
        terrain:    nettoyer(c.terrain, 24),
        temps:      borne(c.temps, 0, 7200),
        tues:       borne(c.tues, 0, 100000),
        niveau:     borne(c.niveau, 1, 200),
        chapitre:   borne(c.chapitre, 1, 4),
        victoire:   !!c.victoire,
        difficulte: Math.max(0, RANGS_DIFF.indexOf(nettoyer(c.difficulte, 12))),
      };
      p.score = calculerScore(p);
      p.date = new Date().toISOString().slice(0, 10);
      derniersEnvois.set(cle, now);

      return stock.ajouter(p).then((r) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ score: p.score, rang: r.rang, total: r.total }));
      });
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"erreur":"donnees invalides"}');
    });
  }

  // la racine renvoie le jeu
  const nom = url === '/' ? '/nocturne.html' : url;
  const fichier = path.join(__dirname, path.normalize(nom).replace(/^(\.\.[/\\])+/, ''));

  // on ne sert que ce qui est dans le dossier du serveur
  if (!fichier.startsWith(__dirname)) {
    res.writeHead(403); return res.end('Interdit');
  }

  fs.readFile(fichier, (err, contenu) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Fichier introuvable. Avez-vous bien déposé nocturne.html à côté de serveur.js ?');
    }
    const type = TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(contenu);
  });
});

/* ============================================================================
   TABLEAU DES SCORES
   Le stockage est choisi automatiquement (voir stockage.js) : base PostgreSQL
   si DATABASE_URL est défini, sinon simple fichier JSON.
   ========================================================================== */
const { creerStockage } = require('./stockage');
const stock = creerStockage();

stock.demarrer()
  .then((n) => {
    console.log(`Scores : ${stock.nom} — ${n} enregistrement(s).`);
    if (!stock.durable) console.log(
      'ATTENTION : stockage non durable. Sur un hébergement gratuit, les scores\n' +
      '  disparaîtront au premier redémarrage. Renseignez DATABASE_URL pour les garder.');
  })
  .catch((e) => console.log('Stockage des scores indisponible :', e.message));

/* Le score est recalculé ICI, jamais repris du client. */
function calculerScore(p) {
  return Math.round(
      p.tues * 10
    + p.temps * 2
    + p.niveau * 60
    + p.chapitre * 600
    + (p.victoire ? 2500 : 0)
    + p.difficulte * 0.25 * (p.tues * 10 + p.temps * 2)
  );
}

const RANGS_DIFF = ['veillee', 'normal', 'cauchemar', 'damnation'];
const derniersEnvois = new Map();               // un score / 3 s / adresse

function nettoyer(txt, max) {
  return String(txt == null ? '' : txt)
    .replace(/[\x00-\x1f<>&"']/g, '')
    .trim().slice(0, max);
}

function lireCorps(req) {
  return new Promise((res, rej) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 4096) req.destroy(); });
    req.on('end', () => { try { res(JSON.parse(d || '{}')); } catch (e) { rej(e); } });
    req.on('error', rej);
  });
}

const wss = new WebSocketServer({ server: serveur });

function partenaire(salle, role) {
  return role === 'hote' ? salle.invite : salle.hote;
}
function prevenir(sock, objet) {
  if (sock && sock.readyState === 1) {
    try { sock.send(JSON.stringify(objet)); } catch (e) {}
  }
}

wss.on('connection', (sock) => {
  sock.vivant = true;
  sock.on('pong', () => { sock.vivant = true; });

  sock.on('message', (donnees, binaire) => {
    // Premier message attendu : { t:'salon', code:'ABCD', role:'hote'|'invite' }
    if (!sock.salle) {
      let m;
      try { m = JSON.parse(donnees.toString()); } catch (e) { return; }
      if (m.t !== 'salon' || !m.code || !['hote','invite'].includes(m.role)) return;

      const code = String(m.code).toUpperCase().slice(0, 8);
      let salle = salles.get(code);
      if (!salle) { salle = { hote: null, invite: null }; salles.set(code, salle); }

      if (salle[m.role] && salle[m.role].readyState === 1) {
        prevenir(sock, { t: 'refus', raison: 'place déjà occupée dans ce salon' });
        return;
      }
      salle[m.role] = sock;
      sock.salle = code; sock.role = m.role;

      const autre = partenaire(salle, m.role);
      prevenir(sock, { t: 'salon-ok', code, role: m.role, pair: !!(autre && autre.readyState === 1) });
      if (autre) {
        prevenir(autre, { t: 'pair', present: true });
        prevenir(sock,  { t: 'pair', present: true });
      }
      console.log(`[${code}] ${m.role} connecté`);
      return;
    }

    // Ensuite : on relaie tel quel, sans rien interpréter.
    const salle = salles.get(sock.salle);
    if (!salle) return;
    const autre = partenaire(salle, sock.role);
    if (autre && autre.readyState === 1) {
      try { autre.send(donnees, { binary: binaire }); } catch (e) {}
    }
  });

  sock.on('close', () => {
    if (!sock.salle) return;
    const salle = salles.get(sock.salle);
    if (!salle) return;
    const autre = partenaire(salle, sock.role);
    salle[sock.role] = null;
    prevenir(autre, { t: 'pair', present: false });
    console.log(`[${sock.salle}] ${sock.role} parti`);
    if (!salle.hote && !salle.invite) salles.delete(sock.salle);
  });
});

// Les hébergeurs gratuits coupent les connexions inactives : on garde le lien vivant.
setInterval(() => {
  wss.clients.forEach((s) => {
    if (!s.vivant) return s.terminate();
    s.vivant = false;
    try { s.ping(); } catch (e) {}
  });
}, 25000);

serveur.listen(PORT, () => console.log('Relais Nocturne à l\'écoute sur le port ' + PORT));
