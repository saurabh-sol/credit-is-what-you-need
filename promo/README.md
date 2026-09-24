# Kredit promo (30 s, 1920×1080, 30 fps)

`kredit-promo.mp4` is rendered from `promo.html`, a scrubbable timeline of the
landing copy, two live screenshots of the site and the provider logos, in the
site's own cream theme and Geist type. Silent; drop a music bed on with
`ffmpeg -i kredit-promo.mp4 -i music.mp3 -shortest -c:v copy out.mp4`.

Rebuild after changing the site or the copy:

```sh
BASE_URL=http://localhost:3459 node shots.mjs    # refresh shots/how.png and shots/earn.png
PREVIEW=1.6,5,10,15,20,25,28.5 node render.mjs   # preview/<t>.png stills to check
npm i --no-save ffmpeg-static && node render.mjs # frames/ then kredit-promo.mp4 (FFMPEG=… to use another binary)
```

Needs Google Chrome at its usual macOS path (see `cdp.mjs`) and network access
for Google Fonts. Scenes and timings live in the CSS at the top of `promo.html`
(`--s` start, `--e` end per scene); the counter and the typed response are the
two JS-driven bits in `tick()`.
