# Memory VII: The Shape of Someone

Shadow puppetry: misunderstanding, projection, emotional distance. A 26-second
standalone film, a study for the memory, not yet wired into the room.

Two people stand at the edges of a dim room, out of focus at the lens's edges,
and never move toward each other. One warm light drifts across the plaster
behind them. Their shadows, free of them, come closer; she turns her head
down just as he lifts a hand; then they meet, foreheads together, a small
heart of light caught between their faces, his hand on her back. They hold.
As the light moves on they part, a thread of shade holding between their
hands for a moment before it lets go, and the light goes out. The people
casting them have not moved.

- `render.py`: the picture, painted procedurally (numpy + Pillow, signed
  distance fields for the figures, penumbra widening as the shadows part).
  Every moment is a keyframe list at the top of the file.
- `mix.sh`: the sound, laid along those moments and muxed with the picture.
- Sound: ElevenLabs Sound Effects v2 takes, generated 2026-11-04 in the
  flow "Memory VII — The Shape of Someone", raw in `audition/memory-vii/raw/`
  (room tone, a glass harmonica tone, two cello swells, two felt piano notes,
  an exhale). All the takes are kept; `mix.sh` names the ones used.
- The film: `audition/memory-vii/memory-vii.mp4`.

```
python3 scripts/memory-vii/render.py /tmp/picture.mp4        # ~6 min on 4 cores
scripts/memory-vii/mix.sh /tmp/picture.mp4 audition/memory-vii/memory-vii.mp4
python3 scripts/memory-vii/render.py /tmp/still.png --still 9.4,15.5   # stills
```
