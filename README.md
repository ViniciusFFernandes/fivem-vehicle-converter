# FiveM Vehicle Converter

Converte veículos exportados do OpenIV para resources prontos para o FiveM.

## Como usar

### Pré-requisitos

- [OpenIV](https://openiv.com/) para exportar os arquivos do veículo

### Passo a passo

1. Abra o veículo no **OpenIV**
2. Exporte todos os arquivos (`.yft`, `.ytd`, `.meta`, etc.) para uma pasta
3. Coloque essa pasta dentro de `VeiculosOriginais/`
4. Execute o `converter.exe`
5. O resource pronto aparece em `VeiculosConvertidos/`

### Estrutura gerada

```
VeiculosConvertidos/
└── nome_do_veiculo/
    ├── fxmanifest.lua
    ├── stream/
    │   ├── veiculo.yft
    │   ├── veiculo_hi.yft
    │   └── veiculo.ytd
    └── data/
        ├── handling.meta
        ├── vehicles.meta
        ├── carcols.meta
        └── carvariations.meta
```

### Arquivos suportados

| Extensão | Destino | Descrição |
|----------|---------|-----------|
| `.yft` | `stream/` | Modelo do veículo |
| `.ytd` | `stream/` | Texturas |
| `.ybn` | `stream/` | Colisão |
| `.ycd` | `stream/` | Clips de animação |
| `.meta` | `data/` | Dados do veículo |
| `.dat` | `data/` | Dados auxiliares |
| `.ymt` | `stream/` ou `data/` | Depende do nome |

## Desenvolvimento

```bash
npm install

# Rodar sem compilar
npm start

# Gerar converter.exe
npm run build
```

### Requisitos para build

- Node.js >= 18.16
- `npm install`

## Limitações

Os arquivos precisam ser exportados manualmente pelo OpenIV antes de usar o converter. O programa não lê `.rpf` diretamente.
