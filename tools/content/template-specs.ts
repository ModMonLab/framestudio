/**
 * Production templates (Catalog P1, FR-TPL-01): complete starting scenes — set, cast roles, props, sample
 * performances, framed cameras and shots, music and ambience, titles and atmosphere. Applied templates contain no
 * dialogue takes, so they play and export straight away; the suggested script is in the scene notes.
 */
import type { TemplateData, TemplateClip, TemplateInstance } from '@frame/core';

const role = (key: string, label: string, chr: string, look?: string) => ({ key, label, kind: 'character' as const, default: `chr.${chr}@1`, ...(look ? { look } : {}) });
const char = (key: string, x: number, o: Partial<TemplateInstance> = {}): TemplateInstance => ({ key, kind: 'character', asset: `$${key}`, x, y: 1000, ...o });
const prop = (key: string, asset: string, x: number, y = 1000, o: Partial<TemplateInstance> = {}): TemplateInstance => ({ key, kind: 'prop', asset: `prop.${asset}@1`, x, y, plane: 'mid', ...o });
const clip = (owner: string, track: TemplateClip['track'], asset: string | undefined, at: number, dur: number, params?: Record<string, unknown>, blend?: number): TemplateClip => ({ owner, track, ...(asset ? { asset } : {}), at, dur, ...(params ? { params } : {}), ...(blend ? { blendIn: blend, blendOut: blend } : {}) });
const music = (ref: string, dur: number) => clip('scene', 'music', `music.${ref}@1`, 0, dur);
const amb = (ref: string, dur: number) => clip('scene', 'ambience', `amb.${ref}@1`, 0, dur);
const atmo = (ref: string, dur: number) => clip('scene', 'effect', `atmo.${ref}@1`, 0, dur, undefined, 0.5);
const title = (ref: string, at: number, dur: number, text: string, subtitle?: string) => clip('scene', 'text', `txt.${ref}@1`, at, dur, { text, ...(subtitle ? { subtitle } : {}) });
const look = (who: string, target: string, at: number, dur: number) => clip(who, 'gaze', undefined, at, dur, { target: `$${target}` });
const act = (who: string, ref: string, at: number, dur: number) => clip(who, 'acting', `act.${ref}@1`, at, dur, undefined, 0.2);
const face = (who: string, ref: string, at: number, dur: number) => clip(who, 'face', `exp.${ref}@1`, at, dur, undefined, 0.2);
const cam = (key: string, name: string, framing: string, subjects: string[]) => ({ key, name, framing: `cam.${framing}@1`, subjects });
const shot = (camera: string, at: number, dur: number, transition?: string) => ({ camera, at, dur, ...(transition ? { transition: `tr.${transition}@1` } : {}) });

/** Two people at a podcast table: wide, two singles, a two-shot. */
function podcast(): TemplateData {
  const D = 16;
  return {
    roles: [role('host', 'Host', 'maya-bennett', 'on-air'), role('guest', 'Guest', 'leo-park', 'on-air')],
    captionStyle: 'txt.podcast-captions@1',
    scene: {
      name: 'Podcast', durationS: D, kit: 'kit.podcast-studio@1',
      notes: 'Host: Welcome back to the show. Today I am joined by a very special guest.\nGuest: Thanks for having me, it is great to be here.\nHost: So, where do we start?',
      instances: [
        prop('table', 'round-table', 960), prop('chairL', 'studio-chair', 660), prop('chairR', 'studio-chair', 1260, 1000, { flipX: true }),
        prop('micL', 'desk-microphone', 840, 805), prop('micR', 'desk-microphone', 1080, 805, { flipX: true }),
        char('host', 660, { seat: 'chairL' }), char('guest', 1260, { flipX: true, seat: 'chairR' }),
      ],
      cameras: [cam('wide', 'Wide', 'wide', ['host', 'guest']), cam('host', 'Host single', 'medium-close-up', ['host']), cam('guest', 'Guest single', 'medium-close-up', ['guest']), cam('two', 'Two-shot', 'two-shot', ['host', 'guest'])],
      shots: [shot('wide', 0, 3), shot('host', 3, 4), shot('guest', 7, 4), shot('two', 11, 5)],
      clips: [look('host', 'guest', 0, D), look('guest', 'host', 0, D), face('host', 'smile', 1, 2.5), face('guest', 'smile', 7.5, 2), title('name-and-role-lower-third', 3.5, 3.5, 'Host name', 'Your show'), title('name-and-role-lower-third', 7.5, 3.5, 'Guest name', 'Guest'), music('late-night-talk', 3), amb('studio-room-tone', D)],
    },
  };
}

