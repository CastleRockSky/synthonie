import { Modal } from './controls';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How it works" onClose={onClose} width={620}>
      <div className="stack help">
        <p>
          <b>Sounds</b> (left) is your library. Press ▶ to hear one. Import files, record with the mic, or use the built-in ones. Click a name to rename it.
        </p>
        <p>
          <b>Soundscape</b> stacks sounds into a place: a forest, a cave, a town. <i>Loop</i> plays forever. <i>Random</i> plays now and then, which is perfect for
          birds, owls and thunder. Turn up <i>Muffle</i> to make something sound far away or behind a wall; <i>Space</i> puts it in a big room.
        </p>
        <p>
          <b>Beat Maker</b> makes music. Click squares on the drum rows to make a beat. The tune grid only has notes that go together, so anything you draw sounds
          fine. Squares next to each other join into one long note. Try <i>Spooky</i> for dungeons and <i>Happy</i> for towns.
        </p>
        <p>
          <b>Guitar</b> turns the PC into a pedalboard. Plug the guitar into the interface, pick it as the input, press <i>Input on</i> and stomp on pedals. <i>Record take</i>{' '}
          puts what you play into Sounds, where it works like any other sound. The demo riff lets you try the pedals with no guitar. A little delay between pick and
          sound is normal; if you hear two guitars, turn the interface&apos;s own monitor knob down.
        </p>
        <p>
          <b>Play</b> (or the space bar) plays the Soundscape and the Beat together. Each has an On/Off switch at the top of its tab. You can change anything
          while it plays.
        </p>
        <p>
          <b>Export</b> makes a sound file to put in your game: <i>OGG</i> for RPG Maker (drop it in the audio/bgm, bgs or se folder), or <i>WAV</i>. <i>Seamless loop</i>{' '}
          blends the end into the start so it repeats without a gap.
        </p>
        <p>
          <b>Save</b> keeps everything in one .synthonie file, including your recordings. The app also remembers your work if you close it by accident.
        </p>
        <p className="hint">Secret words: Muffle is a low-pass filter, Space is reverb, the tune grid is a pentatonic scale, and a Loop is a sample loop.</p>
      </div>
    </Modal>
  );
}
