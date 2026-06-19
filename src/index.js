import fs       from 'fs';
import path     from 'path';
import readline from 'readline';
import { convertVehicle } from './converter.js';

function pause() {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('\nPressione ENTER para fechar...', () => { rl.close(); resolve(); });
    });
}

async function run() {
    // Quando rodando como .exe (SEA), usa o diretório do executável.
    // Quando rodando com "node" em desenvolvimento, usa o diretório atual.
    const exeName = path.basename(process.execPath).toLowerCase().replace(/\.exe$/, '');
    const appDir  = exeName === 'node' ? process.cwd() : path.dirname(process.execPath);
    const inputRoot  = path.join(appDir, 'VeiculosOriginais');
    const outputRoot = path.join(appDir, 'VeiculosConvertidos');

    fs.mkdirSync(inputRoot,  { recursive: true });
    fs.mkdirSync(outputRoot, { recursive: true });

    console.log(`\n🚗  FiveM Vehicle Converter`);
    console.log(`   Pasta   : ${appDir}`);
    console.log(`   Coloque em VeiculosOriginais/ as pastas com arquivos exportados pelo OpenIV.\n`);

    const vehicleFolders = fs.readdirSync(inputRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(inputRoot, e.name));

    if (vehicleFolders.length === 0) {
        console.log(`   Nenhum veículo encontrado em VeiculosOriginais/.`);
        console.log(`   Exporte os arquivos do veículo pelo OpenIV e coloque`);
        console.log(`   cada veículo em uma subpasta (ex: VeiculosOriginais/ferrari/).\n`);
        await pause();
        return;
    }

    console.log(`   Veículos encontrados: ${vehicleFolders.length}\n`);

    let ok = 0, skipped = 0, errors = 0;

    for (const folder of vehicleFolders) {
        const name = path.basename(folder);
        process.stdout.write(`  ⏳ ${name.padEnd(30)}`);

        const result = await convertVehicle(folder, outputRoot);

        if (result.status === 'ok') {
            console.log(`✅  ${result.message}`);
            ok++;
        } else if (result.status === 'partial') {
            console.log(`⚠️   PARCIAL — ${result.message}`);
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
        console.log(`  ⚠️  Verifique se as pastas com ERRO contêm os arquivos`);
        console.log(`     exportados corretamente pelo OpenIV (.yft, .ytd, .meta).\n`);
    }

    await pause();
}

run().catch(async err => {
    console.error('\n❌ Erro fatal:', err.message);
    console.error(err.stack);
    await pause();
    process.exit(1);
});
