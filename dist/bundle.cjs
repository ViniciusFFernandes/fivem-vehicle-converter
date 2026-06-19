var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.js
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);

// src/converter.js
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);

// src/rpf-reader.js
var import_zlib = require("zlib");
var RPF7_MAGIC = 1380992567;
var ENCRYPT_NONE = 0;
var ENCRYPT_OPEN = 1313165391;
var DIR_MARKER = 2147483392;
var RpfReader = class {
  /**
   * @param {Buffer} buffer — conteúdo completo do .rpf em memória
   */
  constructor(buffer) {
    this.buf = buffer;
    this._parse();
  }
  _parse() {
    const buf = this.buf;
    const magic = buf.readUInt32LE(0);
    if (magic !== RPF7_MAGIC) throw new Error("Arquivo n\xE3o \xE9 RPF7 (magic inv\xE1lido)");
    const entryCount = buf.readUInt32LE(4);
    const namesLen = buf.readUInt32LE(8);
    const encryption = buf.readUInt32LE(12);
    if (encryption !== ENCRYPT_NONE && encryption !== ENCRYPT_OPEN) {
      throw new Error(
        `RPF criptografado (tipo 0x${encryption.toString(16).toUpperCase()}). Use o OpenIV para extrair manualmente e recoloque os arquivos soltos na pasta do ve\xEDculo.`
      );
    }
    const entryTableStart = 16;
    const namesStart = entryTableStart + entryCount * 16;
    const dataStart = namesStart + namesLen;
    const namesRaw = buf.slice(namesStart, namesStart + namesLen);
    const rawEntries = [];
    for (let i = 0; i < entryCount; i++) {
      const base = entryTableStart + i * 16;
      rawEntries.push({
        nameOff: buf.readUInt32LE(base) & 268435455,
        d1: buf.readUInt32LE(base + 4),
        d2: buf.readUInt32LE(base + 8),
        d3: buf.readUInt32LE(base + 12)
      });
    }
    this.files = {};
    this._walkDir(rawEntries, namesRaw, buf, dataStart, 0, "");
  }
  _readName(namesRaw, offset) {
    let end = offset;
    while (end < namesRaw.length && namesRaw[end] !== 0) end++;
    return namesRaw.slice(offset, end).toString("utf8");
  }
  _walkDir(entries, namesRaw, buf, dataStart, entryIdx, pathPrefix) {
    const e = entries[entryIdx];
    const isDir = e.d3 === DIR_MARKER || e.d3 >>> 8 === 8388607;
    if (!isDir) {
      const rawOffset = (e.d1 & 8388607) * 512;
      const compressedSize = e.d2;
      const realSize = e.d3;
      const name2 = this._readName(namesRaw, e.nameOff);
      if (!name2) return;
      const fullPath = pathPrefix ? `${pathPrefix}/${name2}` : name2;
      let data;
      if (realSize === 0 || realSize === compressedSize) {
        data = buf.slice(dataStart + rawOffset, dataStart + rawOffset + compressedSize);
      } else {
        const compressed = buf.slice(dataStart + rawOffset, dataStart + rawOffset + compressedSize);
        try {
          data = (0, import_zlib.inflateSync)(compressed);
        } catch {
          try {
            data = (0, import_zlib.inflateSync)(compressed, { finishFlush: 2 });
          } catch {
            data = compressed;
          }
        }
      }
      this.files[fullPath] = data;
      return;
    }
    const name = this._readName(namesRaw, e.nameOff);
    const childPath = pathPrefix ? name ? `${pathPrefix}/${name}` : pathPrefix : name;
    const childStart = e.d1;
    const childCount = e.d2;
    for (let i = childStart; i < childStart + childCount; i++) {
      if (i === entryIdx) continue;
      this._walkDir(entries, namesRaw, buf, dataStart, i, childPath);
    }
  }
  /** Retorna lista de todos os caminhos internos */
  listFiles() {
    return Object.keys(this.files);
  }
  /** Retorna o Buffer de um arquivo interno pelo caminho */
  getFile(path3) {
    return this.files[path3];
  }
};

