import fs   from 'fs';
import path  from 'path';
import { RpfReader }        from './rpf-reader.js';
import { generateManifest } from './manifest.js';

// Extensões de modelo → pasta stream/
const STREAM_EXTS = new Set(['.yft', '.ytd', '.ybn', '.ycd', '.yld', '.ypt']);

// Extensões de dado → pasta data/ + entrada no fxmanifest
const META_EXTS = new Set(['.meta', '.dat']);

// .ymt pode ser stream ou dado — decide pelo nome
const DATA_YMT_NAMES = ['carvariations', 'vehiclelayouts', 'popgroups'];

export async function convertVehicle(vehicleFolder, outputRoot) {
    const vehicleName = path.basename(vehicleFolder);
    const rpfFiles    = findRpf(vehicleFolder);

    if (rpfFiles.length === 0) {
        // Sem RPF — procura arquivos soltos (exportados via OpenIV)
        return convertLooseFiles(vehicleFolder, vehicleName, outputRoot);
    }

    // Tem RPF — lê o diretório para descobrir o que existe dentro
    // (não extrai conteúdo: o formato interno é binário/criptografado pelo GTA V)
    const streamFiles    = []; // nomes de arquivo (ex: "ferrari.yft")
    const metaFiles      = []; // nomes de arquivo (ex: "handling.meta")
    let   hasEncrypted   = false; // true se algum RPF aninhado estava criptografado

    for (const rpfPath of rpfFiles) {
        try {
            const buf = fs.readFileSync(rpfPath);
            listRpfRecursive(buf, streamFiles, metaFiles, () => { hasEncrypted = true; });
        } catch (err) {
            if (err.message.includes('criptografado')) {
                hasEncrypted = true;
            } else {
                return { name: vehicleName, status: 'error', message: err.message };
            }
        }
    }

    return buildSkeletonResource(vehicleName, streamFiles, metaFiles, rpfFiles, hasEncrypted, outputRoot);
}

// ── Lista arquivos do RPF recursivamente (não grava nada no disco) ────────
function listRpfRecursive(buf, streamFiles, metaFiles, onEncrypted) {
    let reader;
    try {
        reader = new RpfReader(buf, false);
    } catch (err) {
        if (err.message.includes('criptografado')) { onEncrypted?.(); return; }
        throw err;
    }

    for (const filePath of reader.paths) {
        const fileName = path.basename(filePath);
        const ext      = path.extname(fileName).toLowerCase();

        if (ext === '.rpf') {
            const nestedBuf = reader.files[filePath];
            if (nestedBuf && nestedBuf.length >= 16) {
                // Verifica magic antes de tentar parsear (magic inválido = criptografado)
                const nestedMagic = nestedBuf.readUInt32LE(0);
                if (nestedMagic !== 0x52504637 /* RPF7 */) {
                    onEncrypted?.(); // RPF aninhado criptografado (AES)
                } else {
                    try {
                        listRpfRecursive(nestedBuf, streamFiles, metaFiles, onEncrypted);
                    } catch { onEncrypted?.(); }
                }
            }
            continue;
        }

        if (STREAM_EXTS.has(ext)) {
            streamFiles.push(fileName);
        } else if (ext === '.ymt') {
            const base = path.basename(fileName, '.ymt').toLowerCase();
            if (DATA_YMT_NAMES.some(d => base.includes(d))) metaFiles.push(fileName);
            else streamFiles.push(fileName);
        } else if (META_EXTS.has(ext)) {
            metaFiles.push(fileName);
        }
    }
}

// ── Cria resource skeleton quando a fonte é RPF ──────────────
function buildSkeletonResource(vehicleName, streamFiles, metaFiles, rpfFiles, hasEncrypted, outputRoot) {
    if (streamFiles.length === 0 && metaFiles.length === 0) {
        return { name: vehicleName, status: 'skip', message: 'Nenhum arquivo de modelo ou dado encontrado dentro do RPF' };
    }

    const resourceDir = path.join(outputRoot, vehicleName);
    const streamDir   = path.join(resourceDir, 'stream');
    const dataDir     = path.join(resourceDir, 'data');
    fs.mkdirSync(streamDir, { recursive: true });
    fs.mkdirSync(dataDir,   { recursive: true });

    // Gera fxmanifest com os meta files encontrados
    const dataFilePaths = metaFiles.map(f => `data/${f}`);
    const manifest      = generateManifest(vehicleName, dataFilePaths);
    fs.writeFileSync(path.join(resourceDir, 'fxmanifest.lua'), manifest, 'utf8');

    // Gera LEIA-ME.txt com instruções detalhadas
    const leiame = buildLeiame(vehicleName, streamFiles, metaFiles, rpfFiles, hasEncrypted);
    fs.writeFileSync(path.join(resourceDir, 'LEIA-ME.txt'), leiame, 'utf8');

    return {
        name    : vehicleName,
        status  : 'partial',
        message : `${streamFiles.length} modelo(s) + ${metaFiles.length} meta(s) detectados — veja LEIA-ME.txt`,
    };
}

