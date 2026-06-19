import fs   from 'fs';
import path  from 'path';
import { generateManifest } from './manifest.js';

// Extensões de modelo → pasta stream/
const STREAM_EXTS = new Set(['.yft', '.ytd', '.ybn', '.ycd', '.yld', '.ypt']);

// Extensões de dado → pasta data/ + entrada no fxmanifest
const META_EXTS = new Set(['.meta', '.dat']);

// .ymt pode ser stream ou dado — decide pelo nome
const DATA_YMT_NAMES = ['carvariations', 'vehiclelayouts', 'popgroups'];

/**
 * Converte uma pasta de arquivos exportados do OpenIV para um resource FiveM.
 * Aceita qualquer combinação de .yft, .ytd, .ybn, .meta, .dat, .ymt soltos.
 */
export async function convertVehicle(vehicleFolder, outputRoot) {
    const vehicleName = path.basename(vehicleFolder);

    const allFiles = [];
    collectFiles(vehicleFolder, vehicleFolder, allFiles);

    const streamFiles = allFiles.filter(f => STREAM_EXTS.has(ext(f)));
    const metaFiles   = allFiles.filter(f => META_EXTS.has(ext(f)));
    const ymtFiles    = allFiles.filter(f => ext(f) === '.ymt');

    if (streamFiles.length === 0 && metaFiles.length === 0 && ymtFiles.length === 0) {
        return { name: vehicleName, status: 'skip', message: 'Nenhum arquivo de modelo ou dado encontrado' };
    }

    const resourceDir = path.join(outputRoot, vehicleName);
    const streamDir   = path.join(resourceDir, 'stream');
    const dataDir     = path.join(resourceDir, 'data');
    fs.mkdirSync(streamDir, { recursive: true });
    fs.mkdirSync(dataDir,   { recursive: true });

    const dataFilePaths = [];
    let   streamCount   = 0;

    for (const filePath of streamFiles) {
        fs.copyFileSync(filePath, path.join(streamDir, path.basename(filePath)));
        streamCount++;
    }

    for (const filePath of metaFiles) {
        const name = path.basename(filePath);
        fs.copyFileSync(filePath, path.join(dataDir, name));
        dataFilePaths.push(`data/${name}`);
    }

    for (const filePath of ymtFiles) {
        const name = path.basename(filePath);
        const base = path.basename(name, '.ymt').toLowerCase();
        if (DATA_YMT_NAMES.some(d => base.includes(d))) {
            fs.copyFileSync(filePath, path.join(dataDir, name));
            dataFilePaths.push(`data/${name}`);
        } else {
            fs.copyFileSync(filePath, path.join(streamDir, name));
            streamCount++;
        }
    }

    const manifest = generateManifest(vehicleName, dataFilePaths);
    fs.writeFileSync(path.join(resourceDir, 'fxmanifest.lua'), manifest, 'utf8');

    return {
        name    : vehicleName,
        status  : 'ok',
        message : `${streamCount} stream, ${dataFilePaths.length} meta(s)`,
    };
}

function ext(filePath) {
    return path.extname(filePath).toLowerCase();
}

function collectFiles(base, dir, results) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectFiles(base, full, results);
        else results.push(full);
    }
}
