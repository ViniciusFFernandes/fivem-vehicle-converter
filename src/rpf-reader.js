import { inflateSync } from 'zlib';

const RPF7_MAGIC   = 0x52504637;
const DIR_MARKER   = 0x7FFFFF00;
const ENCRYPT_NONE = 0x00000000;
const ENCRYPT_OPEN = 0x4E45504F; // "OPEN" — DLCs oficiais sem criptografia no diretório

export class RpfReader {
    /**
     * @param {Buffer}  buffer
     * @param {boolean} [listOnly=false] — se true, apenas lista caminhos sem extrair conteúdo
     */
    constructor(buffer, listOnly = false) {
        this.buf      = buffer;
        this.files    = {};   // path → Buffer  (vazio quando listOnly=true)
        this.paths    = [];   // path[]         (sempre preenchido)
        this.listOnly = listOnly;
        this._parse();
    }

    _parse() {
        const buf = this.buf;

        if (buf.length < 16) throw new Error('Arquivo muito pequeno para ser RPF');

        const magic = buf.readUInt32LE(0);
        if (magic !== RPF7_MAGIC) throw new Error('Não é RPF7 (magic inválido)');

        const entryCount = buf.readUInt32LE(4);
        const namesLen   = buf.readUInt32LE(8);
        const encryption = buf.readUInt32LE(12);

        if (encryption !== ENCRYPT_NONE && encryption !== ENCRYPT_OPEN) {
            throw new Error(
                `RPF criptografado (0x${encryption.toString(16).toUpperCase()}). ` +
                `Use o OpenIV para exportar os arquivos e coloque-os soltos na pasta do veículo.`
            );
        }

        const entryTableStart = 16;
        const namesStart      = entryTableStart + entryCount * 16;
        const dataStart       = namesStart + namesLen;
        const namesRaw        = buf.slice(namesStart, namesStart + namesLen);

        // Formato do entry RPF7 (16 bytes por entry):
        //   bytes  0-3:  nameOffset (bits 0-15 = índice na tabela de nomes)
        //   bytes  4-7:  0x7FFFFF00 se diretório, ou offset do arquivo se arquivo
        //   bytes  8-11: entriesIndex (dir) | fileSize comprimido (file)
        //   bytes 12-15: entriesCount (dir) | uncompressedSize (file, 0 = não comprimido)
        const entries = [];
        for (let i = 0; i < entryCount; i++) {
            const base    = entryTableStart + i * 16;
            const nameOff = buf.readUInt32LE(base)     & 0xFFFF;
            const d1      = buf.readUInt32LE(base + 4);
            const d2      = buf.readUInt32LE(base + 8);
            const d3      = buf.readUInt32LE(base + 12);

            if (d1 === DIR_MARKER) {
                entries.push({ isDir: true,  nameOff, entriesIndex: d2, entriesCount: d3 });
            } else {
                entries.push({ isDir: false, nameOff, fileOffset: d1, fileSize: d2, uncompressedSize: d3 });
            }
        }

        this._walkDir(entries, namesRaw, buf, dataStart, 0, '');
    }

    _name(namesRaw, off) {
        let end = off;
        while (end < namesRaw.length && namesRaw[end] !== 0) end++;
        return namesRaw.slice(off, end).toString('utf8');
    }

    _walkDir(entries, namesRaw, buf, dataStart, idx, prefix) {
        if (idx >= entries.length) return;
        const e = entries[idx];

        if (!e.isDir) {
            const name = this._name(namesRaw, e.nameOff);
            if (!name) return;
            const fullPath = prefix ? `${prefix}/${name}` : name;

            this.paths.push(fullPath);

            if (!this.listOnly) {
                // Extrai conteúdo (só funciona bem em arquivos não-criptografados)
                let data;
                if (e.uncompressedSize === 0) {
                    data = buf.slice(dataStart + e.fileOffset, dataStart + e.fileOffset + e.fileSize);
                } else {
                    const raw = buf.slice(dataStart + e.fileOffset, dataStart + e.fileOffset + e.fileSize);
                    try {
                        data = inflateSync(raw);
                    } catch {
                        try { data = inflateSync(raw, { finishFlush: 2 }); } catch { data = raw; }
                    }
                }
                this.files[fullPath] = data;
            }
            return;
        }

        // Diretório — percorre filhos
        const dirName  = this._name(namesRaw, e.nameOff);
        const childPfx = prefix ? (dirName ? `${prefix}/${dirName}` : prefix) : dirName;

        const start = e.entriesIndex;
        const count = e.entriesCount;
        for (let i = start; i < start + count; i++) {
            if (i === idx) continue; // evita loop na raiz (entry 0 aponta para si mesma)
            this._walkDir(entries, namesRaw, buf, dataStart, i, childPfx);
        }
    }

    listFiles() { return this.paths; }
    getFile(p)  { return this.files[p]; }
}
