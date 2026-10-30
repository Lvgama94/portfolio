# Portfólio · Lucas Gama

Site do meu portfólio de Dados & BI, em HTML, CSS e JavaScript puros, sem framework e sem etapa de build: uma página inicial e uma versão web interativa de cada projeto (gráficos com ECharts).

Os projetos apresentados estão no repositório [distribuidora-sul](https://github.com/Lvgama94/distribuidora-sul): base de dados em Python e SQL Server, três painéis Power BI (Financeiro, People Analytics, Compras e Estoque) e automações em Excel com Power Query.

## Rodar localmente

```bash
python -m http.server 5500
```

e abrir http://localhost:5500.

## Estrutura

```
index.html                  página inicial
financeiro.html             painel Financeiro interativo
rh.html                     painel People Analytics interativo
compras.html                painel Compras e Estoque interativo
comercial.html              painel Comercial interativo
excel.html                  resultado das automações em Excel (conciliação e ponto)
sql.html                    SQL na prática: 10 perguntas com a consulta e o resultado
assets/style.css            estilos (mesma paleta dos painéis)
assets/site.js              ampliação das imagens das galerias
assets/painel.css           filtros, abas, indicadores e gráficos das páginas interativas
assets/painel-base.js       formatação, gráficos, rótulos, tabelas e abas comuns a todas
assets/sql.js, sql.css      realce de sintaxe e tabelas de resultado do SQL na prática
assets/financeiro.js, rh.js, compras.js, comercial.js, excel.js   cálculo e gráficos de cada página
assets/data/*.json          dados de cada página
assets/img/                 capturas dos painéis em WebP
```

Os JSONs são gerados por `python/exportar_web.py`, no repositório [distribuidora-sul](https://github.com/Lvgama94/distribuidora-sul). Para os painéis, ele recalcula os indicadores a partir do próprio arquivo e só grava se baterem com a view de conferência do SQL (107 indicadores no total). Para o Excel, lê as tabelas que o Power Query gravou nas pastas de trabalho e confere com o SQL e com o CSV do banco. Para o SQL na prática, roda as consultas de `sql/perguntas` e confere com as views os 10 números que elas têm em comum com os painéis.
