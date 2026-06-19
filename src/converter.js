import fs   from 'fs';
import path  from 'path';
import { RpfReader }       from './rpf-reader.js';
import { generateManifest } from './manifest.js';

// Extensões que vão para stream/ (model, textura, colisão, áudio de stream)
const STREAM_EXTS = new Set(['.yft', '.ytd', '.ybn', '.ycd', '.yld', '.ypt', '.ymt']);

// Extensões de dados que geram entradas no fxmanifest
const META_EXTS   = new Set(['.meta', '.ymt', '.dat']);

/**
 * Converte uma pasta de veículo (com .rpf dentro) para um resource FiveM.
 * @param {string} vehicleFolder — pasta de entrada
 * @param {string} outputRoot    — pasta onde o resource será criado
 * @returns {{ name: string, status: 'ok'|'skip'|'error', message?: string }}
 */
export async function convertVehicle(vehicleFolder, outputRoot) {
    const vehicleName = path.basename(vehicleFolder);

    // Procura .rpf na pasta (busca recursiva 1 nível)
    const rpfFiles = findRpf(vehicleFolder);

    // Se não tiver RPF, verifica se já há arquivos soltos (.yft/.ytd)
    if (rpfFiles.length === 0) {
        const looseFiles = fs.readdirSync(vehicleFolder, { recursive: true })
            .filter(f => typeof f === 'string' && STREAM_EXTS.has(path.extname(f).toLowerCase()));

        if (looseFiles.length === 0) {
            return { name: vehicleName, status: 'skip', message: 'Nenhum .rpf ou arquivo de modelo encontrado' };
        }

        // Arquivos já soltos — só monta a estrutura
        return convertLooseFiles(vehicleFolder, vehicleName, outputRoot);
    }

    // Extrai todos os RPFs encontrados e coleta os arquivos
    const extracted = {}; // caminho → Buffer

    for (const rpfPath of rpfFiles) {
        try {
            const buf = fs.readFileSync(rpfPath);
            extractRpfRecursive(buf, extracted);
        } catch (err) {
            return { name: vehicleName, status: 'error', message: err.message };
        }
    }

    return buildResource(vehicleName, extracted, outputRoot);
}

// Extrai um RPF e entra recursivamente em RPFs aninhados (ex: vehicles.rpf dentro de dlc.rpf)
function extractRpfRecursive(buf, out) {
    const reader = new RpfReader(buf);
    for (const [filePath, data] of Object.entries(reader.files)) {
        if (path.extname(filePath).toLowerCase() === '.rpf') {
            try { extractRpfRecursive(data, out); } catch {}
        } else {
            out[filePath] = data;
        }
    }
}

function findRpf(dir) {
    const results = [];
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...findRpf(full));
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.rpf')) {
                results.push(full);
            }
        }
    } catch {}
    return results;
}

function convertLooseFiles(vehicleFolder, vehicleName, outputRoot) {
    const allFiles = [];
    collectLoose(vehicleFolder, vehicleFolder, allFiles);

    const fileMap = {};
    for (const { rel, full } of allFiles) {
        fileMap[rel] = fs.readFileSync(full);
    }

    return buildResource(vehicleName, fileMap, outputRoot);
}

function collectLoose(base, dir, results) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectLoose(base, full, results);
        } else {
            results.push({ rel: path.relative(base, full).replace(/\\/g, '/'), full });
        }
    }
}

/**
 * Monta a estrutura FiveM a partir de um mapa { caminho → Buffer }.
 */
function buildResource(vehicleName, files, outputRoot) {
    const resourceDir = path.join(outputRoot, vehicleName);
    const streamDir   = path.join(resourceDir, 'stream');
    const dataDir     = path.join(resourceDir, 'data');

    fs.mkdirSync(streamDir, { recursive: true });
    fs.mkdirSync(dataDir,   { recursive: true });

    const dataFiles   = [];
    let   streamCount = 0;

    for (const [filePath, data] of Object.entries(files)) {
        const fileName = path.basename(filePath);
        const ext      = path.extname(fileName).toLowerCase();

        if (STREAM_EXTS.has(ext)) {
            // .ymt pode ser stream OU dado dependendo do conteúdo — separa por nome
            if (ext === '.ymt' && isDataYmt(fileName)) {
                const dest = path.join(dataDir, fileName);
                fs.writeFileSync(dest, data);
                dataFiles.push(`data/${fileName}`);
            } else {
                fs.writeFileSync(path.join(streamDir, fileName), data);
                streamCount++;
            }
        } else if (META_EXTS.has(ext)) {
            const dest = path.join(dataDir, fileName);
            fs.writeFileSync(dest, data);
            dataFiles.push(`data/${fileName}`);
        }
        // Outros arquivos (DLCs, scripts, etc.) são ignorados
    }

    if (streamCount === 0 && dataFiles.length === 0) {
        fs.rmSync(resourceDir, { recursive: true, force: true });
        return { name: vehicleName, status: 'skip', message: 'Nenhum arquivo de modelo ou dado encontrado dentro do RPF' };
    }

    const manifest = generateManifest(vehicleName, dataFiles);
    fs.writeFileSync(path.join(resourceDir, 'fxmanifest.lua'), manifest, 'utf8');

    if (streamCount === 0 && dataFiles.length > 0) {
        // Metas extraídos mas modelos criptografados — resource parcial
        fs.writeFileSync(
            path.join(resourceDir, 'LEIA-ME.txt'),
            [
                `Resource parcialmente convertido — metas OK, modelos faltando`,
                ``,
                `Os arquivos de modelo (.yft, .ytd) estão dentro de um RPF criptografado`,
                `que só o OpenIV consegue abrir. Siga os passos:`,
                ``,
                `1. Abra o OpenIV`,
                `2. Localize o arquivo dlc.rpf deste veículo`,
                `3. Dentro dele, abra: x64 > levels > gta5 > vehicles > vehicles.rpf`,
                `4. Exporte todos os arquivos .yft e .ytd`,
                `5. Cole-os na pasta stream/ deste resource`,
                `6. Delete este LEIA-ME.txt`,
                ``,
                `Metas já extraídos e prontos: ${dataFiles.join(', ')}`,
            ].join('\n'),
            'utf8'
        );
        return {
            name    : vehicleName,
            status  : 'partial',
            message : `${dataFiles.length} meta(s) extraído(s), modelos criptografados — veja LEIA-ME.txt`,
        };
    }

    return {
        name    : vehicleName,
        status  : 'ok',
        message : `${streamCount} arquivo(s) de stream, ${dataFiles.length} meta(s)`,
    };
}

function isDataYmt(fileName) {
    // .ymt com esses nomes são dados, não stream
    const dataYmts = ['carvariations', 'vehiclelayouts', 'popgroups'];
    const base = path.basename(fileName, '.ymt').toLowerCase();
    return dataYmts.some(d => base.includes(d));
}
