Piano samples are Salamander Grand Piano V3 samples by Alexander Holm,
transcoded from OGG Vorbis to AAC M4A for iOS browser playback and distributed
under CC BY 3.0.

Source packages:

- @audio-samples/piano-velocity4
- @audio-samples/piano-velocity8
- @audio-samples/piano-velocity12
- @audio-samples/piano-velocity16
- @audio-samples/piano-release

Source recording: https://archive.org/details/SalamanderGrandPianoV3
License: https://creativecommons.org/licenses/by/3.0/

Checked-in subset: velocity layers `v4`, `v8`, `v12`, and `v16` at the
available Salamander strike anchors, plus all 88 release samples. The strike
anchors are A, C, Dsharp, and Fsharp for octaves 1-7, plus A0, A7, and C8.
The app derives strike MIDI values and velocity layers from filenames in
`piano-samples.ts`; release sample `rel1` maps to A0 and `rel88` maps to C8.

Repro notes: start from the matching OGG files in the source packages
(~88 kbps Vorbis, 48 kHz stereo) and transcode each selected sample to
AAC/M4A at 96 kbps (`ffmpeg -i <src>.ogg -c:a aac -b:a 96k -movflags
+faststart <dest>.m4a`) without renaming the note/velocity or release stem.
Strike samples longer than 12 seconds are faded out from 10 s to 12 s and cut
there (`-af afade=t=out:st=10:d=2 -t 12`); the sampler's own gain envelope
masks the shortened tail. Replace `#` with `sharp` in filenames for URL
compatibility. Expected output filenames include `<note>v<layer>.m4a`, for
example `C4v16.m4a`, and `rel<index>.m4a`, for example `rel40.m4a`.
