# Nocturne — serveur relais

Petit serveur qui met en relation deux joueurs. Il ne calcule rien : c'est l'hôte
qui simule la partie, le serveur ne fait que transmettre les messages entre les
deux téléphones.

## Essayer chez soi d'abord

```bash
npm install
node serveur.js
```

Le serveur écoute sur le port 8080. Ouvrez `http://localhost:8080` dans un
navigateur : vous devez voir un petit texte JSON avec le nombre de salons. C'est
le signe qu'il tourne.

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
4. L'hébergeur vous donne une adresse en `https://xxx.onrender.com`. Dans le jeu,
   l'adresse du relais est la même en remplaçant `https://` par `wss://` :
   `wss://xxx.onrender.com`.

## Le point qui coince le plus souvent

Si votre page de jeu est servie en **https://**, l'adresse du relais doit être en
**wss://** (WebSocket sécurisé). Un navigateur refuse une connexion `ws://` non
chiffrée depuis une page sécurisée, sans message d'erreur clair. Les hébergeurs
cités plus haut fournissent le certificat automatiquement, donc `wss://` marche
directement chez eux.

Autre piège : les offres gratuites mettent le serveur en veille après quelques
minutes sans trafic. La première connexion après une pause peut prendre 30
secondes à réveiller le service. Ensuite c'est instantané.

## Modifier le code du salon

Le code à quatre lettres n'est qu'une clé de regroupement. Deux joueurs qui
entrent le même code se retrouvent ensemble. Il n'y a pas de mot de passe : si
vous voulez éviter qu'un inconnu tombe sur votre partie, changez simplement de
code, ou allongez-le dans `codeSalon()` côté jeu.

## Consommation

Mesurée sur le scénario le plus chargé du jeu (Brasier en Cauchemar, une
quarantaine d'ennemis à l'écran) : environ 21 Ko/s en moyenne, 36 Ko/s en pointe,
soit à peu près 1,2 Mo par minute de jeu. C'est peu, même en 4G.