function buildLeiame(vehicleName, streamFiles, metaFiles, rpfFiles, hasEncrypted) {
    const lines = [
        `===================================================`,
        `  RESOURCE: ${vehicleName}`,
        `  Status: estrutura pronta, arquivos precisam ser`,
        `          exportados via OpenIV`,
        `===================================================`,
        ``,
        `Os arquivos dentro do .rpf estao em formato binario`,
        `proprietario do GTA V. Use o OpenIV para exporta-los.`,
        ``,
        `PASSO A PASSO:`,
        ``,
        `1. Abra o OpenIV`,
        `2. Abra o arquivo dlc.rpf do veiculo:`,
    ];

    for (const f of rpfFiles) lines.push(`      ${f}`);

    if (streamFiles.length > 0) {
        lines.push(``, `3. Exporte estes arquivos para a pasta  stream/:`);
        for (const f of streamFiles) lines.push(`      ${f}`);
        lines.push(`   (navegue dentro do RPF em x64 > levels > gta5 > vehicles > vehicles.rpf)`);
    } else if (hasEncrypted) {
        lines.push(
            ``,
            `3. Dentro do RPF, abra o arquivo vehicles.rpf (pode estar em:`,
            `      x64 > levels > gta5 > vehicles > vehicles.rpf`,
            `   Exporte TODOS os arquivos .yft e .ytd para a pasta  stream/`,
        );
    }

    if (metaFiles.length > 0) {
        lines.push(``, `4. Exporte estes arquivos para a pasta  data/:`);
        for (const f of metaFiles) lines.push(`      ${f}`);
        lines.push(`   (navegue em common > data)`);
        lines.push(`   No OpenIV, clique com botao direito > Export as xml`);
        lines.push(`   para obter o arquivo .meta no formato XML legivel.`);
    }

    lines.push(
        ``,
        `5. Depois de copiar todos os arquivos, delete este`,
        `   LEIA-ME.txt e adicione o resource ao server.cfg.`,
        ``,
        `O fxmanifest.lua ja foi gerado corretamente.`,
        `===================================================`,
    );

    return lines.join('\n');
}

// ── Conversão de arquivos soltos (exportados do OpenIV) ──────
function convertLooseFiles(vehicleFolder, vehicleName, outputRoot) {
    const allFiles = [];
    collectLoose(vehicleFolder, vehicleFolder, allFiles);

    if (allFiles.length === 0) {
        return { name: vehicleName, status: 'skip', message: 'Nenhum arquivo encontrado' };
    }

    const resourceDir = path.join(outputRoot, vehicleName);
    const streamDir   = path.join(resourceDir, 'stream');
    const dataDir     = path.join(resourceDir, 'data');
    fs.mkdirSync(streamDir, { recursive: true });
    fs.mkdirSync(dataDir,   { recursive: true });

    const dataFilePaths = [];
    let   streamCount   = 0;

    for (const { rel, full } of allFiles) {
        const fileName = path.basename(rel);
        const ext      = path.extname(fileName).toLowerCase();
        const data     = fs.readFileSync(full);

        if (STREAM_EXTS.has(ext)) {
            fs.writeFileSync(path.join(streamDir, fileName), data);
            streamCount++;
        } else if (ext === '.ymt') {
            const base = path.basename(fileName, '.ymt').toLowerCase();
            if (DATA_YMT_NAMES.some(d => base.includes(d))) {
                fs.writeFileSync(path.join(dataDir, fileName), data);
                dataFilePaths.push(`data/${fileName}`);
            } else {
                fs.writeFileSync(path.join(streamDir, fileName), data);
                streamCount++;
            }
        } else if (META_EXTS.has(ext)) {
            fs.writeFileSync(path.join(dataDir, fileName), data);
            dataFilePaths.push(`data/${fileName}`);
        }
    }

    if (streamCount === 0 && dataFilePaths.length === 0) {
        fs.rmSync(resourceDir, { recursive: true, force: true });
        return { name: vehicleName, status: 'skip', message: 'Nenhum arquivo de modelo ou dado reconhecido' };
    }

    const manifest = generateManifest(vehicleName, dataFilePaths);
    fs.writeFileSync(path.join(resourceDir, 'fxmanifest.lua'), manifest, 'utf8');

    return {
        name    : vehicleName,
        status  : 'ok',
        message : `${streamCount} stream, ${dataFilePaths.length} meta(s)`,
    };
}

function findRpf(dir) {
    const results = [];
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) results.push(...findRpf(full));
            else if (entry.isFile() && entry.name.toLowerCase().endsWith('.rpf')) results.push(full);
        }
    } catch {}
    return results;
}

function collectLoose(base, dir, results) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectLoose(base, full, results);
        else results.push({ rel: path.relative(base, full).replace(/\\/g, '/'), full });
    }
}