function soloPodcast(): TemplateData {
  const D = 12;
  return {
    roles: [role('host', 'Host', 'ravi-shah', 'streamer')],
    captionStyle: 'txt.podcast-captions@1',
    scene: {
      name: 'Solo episode', durationS: D, kit: 'kit.podcast-studio@1',
      notes: 'Host: Hey everyone, welcome to another episode. Today it is just me, and I want to talk about something I have been thinking about all week.',
      instances: [prop('table', 'round-table', 960), prop('chair', 'studio-chair', 960, 1000), prop('mic', 'desk-microphone', 1040, 805, { flipX: true }), char('host', 960, { seat: 'chair', view: 'front' })],
      cameras: [cam('wide', 'Wide', 'medium-wide', ['host']), cam('close', 'Close', 'medium-close-up', ['host'])],
      shots: [shot('wide', 0, 4), shot('close', 4, 8)],
      clips: [face('host', 'smile', 0.5, 3), title('episode-title-card', 0.3, 3, 'Episode title', 'Episode 1'), music('warm-intro', 4), amb('studio-room-tone', D)],
    },
  };
}

function panel(): TemplateData {
  const D = 16;
  return {
    roles: [role('moderator', 'Moderator', 'sam-ortiz', 'presenter'), role('left', 'Panellist 1', 'aiko-tanaka', 'meeting'), role('right', 'Panellist 2', 'nadia-haddad', 'founder')],
    scene: {
      name: 'Panel discussion', durationS: D, kit: 'kit.newsroom@1',
      notes: 'Moderator: Welcome to the panel. Let us start with introductions.\nPanellist 1: Thanks. I lead research at a small lab.\nPanellist 2: And I founded a company in the same space.',
      instances: [prop('table', 'round-table', 960), char('left', 560), char('moderator', 960, { view: 'front' }), char('right', 1360, { flipX: true })],
      cameras: [cam('wide', 'Wide', 'three-shot', ['left', 'moderator', 'right']), cam('mod', 'Moderator', 'medium-close-up', ['moderator']), cam('left', 'Panellist 1', 'medium-close-up', ['left']), cam('right', 'Panellist 2', 'medium-close-up', ['right'])],
      shots: [shot('wide', 0, 4), shot('mod', 4, 3), shot('left', 7, 3), shot('right', 10, 3), shot('wide', 13, 3)],
      clips: [look('left', 'moderator', 0, D), look('right', 'moderator', 0, D), title('location-lower-third', 0.5, 3, 'Panel title', 'Live'), music('curious-minds', 4), amb('auditorium-crowd', D)],
    },
  };
}

function interview(): TemplateData {
  const D = 14;
  return {
    roles: [role('interviewer', 'Interviewer', 'marcus-hale', 'field'), role('subject', 'Subject', 'grace-okafor', 'engineer')],
    scene: {
      name: 'Interview', durationS: D, kit: 'kit.office@1',
      notes: 'Interviewer: Thank you for talking to us. How did this all begin?\nSubject: Honestly, it started as a weekend project.',
      instances: [prop('plant', 'potted-plant', 1500), prop('lamp', 'floor-lamp', 380), char('interviewer', 700), char('subject', 1180, { flipX: true })],
      cameras: [cam('two', 'Interview two-shot', 'interview-two-shot', ['interviewer', 'subject']), cam('ots', 'Over the shoulder', 'over-the-shoulder', ['interviewer', 'subject']), cam('subject', 'Subject close', 'close-up', ['subject'])],
      shots: [shot('two', 0, 4), shot('ots', 4, 5), shot('subject', 9, 5)],
      clips: [look('interviewer', 'subject', 0, D), look('subject', 'interviewer', 0, D), act('subject', 'explain-with-hands', 9.5, 3), title('name-and-role-lower-third', 9.5, 3.5, 'Subject name', 'Role'), atmo('warm-grade', D), amb('office-murmur', D)],
    },
  };
}

