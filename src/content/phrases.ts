import type { Phrase, DimVector, Surface, Tier, Hand, Size, Kind, VoiceStyle } from './types';

/**
 * The writing on the walls.
 *
 * North is the wall you face when you arrive, behind the chair: the dilemma itself.
 * East holds ordinary, warm, specific memories. West is harder: shame, anger, being
 * misread — threaded with forgiveness. South, behind you, is almost empty.
 *
 * Dimensions are weights, not labels: a phrase is usually several things at once.
 */

interface Opts {
  surface: Surface;
  tier?: Tier;
  hand?: Hand;
  size?: Size;
  kind?: Kind;
  at?: [number, number];
  voice?: VoiceStyle;
  shy?: boolean;
  echoes?: string[];
  contradicts?: string[];
  keywords?: string[];
}

function inferKind(text: string): Kind {
  const words = text.split(/\s+/).length;
  if (text.trim().endsWith('?')) return 'question';
  if (words <= 1) return 'word';
  if (words >= 16) return 'passage';
  if (!/[.!]$/.test(text.trim())) return 'fragment';
  return 'statement';
}

function p(id: string, text: string, dims: DimVector, o: Opts): Phrase {
  return {
    id,
    text,
    dims,
    kind: o.kind ?? inferKind(text),
    surface: o.surface,
    tier: o.tier ?? 'arrival',
    hand: o.hand ?? 'pencil',
    size: o.size ?? 's',
    at: o.at,
    voice: o.voice,
    shy: o.shy,
    echoes: o.echoes,
    contradicts: o.contradicts,
    keywords: o.keywords,
  };
}

