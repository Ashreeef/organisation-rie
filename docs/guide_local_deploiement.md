# Guide de déploiement local interne — prototype RIE BNP Algiers

Ce guide est conçu pour une utilisation interne en bureau, avec 1 à 5 utilisateurs, sans exposition internet, sans authentification externe, et avec une prise en charge simple par les stagiaires puis par le gestionnaire de cantine.

## 1. Objectif

Le système doit être exploitable localement sur un PC de bureau ou sur un petit serveur interne du réseau LAN de BNP Algiers.

Le but n’est pas un déploiement "production internet". Le but est un prototype stable, simple à démarrer, simple à sauvegarder, et simple à transmettre.

## 2. Architecture recommandée

- Backend FastAPI sur le PC serveur
- Frontend Next.js sur le même PC serveur
- Accès via le réseau local (LAN)
- Données stockées localement dans le dossier `data/`
- Aucune exposition publique
- Aucune authentification externe
- Vitesse et simplicité > complexité technique

Exemple d’accès :

- http://192.168.1.50:3000
- http://192.168.1.50:8000/api/health

Remplacer `192.168.1.50` par l’adresse IP du PC qui héberge l’application.

## 3. Prérequis

### Logiciel requis

- Python 3.11 ou 3.12
- Node.js 18 ou 20
- Git
- Windows PowerShell ou PowerShell 7

### Réseau

- Le PC serveur doit être accessible depuis les autres postes du bureau via le LAN
- Le port 3000 et le port 8000 doivent être ouverts localement
- Ne pas exposer l’application sur internet

## 4. Installation sur le PC serveur

### 4.1 Cloner le projet

```powershell
cd C:\
git clone https://github.com/Ashreeef/organisation-rie
cd rie-project
```

### 4.2 Créer l’environnement Python

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 4.3 Installer les dépendances frontend

```powershell
cd dashboard
npm install
cd ..
```

## 5. Démarrage local

### Option A — démarrage manuel

Terminal 1 : backend

```powershell
cd rie-project
.\.venv\Scripts\Activate.ps1
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

Terminal 2 : frontend

```powershell
cd rie-project\dashboard
npm run dev -- --hostname 0.0.0.0 --port 3000
```

### Option B — démarrage via script Windows

À partir de la racine du projet :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_rie.ps1
```

Le script démarre le backend et le frontend dans des fenêtres PowerShell distinctes.

## 6. Vérification du bon fonctionnement

### Vérifier le backend

```powershell
Invoke-WebRequest http://localhost:8000/api/health
```

Réponse attendue : JSON avec `status: ok` et `models_loaded`.

### Vérifier le frontend

Ouvrir dans le navigateur :

```text
http://localhost:3000
```

ou depuis un autre ordinateur du LAN :

```text
http://<IP-du-PC-serveur>:3000
```

## 7. Paramètres recommandés pour ce prototype

Dans le fichier `.env`, utiliser des valeurs simples :

```env
ENVIRONMENT=development
ENABLE_AUTHENTICATION=false
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ENABLE_MONITORING=false
SENTRY_DSN=
```

Ces réglages sont adaptés à un usage interne local. On évite le sur-ingénierie en production web.

## 8. Gestion de l’accès LAN

### Pour les autres postes du bureau

Les utilisateurs doivent pouvoir ouvrir dans leur navigateur :

```text
http://<IP-du-PC-serveur>:3000
```

### Recommandation

- Le PC serveur doit rester allumé pendant les heures d’usage
- L’accès doit se faire sur le réseau interne de BNP
- Ne pas ouvrir de ports sur internet

## 9. Sauvegarde recommandée

Sauvegarder au moins quotidiennement :

- `data/`
- `models/`
- `api/.env` ou `.env`
- éventuels fichiers de configuration système

Script fourni :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup_local_rie.ps1
```

La sauvegarde est créée dans un dossier `backups/` avec date et heure.

## 10. Restauration après incident

1. Arrêter le backend et le frontend
2. Restaurer le dossier sauvegardé
3. Relancer les services
4. Vérifier le endpoint `/api/health`
5. Vérifier l’accès par le navigateur sur la page d’accueil

## 11. Gestion quotidienne pour le gestionnaire de cantine

Le gestionnaire de cantine n’a pas besoin de savoir tout le code. Il doit uniquement savoir :

- où ouvrir le site
- comment démarrer le système si nécessaire
- où sont stockés les fichiers de données
- comment lancer une sauvegarde
- qui contacter si le site ne répond plus

## 12. Procédure simple de redémarrage

### Cas 1 — le backend ne répond plus

```powershell
cd rie-project
.\.venv\Scripts\Activate.ps1
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

### Cas 2 — le frontend ne répond plus

```powershell
cd rie-project\dashboard
npm run dev -- --hostname 0.0.0.0 --port 3000
```

### Cas 3 — le système entier est bloqué

1. Vérifier si les deux fenêtres PowerShell sont actives
2. Relancer le backend
3. Relancer le frontend
4. Vérifier l’URL locale

## 13. Points importants à retenir

- Ce prototype est destiné à un usage interne, local, limité
- La simplicité est une force
- Le système doit être facilement maintenable par un gestionnaire de cantine avec un peu d’aide IT
- On ne cherche pas la scalabilité internet ni la sécurité externe dans cette phase

## 14. Contact / support

Pour ce prototype, le support doit être simple :

- un stagiaire ou un développeur local
- éventuellement l’équipe IT de BNP pour les problèmes réseau
- un fichier de notes de dépannage local

## 15. Conclusion

Pour les 2 semaines restantes, la bonne stratégie est de stabiliser un prototype fonctionnel, utilisable en interne sur le réseau local, facile à lancer et facile à sauvegarder. C’est bien plus adapté au contexte BNP Algiers que d’installer une architecture de production internet.

Le but est de livrer un outil utile, solide, et simple à prendre en main.
