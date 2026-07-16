# Déploiement Coolify — MAZ Fishing

L'app complète (carte épaves + gestion locative) tourne dans un seul conteneur :
le serveur Node sert les fichiers statiques **et** l'API `/api/*`.

## Étapes Coolify

1. **Coolify → + New → Application → Public Repository**
   - Repo : `https://github.com/Louis59254/epaves-dk`
   - Branch : `main`
   - Build Pack : **Dockerfile**

2. **Storage (IMPORTANT — persistance des données)**
   - Add Persistent Storage :
     - Source : `maz-data` (volume)
     - Destination : `/data`
   - Sans ça, locations/clients sont perdus à chaque redéploiement.

3. **Domaine** : attribuer un domaine/sous-domaine (ex. `maz.ton-domaine.fr`),
   Coolify gère le HTTPS automatiquement.

4. **Deploy.**

## Connexion

- 2 comptes créés au premier démarrage : **Louis** et **Antoine**
- PIN par défaut : **1234** → à changer immédiatement dans GESTION → ⚙️ Réglages

## Données

- Tout est stocké dans `/data/db.json` (volume persistant)
- Backup : télécharger ce fichier depuis Coolify (Storage) ou
  `docker cp <container>:/data/db.json ./backup.json`

## Mise à jour

Push sur `main` → Coolify redéploie (activer Auto Deploy dans les settings de l'app).