export const PHRASES: Phrase[] = [
  // ───────────────────────── NORTH · the dilemma ─────────────────────────
  p('stay', 'I wanted you to stay.', { desire: 0.8, affection: 0.6, grief: 0.4 }, {
    surface: 'north', hand: 'marker', size: 'xl', at: [0.25, 1.8], voice: 'tender',
    contradicts: ['closer', 'need-no-one'], echoes: ['w-stay', 'if-closer'], keywords: ['stay', 'want', 'leave', 'wanted'],
  }),
  p('closer', "Please don't come any closer.", { fear: 0.8, desire: 0.3, isolation: 0.5, contradiction: 0.4 }, {
    surface: 'north', hand: 'pen', size: 'm', at: [0.74, 1.42], voice: 'flat',
    contradicts: ['stay', 'look-at-me'], echoes: ['not-so-tight', 'this-bit'], keywords: ['close', 'closer', 'near', 'come'],
  }),
  p('together', 'together', { connection: 0.8, fear: 0.2 }, {
    surface: 'north', hand: 'typed', size: 'm', at: [0.09, 2.62], contradicts: ['alone'], keywords: ['together', 'us', 'we'],
  }),
  p('alone', 'alone', { isolation: 0.8, relief: 0.3 }, {
    surface: 'north', hand: 'typed', size: 'm', at: [0.9, 0.58], contradicts: ['together'], keywords: ['alone', 'lonely', 'myself'],
  }),
  p('afraid-leave', "I was afraid you'd leave.", { fear: 0.7, affection: 0.5, desire: 0.3 }, {
    surface: 'north', tier: 'familiar', hand: 'pen', voice: 'whisper',
    contradicts: ['maybe-wanted'], echoes: ['stay'], keywords: ['afraid', 'leave', 'left', 'scared'],
  }),
  p('maybe-wanted', 'Maybe I wanted you to.', { contradiction: 0.8, shame: 0.4, relief: 0.4 }, {
    surface: 'north', tier: 'annotation', hand: 'pencil', voice: 'whisper', contradicts: ['afraid-leave'],
  }),
  p('far-enough', 'far enough to miss you', { isolation: 0.6, desire: 0.6, relief: 0.3, contradiction: 0.5 }, {
    surface: 'north', tier: 'arrival', echoes: ['diagonal'], keywords: ['far', 'miss', 'distance'],
  }),
  p('your-hand', 'your hand, almost', { desire: 0.7, affection: 0.5, fear: 0.4 }, {
    surface: 'north', tier: 'still', hand: 'faint', keywords: ['hand', 'touch', 'hold'],
  }),
  p('door-open', 'the door, slightly open', { desire: 0.5, uncertainty: 0.5, fear: 0.3 }, {
    surface: 'north', tier: 'familiar', hand: 'cyan', keywords: ['door', 'open'],
  }),
  p('if-closer', 'If I come closer, will you stay?', { desire: 0.7, fear: 0.5, connection: 0.5 }, {
    surface: 'north', tier: 'contradiction', voice: 'tender', echoes: ['stay', 'closer'], keywords: ['closer', 'stay'],
  }),
  p('need-no-one', "I don't need anyone.", { isolation: 0.7, self: 0.6, anger: 0.3, contradiction: 0.5 }, {
    surface: 'north', hand: 'marker', size: 's', contradicts: ['stay', 'this-bit'], keywords: ['need', 'anyone', 'nobody'],
  }),
  p('easier-without', "It's easier when you're not here.", { relief: 0.6, isolation: 0.5, shame: 0.4, contradiction: 0.5 }, {
    surface: 'north', tier: 'contradiction', voice: 'flat', contradicts: ['too-quiet', 'thank-staying'], keywords: ['easier', 'without', 'gone'],
  }),
  p('too-quiet', "It's too quiet when you're not here.", { grief: 0.6, isolation: 0.6, desire: 0.4 }, {
    surface: 'south', tier: 'familiar', hand: 'faint', voice: 'whisper', contradicts: ['easier-without'], keywords: ['quiet', 'without', 'gone', 'silence'],
  }),
  p('alone-with-you', 'I wanted to be left alone with you.', { desire: 0.7, isolation: 0.5, affection: 0.6, contradiction: 0.6 }, {
    surface: 'north', tier: 'familiar', hand: 'pen', echoes: ['together', 'alone'], keywords: ['alone', 'with you'],
  }),
  p('not-so-tight', 'Hold on. Not so tight.', { affection: 0.6, fear: 0.5, desire: 0.4, contradiction: 0.7 }, {
    surface: 'north', tier: 'contradiction', hand: 'pencil', voice: 'tender', echoes: ['love-go-away'], keywords: ['hold', 'tight', 'hug'],
  }),
  p('love-go-away', 'I love you. Go away.', { affection: 0.8, fear: 0.5, contradiction: 0.9, isolation: 0.4 }, {
    surface: 'north', tier: 'contradiction', hand: 'marker', size: 's', voice: 'flat',
    echoes: ['not-so-tight', 'arm-dead'], keywords: ['love', 'go away'],
  }),
  p('come-back-dont', "Come back. Don't.", { desire: 0.6, fear: 0.5, contradiction: 0.8 }, {
    surface: 'north', tier: 'annotation', hand: 'pencil', voice: 'whisper', echoes: ['stay'],
  }),
  p('look-at-me', 'Look at me.', { desire: 0.7, connection: 0.5, self: 0.4 }, {
    surface: 'north', tier: 'familiar', hand: 'pencil', size: 'm', shy: true, contradicts: ['dont-look'], keywords: ['look', 'see'],
  }),
  p('w-almost', 'almost', { desire: 0.5, uncertainty: 0.5, fear: 0.3 }, { surface: 'north', hand: 'pencil', size: 's', keywords: ['almost'] }),
  p('not-going', "I'm not going anywhere.", { affection: 0.6, connection: 0.5, contradiction: 0.3, isolation: 0.2 }, {
    surface: 'north', hand: 'pen', voice: 'tender', keywords: ['going', 'anywhere', 'stay'],
  }),
  p('arm-dead', "You fell asleep on my shoulder and my arm went dead and I didn't move it.", { affection: 0.8, connection: 0.6, contradiction: 0.4, happiness: 0.3 }, {
    surface: 'north', tier: 'contradiction', hand: 'pen', keywords: ['asleep', 'shoulder', 'arm'],
  }),
  p('this-bit', "Don't go yet, this bit's good.", { connection: 0.7, desire: 0.5, happiness: 0.5 }, {
    surface: 'north', tier: 'familiar', hand: 'pencil', voice: 'tender', keywords: ['go', 'stay', 'film'],
  }),
  p('w-stay', 'stay', { desire: 0.7 }, { surface: 'north', tier: 'still', hand: 'faint', size: 'xs', at: [0.5, 0.42], echoes: ['stay'] }),
  p('w-away', 'away', { isolation: 0.6, relief: 0.4, fear: 0.3 }, { surface: 'north', hand: 'pencil', size: 'xs', at: [0.62, 0.78] }),
  p('w-no', 'no', { fear: 0.4, anger: 0.4, self: 0.5 }, { surface: 'north', tier: 'familiar', hand: 'marker', size: 's', contradicts: ['w-yes'] }),
  p('w-you', 'you', { connection: 0.6, desire: 0.5, fear: 0.3 }, { surface: 'north', tier: 'familiar', hand: 'child', size: 'm', shy: true }),
  p('small-minute', 'Let me be small for a minute.', { self: 0.6, relief: 0.5, desire: 0.4 }, {
    surface: 'north', tier: 'near', hand: 'faint', size: 'xs', at: [0.45, 0.62], voice: 'child', echoes: ['used-to-fit'], keywords: ['small', 'little', 'child'],
  }),
  // ───────────────────────── FLOOR & CEILING ─────────────────────────
  p('used-to-fit', 'It used to fit me.', { nostalgia: 0.8, self: 0.6, grief: 0.4, happiness: 0.2 }, {
    surface: 'floor', tier: 'near', hand: 'child', size: 'xs', at: [0.465, 0.567],
    echoes: ['kitchen-floor', 'small-minute'], keywords: ['chair', 'small', 'child', 'grew', 'grown'],
  }),
  p('w-here', 'here', { self: 0.4, connection: 0.3 }, { surface: 'floor', tier: 'near', hand: 'faint', size: 'xs', at: [0.565, 0.47] }),
  p('warmer-here', 'Budge up.', { connection: 0.6, affection: 0.5, happiness: 0.4 }, {
    surface: 'floor', tier: 'near', hand: 'pencil', size: 'xs', at: [0.385, 0.525],
  }),
  p('still-here', "I'm still here.", { self: 0.5, isolation: 0.5, relief: 0.5, connection: 0.3 }, {
    surface: 'ceiling', tier: 'arrival', hand: 'pencil', size: 's', at: [0.47, 0.64], voice: 'tender', keywords: ['still', 'here'],
  }),

  // ───────────────────────── EAST · ordinary, warm, specific ─────────────────────────
  p('happy-then', 'I think I was happy then.', { nostalgia: 0.8, happiness: 0.6, uncertainty: 0.4 }, {
    surface: 'east', hand: 'pen', size: 'm', at: [0.36, 1.66], voice: 'tender', echoes: ['good-day', 'laugh'], keywords: ['happy', 'then', 'was'],
  }),
  p('laugh', 'I remember your laugh.', { nostalgia: 0.8, affection: 0.7, grief: 0.3 }, {
    surface: 'east', hand: 'pencil', size: 'm', voice: 'whisper', echoes: ['laugh-breathe', 'two-cups'], keywords: ['laugh', 'remember', 'laughing'],
  }),
  p('good-day', 'That was a good day.', { happiness: 0.8, nostalgia: 0.6, relief: 0.3 }, {
    surface: 'east', hand: 'crayon', size: 'm', at: [0.7, 1.25], voice: 'tender', echoes: ['happy-then'], keywords: ['good', 'day'],
  }),
  p('wish-see', 'I wish you could see this.', { affection: 0.6, grief: 0.6, desire: 0.5, happiness: 0.3 }, {
    surface: 'east', tier: 'familiar', hand: 'pen', voice: 'whisper', echoes: ['keep-calling'], keywords: ['wish', 'see', 'show'],
  }),
  p('w-warm', 'warm', { happiness: 0.5, affection: 0.5 }, { tier: 'familiar', surface: 'east', hand: 'crayon', size: 's' }),
  p('w-yes', 'yes', { connection: 0.6, happiness: 0.4, desire: 0.4 }, { surface: 'east', tier: 'familiar', hand: 'pencil', size: 'xs', contradicts: ['w-no'] }),
  p('home', 'home', { nostalgia: 0.6, connection: 0.4, uncertainty: 0.3 }, { surface: 'east', hand: 'typed', size: 'm', at: [0.88, 2.55], keywords: ['home', 'house'] }),
  p('rain-carpark', 'the smell of rain on the car park', { nostalgia: 0.7, happiness: 0.4 }, { surface: 'east', hand: 'cyan', keywords: ['rain', 'smell'] }),
  p('before-woke', 'before everyone woke up', { nostalgia: 0.6, relief: 0.5, happiness: 0.4, isolation: 0.3 }, {
    surface: 'east', tier: 'familiar', hand: 'cyan', keywords: ['morning', 'early', 'woke'],
  }),
  p('long-way', 'the long way home', { nostalgia: 0.5, relief: 0.4, uncertainty: 0.3, isolation: 0.3 }, {
    tier: 'familiar', surface: 'east', hand: 'pencil', keywords: ['walk', 'home', 'way'],
  }),
  p('sandwich', 'half a sandwich and the whole afternoon', { happiness: 0.7, nostalgia: 0.6, relief: 0.3 }, {
    surface: 'east', hand: 'crayon', keywords: ['afternoon', 'lunch', 'sandwich'],
  }),
  p('fridge-hum', 'the hum of the fridge at night', { isolation: 0.4, relief: 0.4, nostalgia: 0.4 }, {
    surface: 'east', tier: 'still', hand: 'faint', keywords: ['night', 'hum', 'fridge', 'kitchen'],
  }),
  p('humming', 'someone humming in the next room', { happiness: 0.5, connection: 0.5, nostalgia: 0.5 }, {
    surface: 'east', tier: 'familiar', hand: 'pencil', keywords: ['humming', 'song', 'singing', 'music'],
  }),
  p('summer', 'Whose idea was the tent?', { nostalgia: 0.7, happiness: 0.5, connection: 0.4 }, {
    surface: 'east', hand: 'pen', voice: 'whisper', keywords: ['summer', 'tent', 'camping', 'holiday'],
  }),
  p('laugh-breathe', "You made me laugh so hard I couldn't breathe.", { happiness: 0.9, affection: 0.6, nostalgia: 0.5 }, {
    surface: 'east', tier: 'familiar', hand: 'crayon', echoes: ['laugh'], keywords: ['laugh', 'funny', 'breathe'],
  }),
  p('cereal', 'We ate cereal for dinner and it was perfect.', { happiness: 0.8, nostalgia: 0.5, relief: 0.3 }, {
    surface: 'east', hand: 'pencil', keywords: ['dinner', 'cereal', 'food', 'perfect'],
  }),
  p('jumper', "I kept your jumper. I don't wear it.", { grief: 0.6, affection: 0.5, nostalgia: 0.5, contradiction: 0.3 }, {
    surface: 'east', tier: 'familiar', hand: 'pen', keywords: ['kept', 'jumper', 'sweater', 'clothes'],
  }),
  p('just-listen', 'Everyone was talking and I was so happy to just listen.', { happiness: 0.7, connection: 0.7, isolation: 0.3, relief: 0.4 }, {
    surface: 'east', hand: 'pencil', keywords: ['talking', 'listen', 'friends', 'people'],
  }),
  p('hug-arms', "When you hugged me I didn't know where to put my arms.", { affection: 0.5, shame: 0.4, uncertainty: 0.5, happiness: 0.3 }, {
    surface: 'east', tier: 'familiar', hand: 'pencil', echoes: ['not-so-tight'], keywords: ['hug', 'hugged', 'arms'],
  }),
  p('bus-late', 'The bus was late and so were we and nobody minded.', { happiness: 0.7, relief: 0.6, connection: 0.5, nostalgia: 0.4 }, {
    surface: 'east', tier: 'familiar', hand: 'pen', keywords: ['bus', 'late'],
  }),
  p('two-cups', "I still say 'we' by accident.", { grief: 0.7, nostalgia: 0.5, affection: 0.4, contradiction: 0.3 }, {
    surface: 'east', tier: 'contradiction', hand: 'pencil', voice: 'whisper', echoes: ['still-warm'], keywords: ['we', 'still', 'accident', 'us'],
  }),
  p('understood-minute', 'You understood me once, completely, for about a minute.', { connection: 0.8, happiness: 0.5, nostalgia: 0.5, grief: 0.3 }, {
    surface: 'east', tier: 'familiar', hand: 'pen', echoes: ['why-understand'], keywords: ['understood', 'understand'],
  }),
  p('kitchen-light', 'the light in the kitchen at four in the afternoon', { nostalgia: 0.7, happiness: 0.5, relief: 0.4 }, {
    surface: 'east', hand: 'crayon', keywords: ['light', 'kitchen', 'afternoon'],
  }),
  p('biscuit', 'You always took the last biscuit and I let you.', { affection: 0.7, happiness: 0.5, nostalgia: 0.5 }, {
    surface: 'east', tier: 'familiar', hand: 'pencil', keywords: ['biscuit', 'cookie'],
  }),
  p('board-games', 'We were terrible at board games and loved it.', { happiness: 0.8, connection: 0.6, nostalgia: 0.5 }, {
    surface: 'east', tier: 'contradiction', hand: 'pen', keywords: ['games', 'played', 'play'],
  }),
  p('nothing-happened', 'Nothing happened. That was the nice part.', { relief: 0.7, happiness: 0.6 }, {
    surface: 'east', tier: 'still', hand: 'pencil', keywords: ['nothing', 'nice', 'quiet'],
  }),
  p('kitchen-floor', 'We sat on the kitchen floor because the chairs were all in the other room, and you said it was better down here, and it was.', {
    happiness: 0.7, nostalgia: 0.7, connection: 0.6, affection: 0.5,
  }, { surface: 'east', tier: 'familiar', hand: 'pen', echoes: ['used-to-fit'], keywords: ['floor', 'kitchen', 'chair', 'sat'] }),
  p('warm-night', "I don't remember what we talked about. I remember that the window was open and it was the first warm night of the year.", {
    nostalgia: 0.8, happiness: 0.6, connection: 0.4,
  }, { surface: 'east', tier: 'contradiction', hand: 'pencil', keywords: ['night', 'window', 'talked', 'warm'] }),
  p('laugh-film', 'You laughed at the wrong bit of the film and then so did everyone.', { happiness: 0.8, connection: 0.6, nostalgia: 0.5 }, {
    surface: 'east', tier: 'familiar', hand: 'pencil', echoes: ['laugh'], keywords: ['laughed', 'laugh', 'film', 'cinema'],
  }),
  p('crumbs', "You've got crumbs on you.", { affection: 0.6, happiness: 0.5, connection: 0.4 }, {
    surface: 'east', tier: 'familiar', hand: 'crayon', size: 'xs', voice: 'tender', keywords: ['crumbs'],
  }),
  p('dog', "The dog didn't care what I'd done. That helped.", { relief: 0.6, forgiveness: 0.6, happiness: 0.4, affection: 0.5 }, {
    surface: 'east', tier: 'transform', hand: 'pencil', keywords: ['dog', 'cat', 'pet'],
  }),
  p('soup', 'I was going to say something important. It was about soup.', { happiness: 0.5, uncertainty: 0.4 }, {
    surface: 'east', tier: 'contradiction', hand: 'pencil', size: 'xs', keywords: ['soup', 'important', 'say'],
  }),
  p('forgot-voice', 'I forgot your voice and then I remembered it in a shop.', { grief: 0.6, nostalgia: 0.7, happiness: 0.3 }, {
    surface: 'east', tier: 'transform', hand: 'pen', echoes: ['remember-me', 'laugh'], keywords: ['voice', 'forgot', 'remembered'],
  }),

  // ───────────────────────── WEST · being misread ─────────────────────────
  p('why-understand', "Why didn't you understand?", { misunderstanding: 0.9, anger: 0.4, grief: 0.3 }, {
    surface: 'west', hand: 'marker', size: 'm', at: [0.42, 1.72], voice: 'flat',
    contradicts: ['dont-want-understood'], echoes: ['understood-minute'], keywords: ['understand', 'why'],
  }),
  p('dont-want-understood', "Sometimes I don't want to be understood.", { self: 0.7, isolation: 0.5, contradiction: 0.6, misunderstanding: 0.4 }, {
    surface: 'west', tier: 'contradiction', hand: 'pencil', contradicts: ['why-understand'], keywords: ['understood', 'understand'],
  }),
  p('didnt-know-say', "I didn't know what to say.", { uncertainty: 0.7, shame: 0.5, misunderstanding: 0.4 }, {
    surface: 'west', hand: 'pen', voice: 'whisper', echoes: ['practise', 'hug-arms'], keywords: ['say', 'words', 'speak', 'know'],
  }),
  p('w-why', 'why', { misunderstanding: 0.5, anger: 0.4, uncertainty: 0.6 }, { surface: 'west', hand: 'typed', size: 'l', at: [0.12, 2.5] }),
  p('w-sorry', 'sorry', { shame: 0.7, forgiveness: 0.5 }, { surface: 'west', hand: 'pencil', size: 'xs', keywords: ['sorry', 'apologise', 'apologize'] }),
  p('w-enough', 'enough', { anger: 0.5, relief: 0.5, self: 0.4, contradiction: 0.3 }, { surface: 'west', tier: 'familiar', hand: 'marker', size: 's' }),
  p('hurt', 'hurt', { fear: 0.4, grief: 0.5 }, { tier: 'familiar', surface: 'west', hand: 'typed', size: 's', keywords: ['hurt', 'pain'] }),
  p('was-it-me', 'Was it me?', { shame: 0.8, uncertainty: 0.6 }, { surface: 'west', tier: 'familiar', hand: 'pencil', voice: 'whisper', keywords: ['me', 'fault', 'blame'] }),
  p('said-wrong', 'Did I say it wrong?', { shame: 0.6, misunderstanding: 0.7, uncertainty: 0.5 }, { tier: 'familiar', surface: 'west', hand: 'pen', keywords: ['said', 'wrong'] }),
  p('mean-that', 'What did you mean by that?', { misunderstanding: 0.8, uncertainty: 0.5, anger: 0.3 }, {
    surface: 'west', tier: 'familiar', hand: 'pencil', voice: 'flat', keywords: ['mean', 'meant'],
  }),
  p('angry-with-me', 'Are you angry with me?', { fear: 0.5, shame: 0.5, anger: 0.4, misunderstanding: 0.5 }, {
    surface: 'west', hand: 'faint', size: 'xs', voice: 'child', keywords: ['angry', 'mad', 'upset'],
  }),
  p('im-fine', "I'm fine. Really.", { contradiction: 0.6, self: 0.4, shame: 0.3, relief: 0.3 }, { surface: 'west', hand: 'pen', echoes: ['calm-one'], keywords: ['fine', 'okay', 'ok'] }),
  p('sorry-like-that', "I'm sorry I was like that.", { shame: 0.7, forgiveness: 0.7, self: 0.4 }, {
    surface: 'west', tier: 'familiar', hand: 'pencil', voice: 'tender', keywords: ['sorry'],
  }),
  p('forgive-think', 'I forgive you. I think.', { forgiveness: 0.7, uncertainty: 0.6, contradiction: 0.4 }, {
    surface: 'west', tier: 'familiar', hand: 'pen', contradicts: ['not-forgiven'], keywords: ['forgive', 'forgiven'],
  }),
  p('not-forgiven', "I haven't forgiven you, and I miss you.", { forgiveness: 0.3, anger: 0.5, desire: 0.5, contradiction: 0.8, grief: 0.3 }, {
    surface: 'west', tier: 'contradiction', hand: 'marker', size: 's', contradicts: ['forgive-think'], keywords: ['forgive', 'miss'],
  }),
  p('you-were-right', 'You were right. I hate that.', { anger: 0.5, happiness: 0.2, forgiveness: 0.4, contradiction: 0.4 }, {
    surface: 'west', tier: 'contradiction', hand: 'pencil', keywords: ['right', 'hate'],
  }),
  p('angry-whom', "I'm angry and I don't know at whom.", { anger: 0.8, uncertainty: 0.6, self: 0.4 }, {
    surface: 'west', hand: 'marker', size: 's', echoes: ['angry-cake'], keywords: ['angry', 'anger', 'furious'],
  }),
  p('angry-cake', 'I was so angry I made a cake.', { anger: 0.5, happiness: 0.5 }, { surface: 'west', tier: 'familiar', hand: 'crayon', size: 'xs', keywords: ['angry', 'cake'] }),
  p('lonely-birthday', 'I was loneliest at my own birthday.', { isolation: 0.8, grief: 0.4, contradiction: 0.5, misunderstanding: 0.3 }, {
    surface: 'west', tier: 'familiar', hand: 'pen', contradicts: ['alone-ok'], keywords: ['birthday', 'party', 'lonely', 'loneliest'],
  }),
  p('meant-some', "I didn't mean it. I meant some of it.", { shame: 0.5, anger: 0.4, contradiction: 0.6, forgiveness: 0.3 }, {
    surface: 'west', tier: 'contradiction', hand: 'pencil', keywords: ['mean', 'meant'],
  }),
  p('calm-one', "Everyone thinks I'm the calm one.", { self: 0.6, misunderstanding: 0.6, isolation: 0.4 }, { surface: 'west', hand: 'pencil', keywords: ['calm', 'everyone'] }),
  p('practise', 'I practise conversations in the shower.', { self: 0.5, uncertainty: 0.4, isolation: 0.3, happiness: 0.2 }, {
    surface: 'west', tier: 'familiar', hand: 'pencil', size: 'xs', keywords: ['conversation', 'talk', 'practise', 'practice'],
  }),
  p('dont-look', "Don't look at me.", { shame: 0.8, fear: 0.5 }, { surface: 'west', hand: 'pencil', shy: true, contradicts: ['look-at-me'], keywords: ['look'] }),
  p('room-enormous', 'Some days the room is enormous. Some days I can touch both walls without moving.', { self: 0.6, isolation: 0.5, uncertainty: 0.5 }, {
    surface: 'west', tier: 'contradiction', hand: 'pen', echoes: ['size-of-room'], keywords: ['room', 'walls', 'big', 'small'],
  }),
  p('who-talking', 'Who were you talking to?', { misunderstanding: 0.5, isolation: 0.4, uncertainty: 0.5 }, {
    surface: 'west', tier: 'transform', hand: 'faint', voice: 'distant', keywords: ['talking', 'who'],
  }),
  p('is-this-wanted', 'Is this what you wanted?', { anger: 0.5, grief: 0.4, uncertainty: 0.5, contradiction: 0.3 }, {
    surface: 'west', tier: 'contradiction', hand: 'marker', size: 's', keywords: ['wanted', 'want'],
  }),
  p('w-again', 'again', { desire: 0.5, nostalgia: 0.4, contradiction: 0.3 }, { surface: 'west', tier: 'familiar', hand: 'faint', size: 'xs' }),
  p('ordinary', 'Nobody tells you how ordinary it feels.', { grief: 0.5, self: 0.4, uncertainty: 0.4 }, { surface: 'west', tier: 'transform', hand: 'pen', keywords: ['ordinary', 'normal'] }),

  // ───────────────────────── SOUTH · behind you ─────────────────────────
  p('alone-ok', "There's nothing wrong with being alone.", { isolation: 0.5, relief: 0.7, self: 0.5, contradiction: 0.3 }, {
    surface: 'south', hand: 'pencil', size: 's', at: [0.7, 1.52], voice: 'tender',
    contradicts: ['lonely-birthday'], echoes: ['happiest-unneeded'], keywords: ['alone', 'wrong', 'lonely'],
  }),
  p('party-early', 'I left the party early and walked home and it was lovely.', { relief: 0.7, happiness: 0.5, isolation: 0.4, contradiction: 0.3 }, {
    surface: 'south', tier: 'familiar', hand: 'pen', echoes: ['alone-ok'], keywords: ['party', 'walked', 'home', 'early'],
  }),
  p('diagonal', 'I had the whole bed. I slept diagonally.', { relief: 0.6, isolation: 0.5, happiness: 0.4, grief: 0.2 }, {
    surface: 'west', tier: 'contradiction', hand: 'pencil', keywords: ['bed', 'slept', 'sleep'],
  }),
  p('w-hello', 'hello?', { connection: 0.5, isolation: 0.6, uncertainty: 0.4 }, { surface: 'south', hand: 'faint', size: 'xs', at: [0.22, 1.18] }),
  p('remember-me', 'Do you remember me?', { nostalgia: 0.5, isolation: 0.5, desire: 0.5, uncertainty: 0.5 }, {
    surface: 'south', tier: 'familiar', hand: 'child', size: 's', voice: 'child', echoes: ['forgot-voice'], keywords: ['remember', 'forget', 'me'],
  }),
  p('still-there', 'Are you still there?', { isolation: 0.7, fear: 0.4, desire: 0.5 }, {
    surface: 'south', tier: 'familiar', hand: 'pencil', voice: 'distant', keywords: ['still', 'there'],
  }),
  p('happiest-unneeded', 'I was happiest when nobody needed anything from me.', { relief: 0.7, happiness: 0.5, isolation: 0.5, contradiction: 0.4 }, {
    surface: 'south', tier: 'familiar', hand: 'pen', echoes: ['alone-ok'], keywords: ['happiest', 'needed', 'need'],
  }),
  p('keep-calling', 'I keep almost calling.', { desire: 0.7, grief: 0.5, uncertainty: 0.5, fear: 0.3 }, {
    surface: 'south', tier: 'contradiction', hand: 'pencil', keywords: ['call', 'calling', 'phone'],
  }),
  p('glad-came', "I'm glad you came.", { connection: 0.7, happiness: 0.6, relief: 0.4 }, {
    surface: 'south', tier: 'transform', hand: 'pen', voice: 'tender', keywords: ['glad', 'came', 'came back'],
  }),
  p('kept-company', 'You read. I read. Nobody turned a page for ages.', { connection: 0.7, relief: 0.5, happiness: 0.4, isolation: 0.2 }, {
    surface: 'south', tier: 'transform', hand: 'pencil', keywords: ['read', 'reading', 'book', 'quiet', 'company'],
  }),
  p('not-the-same', "It's not the same without you. It's not worse. It's not the same.", { grief: 0.6, relief: 0.3, contradiction: 0.5, forgiveness: 0.3 }, {
    surface: 'south', tier: 'transform', hand: 'pen', keywords: ['same', 'without', 'worse'],
  }),
  p('wrote-walls', "I wrote it all on the walls so I wouldn't have to say it out loud, and then I hoped somebody would read it.", {
    self: 0.6, shame: 0.4, desire: 0.7, connection: 0.5, contradiction: 0.6,
  }, { surface: 'south', tier: 'transform', hand: 'child', echoes: ['didnt-know-say'], keywords: ['wrote', 'walls', 'write', 'read'] }),
  p('w-quiet', 'quiet', { relief: 0.6, isolation: 0.4 }, { surface: 'south', tier: 'still', hand: 'faint', size: 'xs' }),

  // ───────────────────────── STILLNESS · only for those who wait ─────────────────────────
  p('still-warm', 'still warm', { affection: 0.5, grief: 0.5, nostalgia: 0.4 }, { surface: 'north', tier: 'still', hand: 'faint', echoes: ['two-cups'] }),
  p('how-long', 'How long have I been standing here?', { self: 0.5, uncertainty: 0.5, isolation: 0.4 }, { surface: 'west', tier: 'still', hand: 'faint' }),
  p('dont-have-say', 'Nobody said anything for a long time and it was fine.', { relief: 0.6, connection: 0.5, happiness: 0.3, uncertainty: 0.2 }, {
    surface: 'south', tier: 'still', hand: 'pencil', voice: 'tender', keywords: ['say', 'anything', 'words'],
  }),
  p('breathe-out', 'The kettle clicked off.', { relief: 0.6, nostalgia: 0.3, self: 0.2 }, { surface: 'east', tier: 'still', hand: 'faint', size: 'xs' }),
  p('w-me', 'me', { self: 0.9, isolation: 0.3 }, { surface: 'west', tier: 'still', hand: 'faint', size: 'xs' }),
  p('no-one-looking', "I don't know who I am when no one is looking.", { self: 0.9, isolation: 0.5, uncertainty: 0.6 }, {
    surface: 'south', tier: 'still', hand: 'faint', keywords: ['who', 'am', 'looking'],
  }),
  p('sit-awhile', 'Can I sit here for a while?', { relief: 0.5, isolation: 0.4, connection: 0.4, self: 0.4 }, {
    surface: 'north', tier: 'still', hand: 'faint', size: 'xs', voice: 'whisper', keywords: ['sit', 'while', 'rest'],
  }),

  // ───────────────────────── LATE · transformation ─────────────────────────
  p('size-of-room', 'I am exactly the size of this room.', { self: 0.7, isolation: 0.4, contradiction: 0.5 }, { surface: 'north', tier: 'transform', hand: 'pencil' }),
  p('thank-staying', "Your tea's gone cold.", { affection: 0.6, connection: 0.6, relief: 0.4, nostalgia: 0.2 }, {
    surface: 'north', tier: 'transform', hand: 'pen', voice: 'tender', contradicts: ['easier-without'], keywords: ['tea', 'cold', 'stay', 'staying'],
  }),
  p('some-good', 'Some of this was good.', { happiness: 0.5, relief: 0.5, forgiveness: 0.4, nostalgia: 0.4 }, { surface: 'east', tier: 'transform', hand: 'crayon' }),
  p('moving-chair', 'Who keeps moving the chair?', { uncertainty: 0.5, misunderstanding: 0.3, happiness: 0.2 }, { surface: 'south', tier: 'transform', hand: 'pencil', size: 'xs' }),
];

export const PHRASE_BY_ID: ReadonlyMap<string, Phrase> = new Map(PHRASES.map((ph) => [ph.id, ph]));

export function phrase(id: string): Phrase {
  const ph = PHRASE_BY_ID.get(id);
  if (!ph) throw new Error(`unknown phrase ${id}`);
  return ph;
}