function classroom(): TemplateData {
  const D = 14;
  return {
    roles: [role('teacher', 'Teacher', 'priya-nair', 'teacher'), role('student', 'Student', 'jonah-reed', 'student')],
    scene: {
      name: 'Classroom explainer', durationS: D, kit: 'kit.classroom@1',
      notes: 'Teacher: Today we are going to find out why the sky is blue.\nStudent: Is it because it reflects the sea?\nTeacher: Good guess! Let us see.',
      instances: [char('teacher', 760), char('student', 1400, { flipX: true })],
      cameras: [cam('wide', 'Classroom', 'medium-wide', ['teacher', 'student']), cam('teacher', 'Teacher', 'medium', ['teacher']), cam('student', 'Student', 'medium-close-up', ['student'])],
      shots: [shot('wide', 0, 4), shot('teacher', 4, 5), shot('student', 9, 2), shot('teacher', 11, 3)],
      clips: [
        { owner: 'scene', track: 'text', asset: 'txt.chalkboard-text@1', at: 0, dur: D, params: { text: 'Why is the sky blue?', x: 760, y: 330, width: 440 } },
        act('teacher', 'explain-with-hands', 4.5, 3), face('student', 'thinking', 9, 2), fx('light-bulb', 'student', 11, 1.5), look('student', 'teacher', 0, D), amb('classroom-chatter', D),
      ],
    },
  };
}

function fx(ref: string, attach: string, at: number, dur: number): TemplateClip {
  return clip('scene', 'effect', `fx.${ref}@1`, at, dur, { attach: `$${attach}` });
}

function product(): TemplateData {
  const D = 12;
  return {
    roles: [role('presenter', 'Presenter', 'sam-ortiz', 'presenter')],
    scene: {
      name: 'Product explainer', durationS: D, kit: 'kit.office@1',
      notes: 'Presenter: Meet the easiest way to keep your team in sync. Here is how it works in three steps.',
      instances: [char('presenter', 700, { view: 'front' }), prop('table', 'round-table', 1240), prop('phone', 'phone', 1240, 805)],
      cameras: [cam('wide', 'Wide', 'medium-wide', ['presenter', 'phone']), cam('presenter', 'Presenter', 'medium', ['presenter']), cam('insert', 'Product insert', 'insert-detail', ['phone'])],
      shots: [shot('wide', 0, 3), shot('presenter', 3, 4, 'slide'), shot('insert', 7, 2.5, 'zoom-blur'), shot('presenter', 9.5, 2.5)],
      clips: [act('presenter', 'wave-hello', 0.5, 2), act('presenter', 'point-at', 7, 2), title('cold-open-title', 0.3, 2.5, 'Product name'), { owner: 'scene', track: 'text', asset: 'txt.arrow-callout@1', at: 7.2, dur: 2.2, params: { text: 'Tap to sync', attach: '$phone' } }, title('subscribe-end-card', 10, 2, 'Try it free', 'example.com'), music('upbeat-explainer', D)],
    },
  };
}

function comedy(): TemplateData {
  const D = 14;
  return {
    roles: [role('barista', 'Barista', 'theo-lambert', 'barista'), role('customer', 'Customer', 'ben-carter', 'rainy')],
    scene: {
      name: 'Comedy exchange', durationS: D, kit: 'kit.coffee-shop@1',
      notes: 'Customer: One coffee, please. Black.\nBarista: Great choice. Oat, almond or soy?\nCustomer: …Black.\nBarista: So, oat.',
      instances: [char('barista', 560), char('customer', 1050, { flipX: true }), prop('mug', 'mug', 760, 805)],
      cameras: [cam('two', 'Two-shot', 'two-shot', ['barista', 'customer']), cam('customer', 'Customer', 'medium-close-up', ['customer']), cam('barista', 'Barista', 'medium-close-up', ['barista']), cam('beat', 'Comedic beat', 'close-up', ['customer'])],
      shots: [shot('two', 0, 4), shot('barista', 4, 3), shot('customer', 7, 3), shot('beat', 10, 2), shot('two', 12, 2)],
      clips: [look('barista', 'customer', 0, D), look('customer', 'barista', 0, D), face('barista', 'big-grin', 4, 3), face('customer', 'deadpan', 7, 5), fx('sweat-drops', 'customer', 10.2, 1.6), clip('scene', 'sfx', 'cue.rimshot@1', 12, 1.2), music('quirky-comedy', 4), amb('coffee-shop', D)],
    },
  };
}

