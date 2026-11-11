# AGENTS.md — Logo 3D Studio (Binks Design)

Outil web autonome qui transforme un logo SVG en objet 3D (volume, biseau, matière, lumière, fond, animation) et exporte image, vidéo, objet 3D, visionneuse HTML ou kit. En ligne : https://logo3d.binksdesign.com/ (Cloudflare, déployé automatiquement depuis `master`).

## Structure du dépôt
- `index.html` : toute l'app (HTML + CSS + bundle JS minifié d'environ 5 Mo, assets base64 intégrés). **Ne pas reformater** : éditer chirurgicalement (script ciblé, ancres uniques).
- `agent-api.js` : API agent (`window.BinksyAPI` + outils WebMCP), chargée par `index.html` après le bundle.
- `mcp/index.html` : page « MCP / Agents IA » (doc utilisateur, FR + EN).
- `llms.txt` : résumé pour les LLM.
- `CNAME` : domaine.

## API pour agents IA
L'app expose une API JavaScript publique : `window.BinksyAPI` (asynchrone, JSON en entrée/sortie, erreurs `{ code, message }`). Les mêmes outils sont enregistrés en **WebMCP** (`document.modelContext.registerTool`, repli `navigator.modelContext`) sous les noms `logo3d_*`. Doc complète : `/mcp/`.

| Méthode BinksyAPI | Outil WebMCP | Rôle |
|---|---|---|
| `describe()` | `logo3d_describe` | app, version, apiVersion "1", liste des outils + schémas |
| `ready()` | — | attend que l'app soit prête (état restauré) |
| `getState()` | `logo3d_etat` | résumé de l'état (sans binaire) |
| `importer({files})` | `logo3d_importer` | SVG = logo ; PNG/JPEG/WebP = image posée sur le logo ; `.logo3d.json` = projet |
| `exporter({format,...})` | `logo3d_exporter` | png, jpeg, mp4, webm, gif, png-sequence, glb, gltf, obj, stl, usdz, viewer, kit, project → `{files:[{name,type,size,dataBase64}]}` ; `download:true` pour télécharger |
| `listerOptions()` | `logo3d_lister_options` | catalogues (looks, matériaux, lumières, fonds, animations, profils, biseaux, cadres, vues) |
| `listerLooks({categorie})` | `logo3d_lister_looks` | looks |
| `appliquerLook({id})` | `logo3d_appliquer_look` | applique un look |
| `setForme({...})` | `logo3d_forme` | épaisseur, profil, biseau… |
| `setMateriau({...})` | `logo3d_materiau` | preset, couleur, métal, rugosité… |
| `setLumiere({...})` | `logo3d_lumiere` | preset, exposition, rotation… |
| `setFond({...})` | `logo3d_fond` | preset, type, couleurs… |
| `setAnimation({...})` | `logo3d_animation` | type, durée, intensité, courbe |
| `setCadre({ratio,vue})` | `logo3d_cadre` | cadre et vue caméra |
| `setParam({path,value})` | `logo3d_set_param` | réglage avancé par chemin d'état |
| `annuler()` / `retablir()` | `logo3d_annuler` / `logo3d_retablir` | historique |
| `reset({confirm:true})` | `logo3d_reset` | logo de démo + look par défaut (demander confirmation) |

Connexion depuis Claude Code / Codex / Hermes / OpenCode : Playwright MCP (`npx @playwright/mcp@latest`), ouvrir l'URL, puis `browser_evaluate` sur `window.BinksyAPI`.

## Fonctionnement interne (pour modifier l'API)
- `index.html` expose déjà `window.L3D` (fonctions internes de l'UI). Le patch agent y ajoute : `importFile` (dépôt de fichier), `commit`, `flushHistory`, `setParam` (= curseurs de l'UI), `projectData`, `defaults`, `slug`, `exporting`, `PROFILES`, `BEVELS`, `EASES`, `RATIOS`, `VIEWS`.
- Hook d'export : si `window.__binksyCapture` est défini, la fonction de fin d'export lui passe `{blob,name,msg}` au lieu de télécharger. Sans hook, comportement d'origine.
- Matière / lumière / fond par preset : `agent-api.js` simule un clic sur un bouton `data-mat` / `data-light` / `data-bg` dans le panneau correspondant → même gestionnaire que l'UI.
- Enregistrement automatique : état de session dans `localStorage` (`logo3d.session`, restauré au chargement) + IndexedDB `logo3d-studio` (clé `autosave`). Chaque méthode qui modifie l'état attend ~0,8 s que l'historique et la session soient écrits.

## Règles
- Aucun backend, aucun appel réseau nouveau ; le logo ne quitte jamais le navigateur. Pas de clé API.
- Ne jamais inventer de logo, couleur ou nom client.
- Ne rien casser : interface, auto-save (tout revient au rechargement), exports.
- Tester avant de pousser (Chromium headless) : `describe()`, import SVG/PNG réel, export PNG/GLB/GIF réel non vide, rechargement → état identique, `/mcp/` s'affiche, aucune erreur console.
- `master` se déploie seul : ne pousser que si les tests passent.

## Qualité du maillage et du rendu (11/11/2026)
- Finesse du maillage `Fh` : Rapide `.03`, Standard `.016`, Fine `.0105` (pas du contour, en unités du logo normalisé à 2). Anneaux de biseau : 8 / 12 / 16 selon la finesse ; éventail des coins saillants tous les ~7° (`/.12`). Ces réglages existent en double : bundle principal **et** code du worker (`a2`).
- Courbes SVG : au moins 32 segments par courbe (`Math.max(curveSegments,32)`).
- SVG « sales » (contours qui se touchent, points en T, fermetures imprécises) : quand le maillage sculpté échoue (`Edge intersects already constrained edge`), `__l3dHeal` nettoie les contours (fusion des points proches, suppression des pics) puis, si besoin, les décale d'une fraction de micron avant de réessayer. L'ancienne extrusion simple (coins qui pincent) n'est plus qu'un dernier recours. Journal : `volume : forme réparée`.
- Rendu : reflets d'environnement générés en 512 (`pmrem.envRes`, 256 avant) ; sur écran non Retina, rendu suréchantillonné ×2 au repos (sauf GPU faible ou mode prudent).
