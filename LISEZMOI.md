# Nocturne — serveur relais

Ce serveur fait deux choses : il **sert la page du jeu**, et il **met en relation
les deux joueurs**. Il ne calcule pas la partie — c'est l'hôte qui simule tout, le
serveur ne fait que transmettre les messages entre les deux téléphones.

Comme le jeu et le relais sont au même endroit, il n'y a qu'une seule adresse à
retenir, et le jeu trouve son relais tout seul.

## Les fichiers à déposer

Quatre fichiers, tous **à la racine du dépôt**, côte à côte :

- `serveur.js`
- `package.json`
- `nocturne.html` — le jeu lui-même
- `LISEZMOI.md` (facultatif)

## Essayer chez soi d'abord

```bash
npm install
node serveur.js
```

Ouvrez `http://localhost:8080` : le jeu doit s'afficher directement.
`http://localhost:8080/etat` affiche l'état du relais en JSON, pratique pour
vérifier qu'il tourne.

Pour tester à deux sur le même réseau wifi, trouvez l'adresse locale de votre
machine (`ipconfig` sous Windows, `ifconfig` ou `ip a` sous Mac/Linux — quelque
chose comme `192.168.1.42`) et utilisez `ws://192.168.1.42:8080` comme adresse de
relais dans le jeu.

## Le mettre en ligne

N'importe quel hébergeur qui exécute Node.js fait l'affaire. Render, Railway et
Fly.io ont tous une offre gratuite suffisante ici — le serveur consomme très peu.

1. Poussez ce dossier sur un dépôt Git.
2. Créez un service web sur l'hébergeur, en pointant sur ce dépôt.
3. Commande de démarrage : `npm start`. Ne fixez pas le port : le code lit
   automatiquement la variable `PORT` que l'hébergeur fournit.
4. L'hébergeur vous donne une adresse en `https://xxx.onrender.com`. C'est
   l'adresse du jeu : ouvrez-la, la partie se lance. L'adresse du relais est
   remplie automatiquement, vous n'avez rien à régler.

## Si vous préférez héberger la page ailleurs

C'est possible : gardez `nocturne.html` sur votre site et laissez seulement le
serveur sur Render. Dans ce cas il faut entrer l'adresse du relais à la main dans
l'écran de connexion, en **wss://** et pas `ws://` — un navigateur refuse une
connexion non chiffrée depuis une page en `https://`, sans message d'erreur
clair. Vous pouvez aussi la fixer une fois pour toutes en modifiant la ligne
`RELAIS_DEFAUT` en haut du bloc RÉSEAU dans `nocturne.html`.

## Autres points à connaître

Les offres gratuites mettent le serveur en veille après quelques
minutes sans trafic. La première connexion après une pause peut prendre 30
secondes à réveiller le service. Ensuite c'est instantané.

## Modifier le code du salon

Le code à quatre lettres n'est qu'une clé de regroupement. Deux joueurs qui
entrent le même code se retrouvent ensemble. Il n'y a pas de mot de passe : si
vous voulez éviter qu'un inconnu tombe sur votre partie, changez simplement de
code, ou allongez-le dans `codeSalon()` côté jeu.

## Tableau des scores

Le serveur expose deux adresses :

- `GET /scores` renvoie les cinquante meilleurs, en JSON
- `POST /scores` enregistre une partie

Le score est **recalculé par le serveur**, jamais repris du client : éliminations,
temps de survie, niveau, chapitre atteint, victoire, plus un bonus proportionnel
à la difficulté. Les noms sont nettoyés (16 caractères maximum, balises retirées)
et un même appareil ne peut envoyer qu'un score toutes les trois secondes.

### Rendre les scores durables

Par défaut, les scores sont écrits dans `scores.json`, à côté du serveur. Sur
un hébergement gratuit, **ce fichier ne survit pas** : le conteneur est détruit
à chaque mise en veille ou redéploiement.

Pour des scores permanents, il suffit de renseigner la variable
d'environnement `DATABASE_URL` avec l'adresse d'une base PostgreSQL. Le serveur
la détecte au démarrage, crée sa table tout seul, et bascule dessus. Aucune
autre modification n'est nécessaire.

**Attention au piège :** la base Postgres gratuite de Render **expire 30 jours
après sa création**, puis est supprimée après un délai de grâce de deux
semaines. Ce n'est pas une offre gratuite durable, c'est un essai. Préférez un
hébergeur dont l'offre gratuite n'a pas de date de fin :

| Service  | Offre gratuite | À savoir |
| -------- | -------------- | -------- |
| Neon     | Postgres, sans expiration | se met en veille après 5 min d'inactivité, se réveille à la première requête |
| Supabase | Postgres, sans expiration | se met en pause après une semaine sans activité, à relancer d'un clic |
| Aiven    | Postgres, sans expiration | s'éteint après une inactivité prolongée, rallumage manuel |

La marche à suivre est la même pour les trois : créez la base, copiez la chaîne
de connexion, et collez-la dans Render sous « Environment » → « Add Environment
Variable », avec pour nom `DATABASE_URL`. Au redémarrage, le journal doit
afficher « Scores : base PostgreSQL ».

Tant que `DATABASE_URL` est absent, le serveur affiche un avertissement au
démarrage pour rappeler que les scores ne sont pas conservés.

## Consommation

Mesurée sur le scénario le plus chargé du jeu (Brasier en Cauchemar, une
quarantaine d'ennemis à l'écran) : environ 21 Ko/s en moyenne, 36 Ko/s en pointe,
soit à peu près 1,2 Mo par minute de jeu. C'est peu, même en 4G.