function sitcom(): TemplateData {
  const D = 16;
  return {
    roles: [role('a', 'Flatmate 1', 'maya-bennett', 'evening'), role('b', 'Flatmate 2', 'leo-park', 'everyday'), role('c', 'Neighbour', 'aiko-tanaka', 'casual')],
    scene: {
      name: 'Sitcom scene', durationS: D, kit: 'kit.living-room@1',
      notes: 'Flatmate 1: Did you eat my leftovers?\nFlatmate 2: Define "eat".\nNeighbour (entering): Is this a bad time?',
      instances: [prop('lamp', 'floor-lamp', 260), prop('plant', 'potted-plant', 1720), prop('door', 'door', 1560, 1000, { plane: 'back' }), char('a', 640), char('b', 1060, { flipX: true }), char('c', 1560, { flipX: true })],
      cameras: [cam('wide', 'Wide', 'three-shot', ['a', 'b', 'c']), cam('a', 'Flatmate 1', 'medium-close-up', ['a']), cam('b', 'Flatmate 2', 'medium-close-up', ['b']), cam('c', 'Neighbour', 'medium', ['c'])],
      shots: [shot('wide', 0, 4), shot('a', 4, 3), shot('b', 7, 3), shot('c', 10, 3), shot('wide', 13, 3)],
      clips: [look('a', 'b', 0, 10), look('b', 'a', 0, 10), act('a', 'arms-crossed', 4, 5), face('b', 'sheepish', 7, 3), act('c', 'wave-hello', 10.2, 2), look('a', 'c', 10, 6), look('b', 'c', 10, 6), clip('scene', 'sfx', 'sfx.knock@1', 9.5, 0.8), atmo('warm-grade', D), amb('living-room-hum', D)],
    },
  };
}

function news(): TemplateData {
  const D = 12;
  return {
    roles: [role('anchor', 'Anchor', 'marcus-hale', 'anchor')],
    scene: {
      name: 'News segment', durationS: D, kit: 'kit.newsroom@1',
      notes: 'Anchor: Good evening. Our top story tonight: a remarkable discovery in the city park.',
      instances: [char('anchor', 960, { view: 'front' })],
      cameras: [cam('desk', 'Anchor desk', 'medium', ['anchor']), cam('close', 'Anchor close', 'medium-close-up', ['anchor'])],
      shots: [shot('desk', 0, 6), shot('close', 6, 6, 'push')],
      clips: [title('breaking-news-bar', 0.5, 11, 'Breaking news', 'Top story'), title('logo-bug', 0, D, 'NEWS'), act('anchor', 'beat-gesture', 3, 1.5), music('tension-pulse', 3), amb('newsroom-bustle', D)],
    },
  };
}

function intro(): TemplateData {
  const D = 10;
  return {
    roles: [role('hero', 'Character', 'nadia-haddad', 'founder')],
    scene: {
      name: 'Character introduction', durationS: D, kit: 'kit.living-room@1',
      notes: 'Character: Hi! I am the one who keeps everything running around here.',
      instances: [char('hero', 960, { view: 'front' })],
      cameras: [cam('full', 'Full', 'full', ['hero']), cam('close', 'Close', 'close-up', ['hero'])],
      shots: [shot('full', 0, 5), shot('close', 5, 5, 'iris-in')],
      clips: [act('hero', 'wave-hello', 0.8, 2.2), face('hero', 'big-grin', 0.8, 3), fx('sparkles', 'hero', 5, 1.5), title('name-and-role-lower-third', 1.5, 3.5, 'Character name', 'What they do'), atmo('spotlight', D), music('warm-intro', D)],
    },
  };
}