// src/manifest.js
var DATA_FILE_MAP = {
  "handling.meta": "HANDLING_FILE",
  "vehicles.meta": "VEHICLE_METADATA_FILE",
  "carcols.meta": "CARCOLS_FILE",
  "carvariations.meta": "VEHICLE_VARIATION_FILE",
  "vehiclelayouts.meta": "VEHICLE_LAYOUTS_FILE",
  "carsales.meta": "CARSALES_FILE",
  "contentunlocks.meta": "CONTENT_UNLOCKING_META_FILE",
  "dlctext.meta": "DLCTEXT_META_FILE",
  "vehiclePopGroups.meta": "POPZONE_FILE",
  "popgroups.ymt": "POPZONE_FILE"
};
function generateManifest(resourceName, dataFiles) {
  const lines = [
    `fx_version 'cerulean'`,
    `game 'gta5'`,
    ``,
    `name '${resourceName}'`,
    `description 'Ve\xEDculo convertido automaticamente'`,
    `version '1.0.0'`,
    ``
  ];
  const knownMeta = dataFiles.filter((f) => {
    const base = f.split("/").pop().toLowerCase();
    return Object.keys(DATA_FILE_MAP).some((k) => base === k);
  });
  const unknownMeta = dataFiles.filter((f) => !knownMeta.includes(f));
  if (knownMeta.length > 0) {
    for (const filePath of knownMeta) {
      const base = filePath.split("/").pop().toLowerCase();
      const type = Object.entries(DATA_FILE_MAP).find(([k]) => base === k)?.[1];
      lines.push(`data_file '${type}' '${filePath}'`);
    }
    lines.push("");
  }
  if (unknownMeta.length > 0) {
    lines.push("-- Arquivos .meta n\xE3o identificados (adicione manualmente se necess\xE1rio):");
    for (const f of unknownMeta) lines.push(`-- data_file 'UNKNOWN' '${f}'`);
    lines.push("");
  }
  return lines.join("\n");
}

// src/converter.js
var STREAM_EXTS = /* @__PURE__ */ new Set([".yft", ".ytd", ".ybn", ".ycd", ".yld", ".ypt", ".ymt"]);
var META_EXTS = /* @__PURE__ */ new Set([".meta", ".ymt", ".dat"]);
async function convertVehicle(vehicleFolder, outputRoot2) {
  const vehicleName = import_path.default.basename(vehicleFolder);
  const rpfFiles = findRpf(vehicleFolder);
  if (rpfFiles.length === 0) {
    const looseFiles = import_fs.default.readdirSync(vehicleFolder, { recursive: true }).filter((f) => typeof f === "string" && STREAM_EXTS.has(import_path.default.extname(f).toLowerCase()));
    if (looseFiles.length === 0) {
      return { name: vehicleName, status: "skip", message: "Nenhum .rpf ou arquivo de modelo encontrado" };
    }
    return convertLooseFiles(vehicleFolder, vehicleName, outputRoot2);
  }
  const extracted = {};
  for (const rpfPath of rpfFiles) {
    try {
      const buf = import_fs.default.readFileSync(rpfPath);
      const reader = new RpfReader(buf);
      for (const [filePath, data] of Object.entries(reader.files)) {
        extracted[filePath] = data;
      }
    } catch (err) {
      return { name: vehicleName, status: "error", message: err.message };
    }
  }
  return buildResource(vehicleName, extracted, outputRoot2);
}
function findRpf(dir) {
  const results = [];
  try {
    for (const entry of import_fs.default.readdirSync(dir, { withFileTypes: true })) {
      const full = import_path.default.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findRpf(full));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".rpf")) {
        results.push(full);
      }
    }
  } catch {
  }
  return results;
}
function convertLooseFiles(vehicleFolder, vehicleName, outputRoot2) {
  const allFiles = [];
  collectLoose(vehicleFolder, vehicleFolder, allFiles);
  const fileMap = {};
  for (const { rel, full } of allFiles) {
    fileMap[rel] = import_fs.default.readFileSync(full);
  }
  return buildResource(vehicleName, fileMap, outputRoot2);
}
function collectLoose(base, dir, results) {
  for (const entry of import_fs.default.readdirSync(dir, { withFileTypes: true })) {
    const full = import_path.default.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectLoose(base, full, results);
    } else {
      results.push({ rel: import_path.default.relative(base, full).replace(/\\/g, "/"), full });
    }
  }
}
function buildResource(vehicleName, files, outputRoot2) {
  const resourceDir = import_path.default.join(outputRoot2, vehicleName);
  const streamDir = import_path.default.join(resourceDir, "stream");
  const dataDir = import_path.default.join(resourceDir, "data");
  import_fs.default.mkdirSync(streamDir, { recursive: true });
  import_fs.default.mkdirSync(dataDir, { recursive: true });
  const dataFiles = [];
  let streamCount = 0;
  for (const [filePath, data] of Object.entries(files)) {
    const fileName = import_path.default.basename(filePath);
    const ext = import_path.default.extname(fileName).toLowerCase();
    if (STREAM_EXTS.has(ext)) {
      if (ext === ".ymt" && isDataYmt(fileName)) {
        const dest = import_path.default.join(dataDir, fileName);
        import_fs.default.writeFileSync(dest, data);
        dataFiles.push(`data/${fileName}`);
      } else {
        import_fs.default.writeFileSync(import_path.default.join(streamDir, fileName), data);
        streamCount++;
      }
    } else if (META_EXTS.has(ext)) {
      const dest = import_path.default.join(dataDir, fileName);
      import_fs.default.writeFileSync(dest, data);
      dataFiles.push(`data/${fileName}`);
    }
  }
  if (streamCount === 0 && dataFiles.length === 0) {
    import_fs.default.rmSync(resourceDir, { recursive: true, force: true });
    return { name: vehicleName, status: "skip", message: "Nenhum arquivo de modelo ou dado encontrado dentro do RPF" };
  }
  const manifest = generateManifest(vehicleName, dataFiles);
  import_fs.default.writeFileSync(import_path.default.join(resourceDir, "fxmanifest.lua"), manifest, "utf8");
  return {
    name: vehicleName,
    status: "ok",
    message: `${streamCount} arquivo(s) de stream, ${dataFiles.length} meta(s)`
  };
}
function isDataYmt(fileName) {
  const dataYmts = ["carvariations", "vehiclelayouts", "popgroups"];
  const base = import_path.default.basename(fileName, ".ymt").toLowerCase();
  return dataYmts.some((d) => base.includes(d));
}

