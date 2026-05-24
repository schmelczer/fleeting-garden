Piano samples are Salamander Grand Piano V3 samples by Alexander Holm,
transcoded from OGG Vorbis to AAC M4A for iOS browser playback and distributed
under CC BY 3.0.

Source package: @audio-samples/piano-velocity12
Source recording: https://archive.org/details/SalamanderGrandPianoV3
License: https://creativecommons.org/licenses/by/3.0/

Checked-in subset: velocity layer `v12`, every minor-third anchor from A0
through C8: A, C, Dsharp, and Fsharp for octaves 1-7, plus A0, A7, and C8.
The app derives MIDI values from those note names in `piano-samples.ts`.

Repro notes: start from the matching `v12` OGG files in the source package and
transcode each selected sample to AAC/M4A without renaming the note/velocity
stem. The expected output filenames are `<note>v12.m4a`, for example
`C4v12.m4a`.