function socialShort(): TemplateData {
  const D = 10;
  return {
    roles: [role('creator', 'Creator', 'ravi-shah', 'streamer')],
    captionStyle: 'txt.social-pop-captions@1',
    aspectRatios: ['9:16'],
    scene: {
      name: 'Social short', durationS: D, kit: 'kit.bedroom@1',
      notes: 'Creator: Three things nobody tells you about starting a podcast. Number one…',
      instances: [char('creator', 960, { view: 'front' })],
      cameras: [cam('mid', 'Medium', 'medium', ['creator']), cam('close', 'Close', 'close-up', ['creator'])],
      shots: [shot('close', 0, 3), shot('mid', 3, 4, 'whip-blur'), shot('close', 7, 3, 'zoom-blur')],
      clips: [face('creator', 'excited', 0, 3), act('creator', 'emphatic-talk', 3, 4), title('social-handle-tag', 0.5, 9, '@yourhandle'), title('progress-bar', 0, D, ''), atmo('pastel', D), music('retro-game', D)],
    },
  };
}

function story(): TemplateData {
  const D = 14;
  return {
    roles: [role('a', 'Lead', 'grace-okafor', 'sunday'), role('b', 'Friend', 'luc-a-ferreira', 'evening')],
    scene: {
      name: 'Story scene', durationS: D, kit: 'kit.park@1',
      notes: 'Lead: I never thought I would come back here.\nFriend: The park has not changed a bit.',
      instances: [prop('plant', 'potted-plant', 300), char('a', 820), char('b', 1240, { flipX: true })],
      cameras: [cam('wide', 'Establishing', 'wide', ['a', 'b']), cam('a', 'Lead', 'medium-close-up', ['a']), cam('b', 'Friend', 'medium-close-up', ['b'])],
      shots: [shot('wide', 0, 4), shot('a', 4, 5, 'crossfade'), shot('b', 9, 5)],
      clips: [look('a', 'b', 0, D), look('b', 'a', 0, D), face('a', 'dreamy', 4, 4), atmo('golden-hour', D), clip('scene', 'effect', 'atmo.floating-petals@1', 0, D), title('location-lower-third', 0.5, 3, 'Somewhere familiar'), music('calm-ambient', D), amb('park-birds', D)],
    },
  };
}

function mystery(): TemplateData {
  const D = 14;
  return {
    roles: [role('detective', 'Detective', 'elena-novak', 'detective'), role('suspect', 'Suspect', 'luc-a-ferreira', 'evening')],
    scene: {
      name: 'Mystery scene', durationS: D, kit: 'kit.office@1',
      notes: 'Detective: Where were you on the night of the ninth?\nSuspect: At home. Alone.\nDetective: Funny. Your phone says otherwise.',
      instances: [prop('lamp', 'floor-lamp', 1620), prop('table', 'round-table', 960), prop('phone', 'phone', 960, 805), char('detective', 620), char('suspect', 1300, { flipX: true })],
      cameras: [cam('wide', 'Wide', 'wide', ['detective', 'suspect']), cam('det', 'Detective', 'close-up', ['detective']), cam('sus', 'Suspect', 'close-up', ['suspect']), cam('phone', 'The phone', 'insert-detail', ['phone'])],
      shots: [shot('wide', 0, 3, 'fade-to-black'), shot('det', 3, 3), shot('sus', 6, 3), shot('phone', 9, 2), shot('sus', 11, 3)],
      clips: [look('detective', 'suspect', 0, D), look('suspect', 'detective', 0, 9), face('detective', 'suspicious', 3, 3), face('suspect', 'nervous', 6, 8), fx('sweat-drops', 'suspect', 11.2, 2), atmo('noir', D), clip('scene', 'effect', 'atmo.rain-on-glass@1', 0, D), clip('scene', 'sfx', 'cue.dramatic-hit@1', 9, 1.5), music('sneaky-moment', D), amb('rain-on-window', D)],
    },
  };
}

