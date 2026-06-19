/**
 * Gera converter.exe usando Node.js SEA (Single Executable Application).
 * Requer Node.js >= 18.16.
 */
import { execSync, execFileSync } from 'child_process';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');

fs.mkdirSync(dist, { recursive: true });

console.log('📦 [1/4] Bundlando com esbuild...');
execSync(
    'node node_modules/esbuild/bin/esbuild src/index.js --bundle --platform=node --outfile=dist/bundle.cjs',
    { stdio: 'inherit', cwd: __dirname }
);

console.log('⚙️  [2/4] Gerando blob SEA...');
const seaConfig = {
    main: path.join(dist, 'bundle.cjs'),
    output: path.join(dist, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
};
fs.writeFileSync(path.join(dist, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));
execSync('node --experimental-sea-config dist/sea-config.json', { stdio: 'inherit', cwd: __dirname });

console.log('📋 [3/4] Copiando binário Node...');
const nodeBin  = process.execPath;
const exeOut   = path.join(dist, 'converter.exe');
fs.copyFileSync(nodeBin, exeOut);

console.log('💉 [4/4] Injetando blob no executável...');

// Remove assinatura existente do binário copiado (necessário no Windows)
try {
    execFileSync('signtool', ['remove', '/s', exeOut], { stdio: 'pipe' });
} catch {
    // signtool não disponível — tenta com postject mesmo assim
}

execSync(
    `node node_modules/postject/dist/cli.js dist/converter.exe NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
    { stdio: 'inherit', cwd: __dirname }
);

console.log(`\n✅ Executável gerado: ${exeOut}`);
console.log(`   Tamanho: ${(fs.statSync(exeOut).size / 1024 / 1024).toFixed(1)} MB\n`);
console.log('   Uso: .\\dist\\converter.exe <pasta-veiculos> [pasta-saida]');
