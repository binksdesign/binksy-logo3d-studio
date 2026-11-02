/* Logo 3D Studio — Binksy Agent API v1 (window.BinksyAPI + WebMCP)
 * 100 % local : aucun réseau, aucun compte, aucune clé. Le logo ne quitte jamais le navigateur.
 * Chaque méthode appelle la logique interne de l'interface (window.L3D, exposé par index.html),
 * met à jour l'UI et déclenche l'enregistrement automatique (session locale + IndexedDB).
 */
(function () {
  'use strict';
  var APP = 'logo3d-studio';
  var VERSION = '1.0.0';
  var PREFIX = 'logo3d_';

  /* ---------- utilitaires ---------- */
  function err(code, message) { var e = new Error(message); e.code = code; e.message = message; return e; }
  function plain(e) { return { code: (e && e.code) || 'ERREUR', message: (e && e.message) || String(e) }; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function L() { var l = window.L3D; if (!l || !l.st) throw err('PAS_PRET', "L'app n'est pas encore prête : attends BinksyAPI.ready()."); return l; }
  function S() { return L().st; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function toastText() { var t = document.getElementById('toast'); return t && !t.hidden ? (t.textContent || '') : ''; }
  function num(v, lo, hi, name) {
    var n = Number(v);
    if (!isFinite(n)) throw err('VALEUR_INVALIDE', name + ' doit être un nombre.');
    if (lo != null && n < lo) n = lo; if (hi != null && n > hi) n = hi;
    return n;
  }
  function color(v, name) {
    if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.trim())) throw err('VALEUR_INVALIDE', name + ' doit être une couleur hexadécimale #rrggbb.');
    return v.trim().toLowerCase();
  }
  function oneOf(v, list, name) {
    if (list.indexOf(v) < 0) throw err('VALEUR_INVALIDE', name + ' doit valoir : ' + list.join(', ') + '.');
    return v;
  }
  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = function () { rej(err('LECTURE', 'Lecture du fichier impossible.')); };
      fr.readAsDataURL(blob);
    });
  }
  function b64ToBytes(b64) {
    var bin = atob(String(b64).replace(/\s+/g, '')), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function guessType(name, type) {
    if (type) return type;
    var n = (name || '').toLowerCase();
    if (/\.svg$/.test(n)) return 'image/svg+xml';
    if (/\.json$/.test(n)) return 'application/json';
    if (/\.png$/.test(n)) return 'image/png';
    if (/\.jpe?g$/.test(n)) return 'image/jpeg';
    if (/\.webp$/.test(n)) return 'image/webp';
    return '';
  }
  function toFile(f) {
    if (!f || typeof f !== 'object') throw err('FICHIER_INVALIDE', 'Chaque fichier doit être un objet { name, type, dataBase64 | text | url }.');
    var name = f.name || 'logo.svg', type, data;
    if (typeof f.text === 'string') { type = guessType(name, f.type) || (/^\s*</.test(f.text) ? 'image/svg+xml' : 'application/json'); data = f.text; }
    else if (typeof f.dataBase64 === 'string') { type = guessType(name, f.type); data = b64ToBytes(f.dataBase64); }
    else if (typeof f.url === 'string') {
      var m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(f.url);
      if (!m) throw err('URL_REFUSEE', 'Seules les URL data: sont acceptées (aucun téléchargement réseau).');
      type = guessType(name, f.type || m[1]);
      data = m[2] ? b64ToBytes(m[3]) : decodeURIComponent(m[3]);
    } else throw err('FICHIER_INVALIDE', 'Fichier "' + name + '" : fournis dataBase64, text ou url (data:).');
    if (!/\.[a-z0-9]+$/i.test(name)) name += type === 'image/svg+xml' ? '.svg' : type === 'application/json' ? '.json' : '';
    return new File([data], name, { type: type });
  }
  /* Laisse l'historique et l'enregistrement automatique s'écrire (session locale ~0,7 s + IndexedDB). */
  async function persist() {
    var l = L();
    try { l.flushHistory(); } catch (e) {}
    await sleep(800);
    try { await l.autosaveNow(); } catch (e) {}
  }
  function refreshUI() { try { L().renderAll(); } catch (e) {} }
  /* Clic simulé dans un panneau : réutilise exactement le gestionnaire de l'interface. */
  function clickIn(paneId, attr, value) {
    var pane = document.getElementById(paneId);
    if (!pane) throw err('UI_ABSENTE', 'Panneau ' + paneId + ' introuvable.');
    var b = document.createElement('button');
    b.type = 'button'; b.hidden = true; b.setAttribute(attr, value);
    pane.appendChild(b);
    try { b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }
    finally { b.remove(); }
  }
  function ids(list) { return list.map(function (x) { return x[0]; }); }

  /* ---------- catalogues ---------- */
  function catalog() {
    var l = L();
    return {
      looks: l.LOOKS.map(function (x) { return { id: x.id, nom: x.name, categorie: x.cat }; }),
      materiaux: l.MATERIALS.map(function (x) { return { id: x[0], nom: x[1], categorie: (x[2] || {}).cat || null }; }),
      lumieres: l.LIGHTS.map(function (x) { return { id: x[0], nom: x[1] }; }),
      fonds: l.BGS.map(function (x) { return { id: x[0], nom: x[1] }; }),
      animations: l.ANIMS.map(function (x) { return { id: x[0], nom: x[1], categorie: x[2] || null }; }),
      profils: l.PROFILES.map(function (x) { return { id: x[0], nom: x[1] }; }),
      biseaux: l.BEVELS.map(function (x) { return { id: x[0], nom: x[1] }; }),
      courbes: l.EASES.map(function (x) { return { id: x[0], nom: x[1] }; }),
      cadres: Object.keys(l.RATIOS).map(function (k) { return { id: k, nom: l.RATIOS[k] }; }),
      vues: Object.keys(l.VIEWS).map(function (k) { return { id: k, nom: l.VIEWS[k][0] }; })
    };
  }

  /* ---------- état ---------- */
  function getStateSync() {
    var l = L(), D = l.st, f = D.mat.face || {}, sd = D.mat.side || {}, O = l.OUT;
    var media = l.MEDIA || {};
    return {
      app: APP,
      nom: D.name,
      logo: { svgOctets: (D.svg || '').length, estDemo: D.name === 'binks-design', imagePosee: !!(D.img && D.img.media) },
      look: D.look,
      cadre: D.ratio,
      vue: D.cam && D.cam.view,
      forme: { epaisseur: D.geo.depth, profil: D.geo.profile, intensite: D.geo.amount, biseau: D.geo.bevelShape, biseauLargeur: D.geo.bevelSize, biseauHauteur: D.geo.bevelThickness, qualite: D.geo.quality },
      materiau: { preset: f.preset || null, couleur: f.color, metal: f.metalness, rugosite: f.roughness, verre: f.transmission, vernis: f.clearcoat, type: f.type, tranchesSeparees: !!D.mat.split, tranches: D.mat.split ? { preset: sd.preset || null, couleur: sd.color } : null },
      lumiere: { preset: D.light.preset || null, exposition: D.light.exposure, rotation: D.light.envRot, ombre: D.light.contact },
      fond: { preset: D.bg.preset || null, type: D.bg.type, couleur1: D.bg.c1, couleur2: D.bg.c2, sol: D.bg.ground, reflet: D.bg.reflect },
      animation: { type: D.anim.type, duree: D.anim.dur, intensite: D.anim.intensity, courbe: D.anim.ease, frise: !!(D.tl && D.tl.on) },
      medias: Object.keys(media).map(function (k) { var m = media[k] || {}; return { id: k, type: m.kind || 'image', octets: m.url ? m.url.length : 0 }; }),
      reglagesExport: clone(O),
      exportEnCours: !!l.exporting,
      historique: { annulable: !(document.getElementById('undoBtn') || {}).disabled, retablissable: !(document.getElementById('redoBtn') || {}).disabled }
    };
  }

  /* ---------- export ---------- */
  var FORMATS = ['png', 'jpeg', 'mp4', 'webm', 'gif', 'png-sequence', 'glb', 'gltf', 'obj', 'stl', 'usdz', 'viewer', 'kit', 'project'];
  var busy = false;
  function configureExport(o) {
    var l = L(), U = l.OUT, f = o.format;
    if (o.ratio != null) l.setRatio(oneOf(String(o.ratio), Object.keys(l.RATIOS), 'ratio'));
    if (o.engine != null) U.engine = oneOf(o.engine, ['rt', 'pt'], 'engine');
    if (o.quality != null && U.engine === 'pt') U.ptq = oneOf(o.quality, ['draft', 'std', 'high', 'max', 'studio'], 'quality');
    if (f === 'png' || f === 'jpeg') {
      U.kind = 'image'; U.img = f;
      if (o.size != null) {
        var sz = Math.round(num(o.size, 256, 8192, 'size'));
        if ([1080, 1440, 2160].indexOf(sz) >= 0) U.res = sz; else { U.res = 'custom'; U.custom = sz - (sz % 2); }
      }
      if (o.transparent != null) U.transparent = !!o.transparent;
      if (o.jpegQuality != null) U.jpegQ = num(o.jpegQuality, 0.5, 1, 'jpegQuality');
    } else if (f === 'mp4' || f === 'webm' || f === 'gif' || f === 'png-sequence') {
      U.kind = 'video'; U.vid = f === 'png-sequence' ? 'png' : f;
      if (o.size != null) U.vres = Number(oneOf(Number(o.size), f === 'gif' ? [480, 720] : [720, 1080, 2160], 'size'));
      else if (f === 'gif' && U.vres > 720) U.vres = 720;
      else if (f !== 'gif' && U.vres === 480) U.vres = 1080;
      if (o.fps != null) U.fps = Number(oneOf(Number(o.fps), [30, 60], 'fps'));
      if (o.transparent != null) U.vtrans = !!o.transparent;
    } else if (['glb', 'gltf', 'obj', 'stl', 'usdz'].indexOf(f) >= 0) {
      U.kind = '3d'; U.d3 = f;
      if (o.widthMm != null) U.mm = Math.round(num(o.widthMm, 5, 5000, 'widthMm'));
    } else if (f === 'viewer') {
      U.kind = 'viewer'; if (o.autoRotate != null) U.vauto = !!o.autoRotate;
    } else if (f === 'kit') {
      U.kind = 'kit';
      var k = o.kit || {};
      if (k.sizes) U.kit.sizes = k.sizes.map(function (x) { return Number(oneOf(Number(x), [1080, 1440, 2160], 'kit.sizes')); });
      if (k.formats) U.kit.fmts = k.formats.map(function (x) { return oneOf(x, ['png', 'jpeg', 'mp4-1:1', 'mp4-9:16', 'mp4-16:9', 'glb'], 'kit.formats'); });
      if (k.colors) U.kit.vars = k.colors.map(function (x) { return oneOf(x, ['cur', 'noir', 'blanc', 'origine'], 'kit.colors'); });
    }
  }
  function triggerDownload(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
  }
  async function exporter(opts) {
    opts = opts || {};
    var l = L();
    var f = oneOf(String(opts.format || 'png').toLowerCase().replace('jpg', 'jpeg'), FORMATS, 'format');
    if (busy || l.exporting) throw err('OCCUPE', 'Un export est déjà en cours.');
    busy = true;
    try {
      var out;
      if (f === 'project') {
        var data = l.projectData();
        out = { blob: new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), name: l.slug() + '.logo3d.json' };
      } else {
        configureExport(Object.assign({}, opts, { format: f }));
        var got = null;
        window.__binksyCapture = function (r) { got = r; };
        try { await l.runExport(); } finally { window.__binksyCapture = null; }
        if (!got || !got.blob) throw err('EXPORT_ECHOUE', toastText() || "L'export a échoué.");
        out = got;
      }
      if (!out.blob.size) throw err('EXPORT_VIDE', 'Le fichier exporté est vide.');
      if (opts.download) triggerDownload(out.blob, out.name);
      return { files: [{ name: out.name, type: out.blob.type || 'application/octet-stream', size: out.blob.size, dataBase64: await blobToBase64(out.blob) }] };
    } finally { busy = false; }
  }

  /* ---------- import ---------- */
  async function importer(opts) {
    opts = opts || {};
    var l = L(), list = opts.files;
    if (!Array.isArray(list) || !list.length) throw err('AUCUN_FICHIER', 'files doit contenir au moins un fichier.');
    var results = [];
    for (var i = 0; i < list.length; i++) {
      var file = toFile(list[i]), D = l.st;
      var t = file.type, n = file.name.toLowerCase();
      var before = { svg: D.svg, img: D.img && D.img.media, json: JSON.stringify(D).length + ':' + D.name };
      var kind = /\.json$/.test(n) || t === 'application/json' ? 'projet' : (/\.svg$/.test(n) || t === 'image/svg+xml') ? 'logo' : /^image\/(png|jpeg|webp)$/.test(t) ? 'image' : null;
      if (!kind) throw err('FORMAT_NON_GERE', '"' + file.name + '" : importe un SVG (logo), une image PNG/JPEG/WebP (posée sur le logo) ou un projet .logo3d.json.');
      if (kind === 'logo') {
        var txt = await file.text();
        await l.importFile(file);
        if (l.st.svg !== txt) throw err('IMPORT_ECHOUE', toastText() || 'SVG illisible.');
      } else if (kind === 'image') {
        await l.importFile(file);
        var ok = false;
        for (var w = 0; w < 50 && !ok; w++) { await sleep(100); ok = l.st.img && l.st.img.media && l.st.img.media !== before.img; }
        if (!ok) throw err('IMPORT_ECHOUE', toastText() || 'Image illisible.');
      } else {
        await l.importFile(file);
        var now = JSON.stringify(l.st).length + ':' + l.st.name;
        if (now === before.json && !/ouvert/i.test(toastText())) throw err('IMPORT_ECHOUE', toastText() || "Ce fichier n'est pas un projet Logo 3D Studio.");
      }
      results.push({ name: file.name, as: kind });
    }
    await persist();
    return { imported: results, state: getStateSync() };
  }

  /* ---------- réglages ---------- */
  function setP(path, value) { L().setParam(path, value); }

  async function setForme(o) {
    o = o || {}; var l = L(), D = l.st;
    if (o.profil != null) { var p = oneOf(o.profil, ids(l.PROFILES), 'profil'); D.geo.profile = p; if (p === 'pill' && D.geo.depth < 0.12) D.geo.depth = 0.3; setP('geo.profile', p); }
    if (o.epaisseur != null) setP('geo.depth', +num(o.epaisseur, 0.004, 2, 'epaisseur').toFixed(4));
    if (o.intensite != null) setP('geo.amount', num(o.intensite, 0, 1, 'intensite'));
    if (o.douceur != null) setP('geo.soft', num(o.douceur, 0, 1, 'douceur'));
    if (o.biseau != null) { var b = oneOf(o.biseau, ids(l.BEVELS), 'biseau'); D.geo.bevelShape = b; D.geo.bevel = b !== 'none'; setP('geo.bevelShape', b); }
    if (o.biseauLargeur != null) setP('geo.bevelSize', num(o.biseauLargeur, 0.002, 0.3, 'biseauLargeur'));
    if (o.biseauHauteur != null) setP('geo.bevelThickness', num(o.biseauHauteur, 0.002, 0.35, 'biseauHauteur'));
    if (o.qualite != null) setP('geo.quality', oneOf(o.qualite, ['draft', 'std', 'high'], 'qualite'));
    refreshUI(); await persist(); return getStateSync().forme;
  }
  async function setMateriau(o) {
    o = o || {}; var l = L(), D = l.st;
    var cible = o.cible || 'face';
    oneOf(cible, ['face', 'side'], 'cible');
    if (cible === 'side' && !D.mat.split) throw err('PAS_DE_TRANCHES', "Les tranches ne sont pas séparées : applique un look à tranches ou règle d'abord mat.split à true via setParam.");
    var prev = l.ui.matEdit; l.ui.matEdit = cible;
    try {
      if (o.preset != null) { oneOf(o.preset, ids(l.MATERIALS), 'preset'); clickIn('pane-matiere', 'data-mat', o.preset); }
      if (o.couleur != null) setP('mat.cur.color', color(o.couleur, 'couleur'));
      if (o.metal != null) setP('mat.cur.metalness', num(o.metal, 0, 1, 'metal'));
      if (o.rugosite != null) setP('mat.cur.roughness', num(o.rugosite, 0, 1, 'rugosite'));
      if (o.verre != null) setP('mat.cur.transmission', num(o.verre, 0, 1, 'verre'));
      if (o.vernis != null) setP('mat.cur.clearcoat', num(o.vernis, 0, 1, 'vernis'));
      if (o.lueur != null) setP('mat.cur.emissiveIntensity', num(o.lueur, 0, 6, 'lueur'));
      if (o.couleursDuSvg != null) setP('mat.keepColors', !!o.couleursDuSvg);
    } finally { l.ui.matEdit = prev; }
    refreshUI(); await persist(); return getStateSync().materiau;
  }
  async function setLumiere(o) {
    o = o || {}; var l = L();
    if (o.preset != null) { oneOf(o.preset, ids(l.LIGHTS), 'preset'); clickIn('pane-lumiere', 'data-light', o.preset); }
    if (o.exposition != null) setP('light.exposure', num(o.exposition, 0.2, 2.5, 'exposition'));
    if (o.intensite != null) setP('light.envInt', num(o.intensite, 0, 3, 'intensite'));
    if (o.rotation != null) setP('light.envRot', Math.round(num(o.rotation, -180, 180, 'rotation')));
    if (o.ombre != null) setP('light.contact', !!o.ombre);
    if (o.tonalite != null) setP('light.tone', oneOf(o.tonalite, ['agx', 'neutral', 'aces'], 'tonalite'));
    refreshUI(); await persist(); return getStateSync().lumiere;
  }
  async function setFond(o) {
    o = o || {}; var l = L();
    if (o.preset != null) { oneOf(o.preset, ids(l.BGS), 'preset'); clickIn('pane-scene', 'data-bg', o.preset); }
    if (o.type != null) setP('bg.type', oneOf(o.type, ['transparent', 'color', 'gradient'], 'type'));
    if (o.couleur1 != null) setP('bg.c1', color(o.couleur1, 'couleur1'));
    if (o.couleur2 != null) setP('bg.c2', color(o.couleur2, 'couleur2'));
    if (o.sol != null) setP('bg.ground', !!o.sol);
    if (o.reflet != null) setP('bg.reflect', !!o.reflet);
    refreshUI(); await persist(); return getStateSync().fond;
  }
  async function setAnimation(o) {
    o = o || {}; var l = L();
    if (o.type != null) { oneOf(o.type, ids(l.ANIMS), 'type'); l.chooseAnim(o.type); }
    if (o.duree != null) setP('anim.dur', num(o.duree, 2, 12, 'duree'));
    if (o.intensite != null) setP('anim.intensity', num(o.intensite, 0, 1, 'intensite'));
    if (o.courbe != null) setP('anim.ease', oneOf(o.courbe, ids(l.EASES), 'courbe'));
    if (o.lecture != null) l.setPlaying(!!o.lecture);
    refreshUI(); await persist(); return getStateSync().animation;
  }
  async function setCadre(o) {
    o = o || {}; var l = L();
    if (o.ratio != null) l.setRatio(oneOf(String(o.ratio), Object.keys(l.RATIOS), 'ratio'));
    if (o.vue != null) l.setView(oneOf(String(o.vue), Object.keys(l.VIEWS), 'vue'));
    await persist(); return { cadre: l.st.ratio, vue: l.st.cam.view };
  }
  var PARAM_ROOTS = ['geo', 'mat', 'light', 'bg', 'post', 'cam', 'anim', 'xf', 'halo', 'style', 'tex'];
  async function setParam(o) {
    o = o || {}; var path = String(o.path || '');
    if (!/^[a-zA-Z]+(\.[a-zA-Z0-9]+)+$/.test(path) || PARAM_ROOTS.indexOf(path.split('.')[0]) < 0) throw err('CHEMIN_INVALIDE', 'path doit commencer par ' + PARAM_ROOTS.join(', ') + ' (ex. "post.bloom", "mat.cur.roughness").');
    var cur = path.split('.').reduce(function (a, k) { if (k === 'cur' && a === S().mat) k = 'face'; return a == null ? a : a[k]; }, S());
    if (cur === undefined) throw err('CHEMIN_INCONNU', 'Réglage inconnu : ' + path + '. Lis getState() / setParam avec un chemin existant.');
    if (cur !== null && typeof cur === 'object') throw err('CHEMIN_OBJET', path + ' est un groupe : vise une valeur précise.');
    var v = o.value;
    if (typeof cur === 'number') v = num(v, null, null, path);
    else if (typeof cur === 'boolean') v = v === true || v === 'true' || v === 1;
    else if (typeof cur === 'string' && /^#[0-9a-f]{6}$/i.test(cur)) v = color(v, path);
    setP(path, v);
    refreshUI(); await persist();
    return { path: path, value: v };
  }

  /* ---------- table unique des outils (BinksyAPI + WebMCP) ---------- */
  var OBJ = function (props, req) { var s = { type: 'object', properties: props || {}, additionalProperties: false }; if (req) s.required = req; return s; };
  var FILES = { type: 'array', minItems: 1, items: OBJ({ name: { type: 'string', description: 'Nom du fichier, ex. "logo.svg".' }, type: { type: 'string', description: 'Type MIME (image/svg+xml, image/png, image/jpeg, image/webp, application/json).' }, dataBase64: { type: 'string', description: 'Contenu en base64.' }, text: { type: 'string', description: 'Contenu texte (SVG ou JSON).' }, url: { type: 'string', description: 'URL data: uniquement.' } }, ['name']) };

  var TOOLS = [
    { name: 'describe', method: 'describe', description: "Décrit Logo 3D Studio et la liste des outils de l'agent.", inputSchema: OBJ(), run: function () { return api.describe(); } },
    { name: 'etat', method: 'getState', description: "Résumé de l'état courant : logo, look, forme, matière, lumière, fond, animation, cadre, réglages d'export (sans données binaires).", inputSchema: OBJ(), run: function () { return api.getState(); } },
    { name: 'importer', method: 'importer', description: "Importe des fichiers comme un dépôt dans l'app : un SVG devient le logo 3D, une image PNG/JPEG/WebP est posée sur le logo (décalque), un .logo3d.json rouvre un projet. Le logo raster n'est pas extrudé : fournis un SVG.", inputSchema: OBJ({ files: FILES }, ['files']), run: function (a) { return api.importer(a); } },
    { name: 'exporter', method: 'exporter', description: "Exporte le rendu et renvoie les fichiers en base64 (aucun téléchargement forcé sauf download:true). Formats : png, jpeg (image), mp4, webm, gif, png-sequence (vidéo de la boucle), glb, gltf, obj, stl, usdz (objet 3D), viewer (HTML autonome), kit (ZIP), project (.logo3d.json). La vidéo peut prendre du temps.",
      inputSchema: OBJ({ format: { type: 'string', enum: FORMATS }, size: { type: 'number', description: 'Image : petit côté en px (1080, 1440, 2160 ou 256-8192). Vidéo : 720, 1080, 2160 (GIF : 480 ou 720).' }, ratio: { type: 'string', enum: ['free', '1:1', '16:9', '9:16', '4:5'], description: 'Cadre (modifie aussi le cadre du projet).' }, transparent: { type: 'boolean', description: 'Fond transparent (PNG, WebM, GIF, png-sequence).' }, jpegQuality: { type: 'number', minimum: 0.5, maximum: 1 }, fps: { type: 'number', enum: [30, 60] }, engine: { type: 'string', enum: ['rt', 'pt'], description: 'rt = temps réel (défaut), pt = photoréaliste (lent).' }, quality: { type: 'string', enum: ['draft', 'std', 'high', 'max', 'studio'], description: 'Qualité du moteur photoréaliste.' }, widthMm: { type: 'number', description: 'Largeur réelle de l’objet 3D en mm.' }, autoRotate: { type: 'boolean', description: 'Visionneuse : rotation automatique.' }, kit: OBJ({ sizes: { type: 'array', items: { type: 'number', enum: [1080, 1440, 2160] } }, formats: { type: 'array', items: { type: 'string', enum: ['png', 'jpeg', 'mp4-1:1', 'mp4-9:16', 'mp4-16:9', 'glb'] } }, colors: { type: 'array', items: { type: 'string', enum: ['cur', 'noir', 'blanc', 'origine'] } } }), download: { type: 'boolean', description: 'Déclenche aussi le téléchargement dans le navigateur.' } }, ['format']),
      outputSchema: OBJ({ files: { type: 'array', items: OBJ({ name: { type: 'string' }, type: { type: 'string' }, size: { type: 'number' }, dataBase64: { type: 'string' } }) } }),
      run: function (a) { return api.exporter(a); } },
    { name: 'lister_options', method: 'listerOptions', description: 'Catalogues disponibles (ids + noms) : looks, matériaux, lumières, fonds, animations, profils, biseaux, courbes, cadres, vues.', inputSchema: OBJ(), run: function () { return api.listerOptions(); } },
    { name: 'lister_looks', method: 'listerLooks', description: 'Liste les looks prêts à l’emploi (id, nom, catégorie), filtrables par catégorie.', inputSchema: OBJ({ categorie: { type: 'string', enum: ['ref', 'metal', 'verre', 'couleur', 'brut', 'nuit', 'style'] } }), run: function (a) { return api.listerLooks(a); } },
    { name: 'appliquer_look', method: 'appliquerLook', description: 'Applique un look complet (matière, lumière, fond, volume, effets) par son id.', inputSchema: OBJ({ id: { type: 'string' } }, ['id']), run: function (a) { return api.appliquerLook(a); } },
    { name: 'forme', method: 'setForme', description: 'Règle le volume : épaisseur (0.004-2), profil, intensité, douceur, biseau et sa taille, qualité du maillage.', inputSchema: OBJ({ epaisseur: { type: 'number', minimum: 0.004, maximum: 2 }, profil: { type: 'string', enum: ['flat', 'inflate', 'dome', 'chisel', 'facets', 'hollow', 'pill'] }, intensite: { type: 'number', minimum: 0, maximum: 1 }, douceur: { type: 'number', minimum: 0, maximum: 1 }, biseau: { type: 'string', enum: ['none', 'round', 'chamfer', 'cove', 'step', 'double', 'ogee'] }, biseauLargeur: { type: 'number', minimum: 0.002, maximum: 0.3 }, biseauHauteur: { type: 'number', minimum: 0.002, maximum: 0.35 }, qualite: { type: 'string', enum: ['draft', 'std', 'high'] } }), run: function (a) { return api.setForme(a); } },
    { name: 'materiau', method: 'setMateriau', description: 'Règle la matière de la face (ou des tranches si séparées) : preset (id de lister_options.materiaux), couleur #rrggbb, métal, rugosité, verre, vernis, lueur, ou garder les couleurs du SVG.', inputSchema: OBJ({ cible: { type: 'string', enum: ['face', 'side'] }, preset: { type: 'string' }, couleur: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, metal: { type: 'number', minimum: 0, maximum: 1 }, rugosite: { type: 'number', minimum: 0, maximum: 1 }, verre: { type: 'number', minimum: 0, maximum: 1 }, vernis: { type: 'number', minimum: 0, maximum: 1 }, lueur: { type: 'number', minimum: 0, maximum: 6 }, couleursDuSvg: { type: 'boolean' } }), run: function (a) { return api.setMateriau(a); } },
    { name: 'lumiere', method: 'setLumiere', description: 'Règle la lumière : preset (id de lister_options.lumieres), exposition, intensité de l’environnement, rotation, ombre au sol, tonalité.', inputSchema: OBJ({ preset: { type: 'string' }, exposition: { type: 'number', minimum: 0.2, maximum: 2.5 }, intensite: { type: 'number', minimum: 0, maximum: 3 }, rotation: { type: 'number', minimum: -180, maximum: 180 }, ombre: { type: 'boolean' }, tonalite: { type: 'string', enum: ['agx', 'neutral', 'aces'] } }), run: function (a) { return api.setLumiere(a); } },
    { name: 'fond', method: 'setFond', description: 'Règle le fond : preset (id de lister_options.fonds), type (transparent, color, gradient), couleurs, sol, reflet.', inputSchema: OBJ({ preset: { type: 'string' }, type: { type: 'string', enum: ['transparent', 'color', 'gradient'] }, couleur1: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, couleur2: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, sol: { type: 'boolean' }, reflet: { type: 'boolean' } }), run: function (a) { return api.setFond(a); } },
    { name: 'animation', method: 'setAnimation', description: 'Choisit l’animation de la boucle (id de lister_options.animations, "none" pour aucune), durée (2-12 s), intensité, courbe, lecture.', inputSchema: OBJ({ type: { type: 'string' }, duree: { type: 'number', minimum: 2, maximum: 12 }, intensite: { type: 'number', minimum: 0, maximum: 1 }, courbe: { type: 'string', enum: ['lin', 'sine', 'cubic', 'expo', 'back'] }, lecture: { type: 'boolean' } }), run: function (a) { return api.setAnimation(a); } },
    { name: 'cadre', method: 'setCadre', description: 'Règle le cadre (free, 1:1, 16:9, 9:16, 4:5) et/ou la vue de caméra (face, 34, top, iso).', inputSchema: OBJ({ ratio: { type: 'string', enum: ['free', '1:1', '16:9', '9:16', '4:5'] }, vue: { type: 'string', enum: ['face', '34', 'top', 'iso'] } }), run: function (a) { return api.setCadre(a); } },
    { name: 'set_param', method: 'setParam', description: 'Réglage avancé par chemin (même logique que les curseurs de l’interface), ex. {"path":"post.bloom","value":true}, {"path":"mat.cur.iridescence","value":0.5}, {"path":"xf.ry","value":30}. Le chemin doit exister dans l’état.', inputSchema: OBJ({ path: { type: 'string' }, value: { type: ['number', 'string', 'boolean'] } }, ['path', 'value']), run: function (a) { return api.setParam(a); } },
    { name: 'annuler', method: 'annuler', description: 'Annule la dernière modification (comme le bouton Annuler).', inputSchema: OBJ(), run: function () { return api.annuler(); } },
    { name: 'retablir', method: 'retablir', description: 'Rétablit la modification annulée.', inputSchema: OBJ(), run: function () { return api.retablir(); } },
    { name: 'reset', method: 'reset', description: 'Réinitialise le projet (logo de démo Binks Design + look par défaut). Efface le logo courant de l’écran (annulable) : demande confirmation à l’utilisateur avant.', inputSchema: OBJ({ confirm: { type: 'boolean', description: 'Doit valoir true.' } }, ['confirm']), run: function (a) { return api.reset(a); } }
  ];

  var readyP = null;
  var api = {
    describe: async function () {
      return {
        app: APP, version: VERSION, apiVersion: '1',
        description: 'Logo 3D Studio (Binks Design) : transforme un logo SVG en objet 3D (volume, biseau, matière, lumière, fond, animation) et exporte image, vidéo, objet 3D, visionneuse ou kit. 100 % local, rien n’est envoyé.',
        tools: TOOLS.map(function (t) { var d = { name: PREFIX + t.name, method: t.method, description: t.description, inputSchema: t.inputSchema }; if (t.outputSchema) d.outputSchema = t.outputSchema; return d; })
      };
    },
    ready: function () {
      if (!readyP) readyP = (async function () {
        for (var i = 0; i < 600 && !(window.L3D_READY && window.L3D && window.L3D.importFile); i++) await sleep(100);
        if (!(window.L3D_READY && window.L3D)) throw err('PAS_PRET', "L'app n'a pas démarré (WebGL indisponible ?).");
        return { ready: true };
      })();
      return readyP;
    },
    getState: async function () { await api.ready(); return getStateSync(); },
    importer: async function (o) { await api.ready(); return importer(o); },
    exporter: async function (o) { await api.ready(); return exporter(o); },
    listerOptions: async function () { await api.ready(); return catalog(); },
    listerLooks: async function (o) { await api.ready(); var c = (o && o.categorie) || null; return catalog().looks.filter(function (x) { return !c || x.categorie === c; }); },
    appliquerLook: async function (o) {
      await api.ready(); var l = L(), id = o && o.id;
      var look = l.LOOKS.find(function (x) { return x.id === id; });
      if (!look) throw err('LOOK_INCONNU', 'Look inconnu : ' + id + '. Utilise listerLooks().');
      l.applyLook(look); refreshUI(); await persist();
      return { look: l.st.look };
    },
    setForme: async function (o) { await api.ready(); return setForme(o); },
    setMateriau: async function (o) { await api.ready(); return setMateriau(o); },
    setLumiere: async function (o) { await api.ready(); return setLumiere(o); },
    setFond: async function (o) { await api.ready(); return setFond(o); },
    setAnimation: async function (o) { await api.ready(); return setAnimation(o); },
    setCadre: async function (o) { await api.ready(); return setCadre(o); },
    setParam: async function (o) { await api.ready(); return setParam(o); },
    annuler: async function () { await api.ready(); L().undo(); await persist(); return getStateSync().historique; },
    retablir: async function () { await api.ready(); L().redo(); await persist(); return getStateSync().historique; },
    reset: async function (o) {
      await api.ready();
      if (!o || o.confirm !== true) throw err('CONFIRMATION_REQUISE', 'Passe { confirm: true } après accord de l’utilisateur.');
      var l = L(), st = l.defaults(); st.cam.fr = null; st.name = 'binks-design';
      await l.loadProjectText(JSON.stringify({ app: 'logo-3d-studio', v: 4, state: st, media: {}, kinds: {} }));
      await persist(); return getStateSync();
    }
  };
  /* Erreurs toujours au format { code, message } */
  Object.keys(api).forEach(function (k) {
    var f = api[k];
    api[k] = function () { var self = this, args = arguments; return Promise.resolve().then(function () { return f.apply(self, args); }).catch(function (e) { throw plain(e); }); };
  });
  Object.defineProperty(window, 'BinksyAPI', { value: Object.freeze(api), configurable: true, enumerable: false });

  /* ---------- WebMCP (feature-detect, zéro erreur si absent) ---------- */
  var MCP_INLINE_LIMIT = 4 * 1024 * 1024;
  function mcpTool(t) {
    return {
      name: PREFIX + t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: ['describe', 'etat', 'lister_options', 'lister_looks'].indexOf(t.name) >= 0 },
      execute: async function (args) {
        try {
          var r = await t.run(args || {});
          if (t.name === 'exporter' && r && r.files) r = { files: r.files.map(function (f) { return f.dataBase64.length > MCP_INLINE_LIMIT ? { name: f.name, type: f.type, size: f.size, dataOmis: true, conseil: 'Fichier trop gros pour la réponse : relance avec download:true ou appelle window.BinksyAPI.exporter().' } : f; }) };
          return { content: [{ type: 'text', text: JSON.stringify(r) }] };
        } catch (e) {
          return { isError: true, content: [{ type: 'text', text: JSON.stringify(plain(e)) }] };
        }
      }
    };
  }
  function registerWebMCP() {
    try {
      var tools = TOOLS.map(mcpTool);
      var mc = (document.modelContext && typeof document.modelContext.registerTool === 'function') ? document.modelContext
        : (navigator.modelContext || null);
      if (!mc) return;
      if (typeof mc.registerTool === 'function') {
        tools.forEach(function (t) { try { var p = mc.registerTool(t); if (p && p.catch) p.catch(function () {}); } catch (e) {} });
      } else if (typeof mc.provideContext === 'function') {
        var p2 = mc.provideContext({ tools: tools }); if (p2 && p2.catch) p2.catch(function () {});
      }
    } catch (e) { /* WebMCP absent ou refusé : l'app continue normalement */ }
  }
  registerWebMCP();
})();