// src/index.js
var appDir = import_path2.default.dirname(process.execPath || process.argv[1]);
var inputRoot = import_path2.default.join(appDir, "VeiculosOriginais");
var outputRoot = import_path2.default.join(appDir, "VeiculosConvertidos");
import_fs2.default.mkdirSync(inputRoot, { recursive: true });
import_fs2.default.mkdirSync(outputRoot, { recursive: true });
var vehicleFolders = import_fs2.default.readdirSync(inputRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => import_path2.default.join(inputRoot, e.name));
if (vehicleFolders.length === 0) {
  console.log(`
\u{1F697}  FiveM Vehicle Converter`);
  console.log(`
   Nenhum ve\xEDculo encontrado em VeiculosOriginais.`);
  console.log(`   Coloque as pastas dos ve\xEDculos l\xE1 e rode novamente.
`);
  process.exit(0);
}
console.log(`
\u{1F697}  FiveM Vehicle Converter`);
console.log(`   Entrada : ${inputRoot}`);
console.log(`   Sa\xEDda   : ${outputRoot}`);
console.log(`   Ve\xEDculos: ${vehicleFolders.length}
`);
async function run() {
  let ok = 0, skipped = 0, errors = 0;
  for (const folder of vehicleFolders) {
    const name = import_path2.default.basename(folder);
    process.stdout.write(`  \u23F3 ${name.padEnd(30)}`);
    const result = await convertVehicle(folder, outputRoot);
    if (result.status === "ok") {
      console.log(`\u2705  ${result.message}`);
      ok++;
    } else if (result.status === "skip") {
      console.log(`\u23ED\uFE0F   IGNORADO \u2014 ${result.message}`);
      skipped++;
    } else {
      console.log(`\u274C  ERRO \u2014 ${result.message}`);
      errors++;
    }
  }
  console.log(`
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  \u2705  Convertidos : ${ok}
  \u23ED\uFE0F   Ignorados  : ${skipped}
  \u274C  Erros       : ${errors}
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  Resources em: ${outputRoot}
`);
  if (errors > 0) {
    console.log(`  \u26A0\uFE0F  Ve\xEDculos com ERRO provavelmente t\xEAm RPF criptografado.`);
    console.log(`     Abra o OpenIV, exporte os arquivos manualmente e recoloque`);
    console.log(`     os arquivos soltos na pasta do ve\xEDculo. O conversor aceitar\xE1`);
    console.log(`     arquivos .yft/.ytd/.meta soltos sem precisar do .rpf.
`);
  }
}
run().catch((err) => {
  console.error("Erro fatal:", err.message);
  process.exit(1);
});
