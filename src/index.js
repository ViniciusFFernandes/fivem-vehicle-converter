import fs   from 'fs';
import path  from 'path';
import { convertVehicle } from './converter.js';

// Diretório onde o .exe está rodando
const appDir = path.dirname(process.execPath || process.argv[1]);

const inputRoot  = path.join(appDir, 'VeiculosOriginais');
const outputRoot = path.join(appDir, 'VeiculosConvertidos');

// Garante que as pastas existem
fs.mkdirSync(inputRoot,  { recursive: true });
fs.mkdirSync(outputRoot, { recursive: true });

const vehicleFolders = fs.readdirSync(inputRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => path.join(inputRoot, e.name));

if (vehicleFolders.length === 0) {
    console.log(`\n🚗  FiveM Vehicle Converter`);
    console.log(`\n   Nenhum veículo encontrado em VeiculosOriginais.`);
    console.log(`   Coloque as pastas dos veículos lá e rode novamente.\n`);
    process.exit(0);
}

console.log(`\n🚗  FiveM Vehicle Converter`);
console.log(`   Entrada : ${inputRoot}`);
console.log(`   Saída   : ${outputRoot}`);
console.log(`   Veículos: ${vehicleFolders.length}\n`);

async function run() {
    let ok = 0, skipped = 0, errors = 0;

    for (const folder of vehicleFolders) {
        const name = path.basename(folder);
        process.stdout.write(`  ⏳ ${name.padEnd(30)}`);

        const result = await convertVehicle(folder, outputRoot);

        if (result.status === 'ok') {
            console.log(`✅  ${result.message}`);
            ok++;
        } else if (result.status === 'skip') {
            console.log(`⏭️   IGNORADO — ${result.message}`);
            skipped++;
        } else {
            console.log(`❌  ERRO — ${result.message}`);
            errors++;
        }
    }

    console.log(`
──────────────────────────────────────
  ✅  Convertidos : ${ok}
  ⏭️   Ignorados  : ${skipped}
  ❌  Erros       : ${errors}
──────────────────────────────────────
  Resources em: ${outputRoot}
`);

    if (errors > 0) {
        console.log(`  ⚠️  Veículos com ERRO provavelmente têm RPF criptografado.`);
        console.log(`     Abra o OpenIV, exporte os arquivos manualmente e recoloque`);
        console.log(`     os arquivos soltos na pasta do veículo. O conversor aceitará`);
        console.log(`     arquivos .yft/.ytd/.meta soltos sem precisar do .rpf.\n`);
    }
}

run().catch(err => { console.error('Erro fatal:', err.message); process.exit(1); });
