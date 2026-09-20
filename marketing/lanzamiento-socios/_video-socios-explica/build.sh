#!/bin/bash
# Montaje video explicativo socios Fandez
set -euo pipefail
OUT="/Users/miguelangel/Downloads/fandez app/marketing/lanzamiento-socios/_video-socios-explica"
FPS=25
W=1080
H=1920
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
if [[ ! -f "$FONT" ]]; then FONT="/Library/Fonts/Arial Bold.ttf"; fi
if [[ ! -f "$FONT" ]]; then FONT="/System/Library/Fonts/Helvetica.ttc"; fi

cd "$OUT"
mkdir -p segs

# Helper: still → clip con zoom suave + texto
make_seg() {
  local img="$1" dur="$2" title="$3" sub="$4" out="$5"
  local frames
  frames=$(python3 - <<PY
print(int(round($dur * $FPS)))
PY
)
  local draw=""
  if [[ -n "$title" ]]; then
    draw="drawtext=fontfile=${FONT}:text='${title}':fontcolor=white:fontsize=54:borderw=0:box=1:boxcolor=0xC45C14@0.92:boxborderw=18:x=(w-text_w)/2:y=h*0.12"
  fi
  if [[ -n "$sub" ]]; then
    if [[ -n "$draw" ]]; then draw="${draw},"; fi
    draw="${draw}drawtext=fontfile=${FONT}:text='${sub}':fontcolor=0x1A1814:fontsize=36:box=1:boxcolor=0xF7F3EE@0.88:boxborderw=14:x=(w-text_w)/2:y=h*0.20"
  fi
  local vf="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='min(1.0+0.0012*on,1.10)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS}"
  if [[ -n "$draw" ]]; then vf="${vf},${draw}"; fi
  ffmpeg -y -loop 1 -i "$img" -vf "$vf" -t "$dur" -c:v libx264 -pix_fmt yuv420p -an "$out" 2>/dev/null
}

# Duraciones alineadas al guión (~40.3s)
make_seg "01-hola-v.jpg"   4.5  "FANDEZ"                 "Así funciona para socios"   segs/01.mp4
make_seg "02-cliente-v.jpg" 6.5  "1 · Cliente pide"        "Servicio pedido y pagado"     segs/02.mp4
make_seg "03-muro-v.jpg"    5.5  "2 · Sale a tu muro"      "Zona + neto visible"          segs/03.mp4
make_seg "04-gasfiter-v.jpg" 2.2 "Gasfitería"              ""                             segs/04.mp4
make_seg "05-aires-v.jpg"    2.2 "Aire acondicionado"      ""                             segs/05.mp4
make_seg "06-jardin-v.jpg"   2.2 "Jardinería"              ""                             segs/06.mp4
make_seg "07-obra-v.jpg"     2.4 "Construcción"            "Tú eliges el oficio"          segs/07.mp4
make_seg "08-pago-v.jpg"     7.5  "3 · Ejecutas y cobras"   "15% app · Materiales 100% tuyos" segs/08.mp4
make_seg "09-cta-v.jpg"      7.4  "Pedidos listos. Tú eliges." "fandez.cl/registro"         segs/09.mp4

# Concat
rm -f segs/list.txt
for i in 01 02 03 04 05 06 07 08 09; do
  echo "file '$OUT/segs/${i}.mp4'" >> segs/list.txt
done

ffmpeg -y -f concat -safe 0 -i segs/list.txt -c copy segs/video-silent.mp4 2>/dev/null

# Mezclar voz + leve ducking silencioso (solo voz)
ffmpeg -y -i segs/video-silent.mp4 -i voice.m4a \
  -filter_complex "[1:a]volume=1.15,afade=t=in:st=0:d=0.4,afade=t=out:st=39.5:d=0.8[a]" \
  -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k \
  -shortest -movflags +faststart \
  "../fandez-video-socios-explica.mp4" 2>/dev/null

# También versión horizontal 16:9 para reuniones (letterbox crema)
ffmpeg -y -i "../fandez-video-socios-explica.mp4" \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF7F3EE" \
  -c:a copy -movflags +faststart \
  "../fandez-video-socios-explica-reunion.mp4" 2>/dev/null

ls -lh "../fandez-video-socios-explica.mp4" "../fandez-video-socios-explica-reunion.mp4"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "../fandez-video-socios-explica.mp4"
