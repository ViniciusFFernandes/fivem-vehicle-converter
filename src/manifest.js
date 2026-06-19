/**
 * Gera o conteúdo do fxmanifest.lua para um resource de veículo FiveM.
 * @param {string}   resourceName
 * @param {string[]} dataFiles    — caminhos relativos dos .meta dentro do resource
 * @param {string[]} streamFiles  — arquivos na pasta stream/ (apenas para referência interna)
 */

const DATA_FILE_MAP = {
    'handling.meta'        : 'HANDLING_FILE',
    'vehicles.meta'        : 'VEHICLE_METADATA_FILE',
    'carcols.meta'         : 'CARCOLS_FILE',
    'carvariations.meta'   : 'VEHICLE_VARIATION_FILE',
    'vehiclelayouts.meta'  : 'VEHICLE_LAYOUTS_FILE',
    'carsales.meta'        : 'CARSALES_FILE',
    'contentunlocks.meta'  : 'CONTENT_UNLOCKING_META_FILE',
    'dlctext.meta'         : 'DLCTEXT_META_FILE',
    'vehiclePopGroups.meta': 'POPZONE_FILE',
    'popgroups.ymt'        : 'POPZONE_FILE',
};

export function generateManifest(resourceName, dataFiles) {
    const lines = [
        `fx_version 'cerulean'`,
        `game 'gta5'`,
        ``,
        `name '${resourceName}'`,
        `description 'Veículo convertido automaticamente'`,
        `version '1.0.0'`,
        ``,
    ];

    const knownMeta = dataFiles.filter(f => {
        const base = f.split('/').pop().toLowerCase();
        return Object.keys(DATA_FILE_MAP).some(k => base === k);
    });

    const unknownMeta = dataFiles.filter(f => !knownMeta.includes(f));

    if (knownMeta.length > 0) {
        for (const filePath of knownMeta) {
            const base    = filePath.split('/').pop().toLowerCase();
            const type    = Object.entries(DATA_FILE_MAP).find(([k]) => base === k)?.[1];
            lines.push(`data_file '${type}' '${filePath}'`);
        }
        lines.push('');
    }

    if (unknownMeta.length > 0) {
        lines.push('-- Arquivos .meta não identificados (adicione manualmente se necessário):');
        for (const f of unknownMeta) lines.push(`-- data_file 'UNKNOWN' '${f}'`);
        lines.push('');
    }

    return lines.join('\n');
}
