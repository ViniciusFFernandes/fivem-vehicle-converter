/**
 * Gera um RPF7 mínimo não-criptografado para testes.
 * Contém: handling.meta, vehicles.meta, ferrari.yft, ferrari.ytd
 */
import fs   from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = [
    { name: 'handling.meta',  data: Buffer.from('<HandlingData></HandlingData>') },
    { name: 'vehicles.meta',  data: Buffer.from('<CVehicleModelInfo__InitDataList></CVehicleModelInfo__InitDataList>') },
    { name: 'ferrari.yft',    data: Buffer.from('YFT_FAKE_MODEL_DATA_00000000') },
    { name: 'ferrari_hi.yft', data: Buffer.from('YFT_FAKE_HIMODEL_DATA_0000000') },
    { name: 'ferrari.ytd',    data: Buffer.from('YTD_FAKE_TEXTURE_DATA_00000000') },
];

function buildRpf(fileList) {
    // Monta tabela de nomes
    const nameBuffers = [Buffer.from('\0')]; // entrada 0 = root (nome vazio)
    const nameOffsets = [0];
    let namesLen = 1;

    for (const f of fileList) {
        nameOffsets.push(namesLen);
        const nb = Buffer.from(f.name + '\0');
        nameBuffers.push(nb);
        namesLen += nb.length;
    }

    // Alinha nomes a 16 bytes
    const namePad = (16 - (namesLen % 16)) % 16;
    namesLen += namePad;

    const entryCount = 1 + fileList.length; // root dir + arquivos
    const headerSize  = 16;
    const entriesSize = entryCount * 16;

    // Calcula offsets de dados (cada arquivo alinhado em múltiplos de 512)
    const dataOffsets = [];
    let dataPos = 0;
    for (const f of fileList) {
        dataOffsets.push(dataPos);
        dataPos += Math.ceil(f.data.length / 512) * 512;
    }

    const totalSize = headerSize + entriesSize + namesLen + dataPos;
    const buf = Buffer.alloc(totalSize, 0);

    // Header
    buf.writeUInt32LE(0x52504637, 0);  // magic RPF7
    buf.writeUInt32LE(entryCount, 4);
    buf.writeUInt32LE(namesLen, 8);
    buf.writeUInt32LE(0x00000000, 12); // sem criptografia

    // Entrada 0: root directory
    buf.writeUInt32LE(0, 16);                        // nameOffset = 0
    buf.writeUInt32LE(1, 16 + 4);                    // filhos começam no índice 1
    buf.writeUInt32LE(fileList.length, 16 + 8);      // quantidade de filhos
    buf.writeUInt32LE(0x7FFFFF00, 16 + 12);          // marcador de diretório

    // Entradas de arquivo
    for (let i = 0; i < fileList.length; i++) {
        const base = headerSize + (i + 1) * 16;
        const dataOffset512 = dataOffsets[i] / 512; // offset em blocos de 512
        buf.writeUInt32LE(nameOffsets[i + 1], base);
        buf.writeUInt32LE(dataOffset512, base + 4);
        buf.writeUInt32LE(fileList[i].data.length, base + 8);
        buf.writeUInt32LE(0, base + 12); // uncompressedSize = 0 → não comprimido
    }

    // Tabela de nomes
    let namePos = headerSize + entriesSize;
    for (const nb of nameBuffers) nb.copy(buf, namePos), namePos += nb.length;

    // Dados
    const dataStart = headerSize + entriesSize + namesLen;
    for (let i = 0; i < fileList.length; i++) {
        fileList[i].data.copy(buf, dataStart + dataOffsets[i]);
    }

    return buf;
}

// Cria pasta de teste
const testInputDir  = path.join(__dirname, 'vehicles', 'ferrari');
const testOutputDir = path.join(__dirname, 'output');
fs.mkdirSync(testInputDir,  { recursive: true });
fs.mkdirSync(testOutputDir, { recursive: true });

const rpf = buildRpf(files);
fs.writeFileSync(path.join(testInputDir, 'dlc.rpf'), rpf);

console.log(`✅ RPF de teste criado: ${path.join(testInputDir, 'dlc.rpf')}`);
console.log(`   Arquivos internos: ${files.map(f => f.name).join(', ')}`);