function support(): TemplateData {
  const D = 14;
  return {
    roles: [role('agent', 'Support agent', 'aiko-tanaka', 'studio'), role('customer', 'Customer', 'jonah-reed', 'weekend')],
    scene: {
      name: 'Customer support demo', durationS: D, kit: 'kit.office@1',
      notes: 'Customer: Hi, I cannot log in to my account.\nAgent: No problem! Tap "Forgot password" and we will send you a link.\nCustomer: Oh, that was easy.',
      instances: [char('agent', 640, { view: 'front' }), char('customer', 1300, { flipX: true })],
      cameras: [cam('two', 'Two-shot', 'two-shot', ['agent', 'customer']), cam('agent', 'Agent', 'medium', ['agent']), cam('customer', 'Customer', 'medium', ['customer'])],
      shots: [shot('customer', 0, 4), shot('agent', 4, 5, 'slide'), shot('customer', 9, 3, 'slide'), shot('two', 12, 2)],
      clips: [act('customer', 'use-phone', 0.2, 3.6), face('customer', 'frustrated', 0, 4), face('agent', 'polite-smile', 4, 5), face('customer', 'relieved', 9, 3), fx('light-bulb', 'customer', 9.2, 1.5), clip('scene', 'sfx', 'sfx.notification-chime@1', 8.6, 1), title('quote-card', 12, 2, 'Help is one tap away'), music('morning-coffee', D)],
    },
  };
}

function announcement(): TemplateData {
  const D = 10;
  return {
    roles: [role('host', 'Announcer', 'nadia-haddad', 'pitch')],
    scene: {
      name: 'Announcement', durationS: D, kit: 'kit.newsroom@1',
      notes: 'Announcer: We have big news. Starting today, everyone can join!',
      instances: [char('host', 960, { view: 'front' })],
      cameras: [cam('mid', 'Medium', 'medium', ['host']), cam('wide', 'Wide', 'full', ['host'])],
      shots: [shot('mid', 0, 5), shot('wide', 5, 5, 'fade-to-white')],
      clips: [act('host', 'open-palms', 1, 2), face('host', 'excited', 4.5, 3), clip('scene', 'effect', 'atmo.confetti@1', 5, 5), clip('scene', 'sfx', 'cue.ta-da@1', 5, 2), title('opening-card', 5.5, 4, 'Big news', 'Now open to everyone'), music('upbeat-explainer', D)],
    },
  };
}

function bedtime(): TemplateData {
  const D = 16;
  return {
    roles: [role('narrator', 'Narrator', 'priya-nair', 'everyday'), role('child', 'Child', 'ben-carter', 'pyjamas')],
    scene: {
      name: 'Bedtime story', durationS: D, kit: 'kit.bedroom@1',
      notes: 'Narrator: Once upon a time, in a forest full of fireflies, there lived a very sleepy owl.\nChild: What was the owl called?',
      instances: [prop('lamp', 'floor-lamp', 1820), char('narrator', 1200, { flipX: true }), char('child', 700)],
      cameras: [cam('two', 'Two-shot', 'two-shot', ['narrator', 'child']), cam('narrator', 'Narrator', 'medium-close-up', ['narrator']), cam('child', 'Child', 'medium-close-up', ['child'])],
      shots: [shot('two', 0, 5, 'iris-in'), shot('narrator', 5, 5, 'crossfade'), shot('child', 10, 3, 'crossfade'), shot('two', 13, 3, 'crossfade')],
      clips: [look('narrator', 'child', 0, D), look('child', 'narrator', 0, D), face('child', 'sleepy', 10, 4), fx('zzz', 'child', 13.5, 2.5), atmo('night', D), clip('scene', 'effect', 'atmo.fireflies@1', 0, D), { owner: 'scene', track: 'text', asset: 'txt.narration-box@1', at: 0.5, dur: 4, params: { text: 'Once upon a time…' } }, music('calm-ambient', D), amb('bedroom-quiet', D)],
    },
  };
}

export const TEMPLATES: Record<string, TemplateData> = {
  'two-person-podcast': podcast(),
  'solo-podcast': soloPodcast(),
  'panel-discussion': panel(),
  interview: interview(),
  'classroom-explainer': classroom(),
  'product-explainer': product(),
  'comedy-exchange': comedy(),
  'sitcom-scene': sitcom(),
  'news-segment': news(),
  'character-introduction': intro(),
  'social-short-portrait': socialShort(),
  'story-scene': story(),
  'mystery-scene': mystery(),
  'customer-support-demo': support(),
  announcement: announcement(),
  'bedtime-story': bedtime(),
};
