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
