# Kredit promo (30 s, 1920×1080, 30 fps)

`kredit-promo.mp4` is rendered from `promo.html`: a loading intro, then a
scrubbable timeline of the landing copy, two live screenshots of the site and
the provider logos, in the site's own cream theme and Geist type, with light
sweeps on every cut, grain and a vignette. The soundtrack is `score.mjs`, a
synthesized 120 BPM score in A minor with sound design on the picture's cues
(loader ticks and riser, logo impact, whooshes, counter ticks, typing), so
there is nothing licensed in it. `preview.gif` is the opening, used at the top
of the repo README.

Rebuild after changing the site or the copy:

```sh
BASE_URL=http://localhost:3459 node shots.mjs    # refresh shots/how.png and shots/earn.png
PREVIEW=1.6,5,10,15,20,25,28.5 node render.mjs   # preview/<t>.png stills to check
node score.mjs                                   # score.wav, the soundtrack
npm i --no-save ffmpeg-static && node render.mjs # frames/ then kredit-promo.mp4 with sound (FFMPEG=… to use another binary)
```

Needs Google Chrome at its usual macOS path (see `cdp.mjs`) and network access
for Google Fonts. Scenes and timings live in the CSS at the top of `promo.html`
(`--s` start, `--e` end per scene) on the story clock; the loader, sweeps and
film polish run on the film clock (`#real`, `#overlay`). `seek()` maps film
time to story time (the story starts at 3 s and plays 10% faster), and
`score.mjs` uses the same mapping for its cues.
