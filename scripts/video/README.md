# Video de apresentacao do sistema

Grava um screencast do sistema rodando, para mostrar a equipe. Nada aqui e
mockup: o navegador navega no app de verdade, com a carga de demonstracao.

O video sai com cartao de titulo entre os blocos, legenda explicando cada tela
e uma moldura de celular para as telas que o cliente abre (aprovacao e
relatorio).

## Por que a legenda e queimada depois

A legenda nao pode ser desenhada dentro da pagina. Para o texto do app ficar
legivel num projetor, a pagina e ampliada 1,5x (`document.body.style.zoom`), e
com o zoom ligado o elemento `position: fixed` da legenda nao entra na
gravacao. Entao `gravar.mjs` so anota **o que** estava escrito e **quando**
(`legendas.json`), e `queimar-legendas.mjs` desenha com `ffmpeg`.

Pelo mesmo motivo a tela do cliente nao e rolada por dentro: o iframe e de
outra origem (`localhost:3000` dentro de `localhost:4000`), entao `telefone.html`
desliza o proprio iframe por fora, com `transform`.

## O que precisa estar no ar

1. Banco com a demonstracao carregada (`Configuracoes > Carregar demonstracao`).
2. `npm run dev` em `localhost:3000`.
3. Os cartoes servidos em `localhost:4000`.
4. Playwright e Chromium. **Nao estao no `package.json` de proposito**: sao
   ferramenta de apresentacao, e declarar aqui faria o build do Netlify baixar
   o navegador a cada deploy. Instale na hora:
   `npm i -D playwright && npx playwright install chromium`.

## Rodando

```bash
# 1. Fontes e marca, que os cartoes usam
mkdir -p /tmp/video && cp public/fontes/*.woff2 public/marca/*.svg /tmp/video/
cp scripts/video/{base.css,telefone.html} /tmp/video/

# 2. Cartoes de titulo
node scripts/video/gerar-cartoes.mjs /tmp/video

# 3. Servidor dos cartoes
(cd /tmp/video && python3 -m http.server 4000 &)

# 4. Fonte da marca em TTF, que e o que o ffmpeg le
python3 -c "
from fontTools.ttLib import TTFont
for n in ['creato-display-black', 'creato-display-regular']:
    f = TTFont(f'/tmp/video/{n}.woff2'); f.flavor = None; f.save(f'/tmp/video/{n}.ttf')
"

# 5. Grava (os ids saem do banco: um cliente com anuncios, um post esperando
#    aprovacao e um POST SEM RESPOSTA)
ADMIN_EMAIL=... ADMIN_SENHA=... \
CLIENTE_ID=... POST_ID=... POST_SEM_RESPOSTA_ID=... \
  node scripts/video/gravar.mjs /tmp/gravacao

# 6. Converte e queima a legenda
ffmpeg -y -i /tmp/gravacao/*.webm -c:v libx264 -preset medium -crf 20 \
  -pix_fmt yuv420p -r 25 /tmp/bruto.mp4
node scripts/video/queimar-legendas.mjs \
  /tmp/bruto.mp4 /tmp/gravacao/legendas.json /tmp/vora-sistema.mp4 /tmp/video
```

O `POST_ID` precisa ter pedido de aprovacao em aberto - e dele que sai o link
que entra na cena do celular.

## Mexer no roteiro

O roteiro e a parte de baixo de `gravar.mjs`, em ordem de cena. Cada cena e
`tela(caminho)` + `legenda(titulo, nota)` + `esperar(ms)`, e `descer(fracao)`
rola a pagina devagar. `cartao(nome, segundos)` entra com um cartao de titulo
e apaga a legenda.

O texto dos cartoes esta em `gerar-cartoes.mjs`. Aqui o texto vai **com
acento**: e material de apresentacao para pessoas, nao codigo nem log.
