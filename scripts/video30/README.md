# Video de 30 segundos: o sistema inteiro

Gera o video de apresentacao rapida (1920x1080, 30 fps, 30 s): cortes a cada
3 segundos, whip-pan com desfoque de movimento e textos grandes.

Como funciona:

1. `capturar.mjs` entra no painel (precisa do `npm start` ou `npm run dev` no
   ar) e tira prints nitidos (2x) das telas no layout VORA, mais as telas do
   celular (aprovacao e link do perfil). O login vem de ADMIN_EMAIL e
   ADMIN_SENHA do `.env`; o post, o cliente, o link de aprovacao e o link do
   perfil vem das variaveis VIDEO_POST, VIDEO_CLIENTE, VIDEO_TOKEN e
   VIDEO_PERFIL (`npx tsx scripts/qa-ultimo-aprovado.ts` e
   `npx tsx scripts/link-perfil.ts` imprimem os valores).
2. `compor.html` e a composicao: a lista `CENAS` tem tempo, duracao, tela,
   texto e enquadramento de cada cena. `window.render(t)` desenha o instante
   `t`. Para mudar texto, ordem ou duracao, edite so essa lista.
3. `renderizar.mjs completo` abre a composicao no Chromium e salva os 900
   quadros em JPEG; `renderizar.mjs previa` salva so alguns instantes para
   conferir.
4. O ffmpeg junta os quadros e soma o desfoque de movimento (tmix):

   ```bash
   ffmpeg -framerate 30 -i quadros/%04d.jpg \
     -vf "tmix=frames=3:weights='1 2 1',format=yuv420p" \
     -c:v libx264 -preset slow -crf 18 -movflags +faststart saida.mp4
   ```

As fontes (Creato Display) e o logo ficam ao lado de `compor.html`:
`creato-display-regular.ttf`, `creato-display-black.ttf` (em `public/fontes`,
converter woff2 -> ttf) e `vora-logo.svg` (em `public/marca`). Os prints vao
em `telas/`. Nada disso entra no repositorio.

Sem audio de proposito: e para apresentar ao vivo, narrando por cima.
