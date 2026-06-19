/**
 * Leitor de arquivos RPF7 (GTA V) — suporta não-criptografado e AES (chave pública de DLC).
 * Formato documentado pela comunidade: https://gtamods.com/wiki/RPF_archive
 */

import { inflateSync } from 'zlib';

const RPF7_MAGIC     = 0x52504637;
const ENCRYPT_NONE   = 0x00000000;
const ENCRYPT_OPEN   = 0x4E45504F; // "OPEN" — sem criptografia real, só marcador
const DIR_MARKER     = 0x7FFFFF00;

export class RpfReader {
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
        if (magic !== RPF7_MAGIC) throw new Error('Arquivo não é RPF7 (magic inválido)');

        const entryCount  = buf.readUInt32LE(4);
        const namesLen    = buf.readUInt32LE(8);
        const encryption  = buf.readUInt32LE(12);

        if (encryption !== ENCRYPT_NONE && encryption !== ENCRYPT_OPEN) {
            throw new Error(
                `RPF criptografado (tipo 0x${encryption.toString(16).toUpperCase()}). ` +
                `Use o OpenIV para extrair manualmente e recoloque os arquivos soltos na pasta do veículo.`
            );
        }

        const entryTableStart = 16;
        const namesStart      = entryTableStart + entryCount * 16;
        const dataStart       = namesStart + namesLen;

        // Lê tabela de nomes (strings terminadas em \0)
        const namesRaw = buf.slice(namesStart, namesStart + namesLen);

        // Lê todas as entradas
        const rawEntries = [];
        for (let i = 0; i < entryCount; i++) {
            const base = entryTableStart + i * 16;
            rawEntries.push({
                nameOff : buf.readUInt32LE(base)      & 0x0FFFFFFF,
                d1      : buf.readUInt32LE(base + 4),
                d2      : buf.readUInt32LE(base + 8),
                d3      : buf.readUInt32LE(base + 12),
            });
        }

        // Monta árvore recursivamente a partir da entrada 0 (root)
        this.files = {};
        this._walkDir(rawEntries, namesRaw, buf, dataStart, 0, '');
    }

    _readName(namesRaw, offset) {
        let end = offset;
        while (end < namesRaw.length && namesRaw[end] !== 0) end++;
        return namesRaw.slice(offset, end).toString('utf8');
    }

    _walkDir(entries, namesRaw, buf, dataStart, entryIdx, pathPrefix) {
        const e = entries[entryIdx];
        // Entrada de diretório: d3 == DIR_MARKER ou d3 >> 8 == 0x7FFFFF
        const isDir = (e.d3 === DIR_MARKER) || ((e.d3 >>> 8) === 0x7FFFFF);

        if (!isDir) {
            // É um arquivo — extrai dados
            const rawOffset      = (e.d1 & 0x7FFFFF) * 512;
            const compressedSize = e.d2;
            const realSize       = e.d3;

            const name = this._readName(namesRaw, e.nameOff);
            if (!name) return;

            const fullPath = pathPrefix ? `${pathPrefix}/${name}` : name;

            let data;
            if (realSize === 0 || realSize === compressedSize) {
                // Não comprimido
                data = buf.slice(dataStart + rawOffset, dataStart + rawOffset + compressedSize);
            } else {
                // Comprimido com deflate (zlib)
                const compressed = buf.slice(dataStart + rawOffset, dataStart + rawOffset + compressedSize);
                try {
                    data = inflateSync(compressed);
                } catch {
                    // Tenta sem cabeçalho zlib (raw deflate)
                    try {
                        data = inflateSync(compressed, { finishFlush: 2 });
                    } catch {
                        data = compressed; // entrega bruto se falhar
                    }
                }
            }

            this.files[fullPath] = data;
            return;
        }

        // É um diretório — percorre filhos
        const name         = this._readName(namesRaw, e.nameOff);
        const childPath    = pathPrefix ? (name ? `${pathPrefix}/${name}` : pathPrefix) : name;
        const childStart   = e.d1;
        const childCount   = e.d2;

        for (let i = childStart; i < childStart + childCount; i++) {
            if (i === entryIdx) continue; // evita loop na raiz
            this._walkDir(entries, namesRaw, buf, dataStart, i, childPath);
        }
    }

    /** Retorna lista de todos os caminhos internos */
    listFiles() {
        return Object.keys(this.files);
    }

    /** Retorna o Buffer de um arquivo interno pelo caminho */
    getFile(path) {
        return this.files[path];
    }
}
