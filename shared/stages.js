// Single source of truth for the eight stages, used by the frontend (what the
// caller sees) and the backend (validation + the LLM prompt).
//
// Every number and quote here comes from reading the 100 transcripts.
// The per-call labels behind the numbers are in analysis/where-calls-end.csv.

export const STAGES = [
  {
    n: 1,
    key: 'opening',
    name: 'Opening',
    goal: 'Reach the right person and say who you are.',
    lead: 'Confirm the name and the company before anything else.',
    endedHere: 15,
    insight:
      'An old number, someone who left, a language switch. Several of these only came out after a full pitch.',
    maySay: [
      'Prakash Rao ka to 14 saal se ye number nahi hai.',
      "I'm no longer with Celera, by the way.",
      'Record your name and reason for calling.',
    ],
    taps: [
      { key: 'right_person', label: 'Right person, listening' },
      { key: 'gatekeeper', label: 'Reception or assistant' },
      { key: 'busy', label: 'Busy, call later', ends: 'follow_up' },
      { key: 'wrong_number', label: 'Wrong number', ends: 'wrong_person' },
      { key: 'moved', label: 'Has left the company', ends: 'moved_company' },
      { key: 'language', label: 'Needs another language', ends: 'call_again' },
    ],
  },
  {
    n: 2,
    key: 'purpose',
    name: 'Purpose',
    goal: 'Say why you called in one sentence they can repeat to a colleague.',
    lead: 'Name, company, city, slowly. Then one line on why.',
    endedHere: 7,
    insight:
      '"From where?" came up in 33 of 100 calls. "Growth report" is a label; prospects asked what it meant, often twice.',
    maySay: [
      'What does a growth report mean, actually?',
      "So you're a consulting company?",
      'Where did you get my number from?',
    ],
    taps: [
      { key: 'asked_what', label: 'Asked what we do' },
      { key: 'asked_number', label: 'Asked where we got the number' },
      { key: 'guessed_wrong', label: 'Guessed wrong: bank, SEO, job, media' },
      { key: 'let_go_on', label: 'Let me go on' },
      { key: 'not_interested', label: 'Not interested', ends: 'not_interested' },
      { key: 'line_bad', label: 'Line breaking up', ends: 'call_again' },
    ],
  },
  {
    n: 3,
    key: 'permission',
    name: 'Permission',
    goal: 'Get a clear yes, a clear no, or a time to call back.',
    lead: 'If they are driving or in a meeting, ask for a time and stop.',
    endedHere: 6,
    insight:
      '"Tell me" and "go ahead" came fast and meant little. Several of those prospects said "not the right person" a sentence later.',
    maySay: [
      "I'm driving, but I can speak to you. No problem.",
      'Can we speak at 1:30, Rohit?',
      'I am travelling today. Send me some details by mail.',
    ],
    taps: [
      { key: 'yes', label: 'Clear yes' },
      { key: 'gave_time', label: 'Gave a time to call', ends: 'follow_up' },
      { key: 'busy_no_time', label: 'Busy, no time given', ends: 'follow_up' },
      { key: 'send_first', label: 'Send it on WhatsApp or mail first' },
      { key: 'kept_talking', label: 'Kept talking, no answer' },
      { key: 'no', label: 'Clear no', ends: 'not_interested' },
    ],
  },
  {
    n: 4,
    key: 'business',
    name: 'Their business',
    goal: 'Ask about their company and their work before saying anything about yours.',
    lead: 'One question about what they make and who buys it.',
    endedHere: 1,
    insight:
      'Callers skipped this in most calls and pitched instead. When they did ask, prospects corrected the picture: "only manufacturing", "job work", "market leader".',
    maySay: [
      "We are only manufacturing. We don't have an R&D team.",
      'Our company is the market leader.',
      'All those decisions are taken at corporate in the US.',
    ],
    taps: [
      { key: 'one_line', label: 'One line, waiting for the pitch' },
      { key: 'corrected', label: 'Corrected us: size, line, division' },
      { key: 'asked_us_first', label: 'Asked about us first' },
      { key: 'opened_up', label: 'Talked about their work' },
      { key: 'decided_elsewhere', label: 'Decided elsewhere: HQ, group, US' },
    ],
  },
  {
    n: 5,
    key: 'need',
    name: 'Their need',
    goal: 'Hear what they are trying to do or struggling with, in their own words.',
    lead: 'Type exactly what they say. This line is what the next call is built on.',
    endedHere: 1,
    insight:
      'The rarest stage in the data. When it happened the words were specific: "skilled manpower", "new products with our facility", "sustainability for EU buyers".',
    maySay: [
      'The biggest challenge is manpower. Skilled manpower.',
      'We are fine with our current business, which is really good.',
      'How are you going to help me grow my business?',
    ],
    taps: [
      { key: 'goal', label: 'Named a goal' },
      { key: 'problem', label: 'Named a problem' },
      { key: 'fine', label: 'Everything is fine' },
      { key: 'turned_around', label: 'Asked what we can do for them' },
      { key: 'wont_share', label: "Won't share plans" },
    ],
    wordsRequired: true,
  },
  {
    n: 6,
    key: 'objection',
    name: 'Objection',
    goal: 'Hear the reason for a no and understand it before you answer.',
    lead: 'Ask one question about the reason. Do not talk over it.',
    endedHere: 24,
    insight:
      'Where most calls stop. Not the right person (about 15), already have consultants or a team (7), "what does it cost, why is it free" (10).',
    maySay: [
      "I'm not the right person. Speak to somebody at head office.",
      'We have global tie-ups with the big four consulting firms.',
      "It's free? Then how do you benefit out of this?",
    ],
    taps: [
      { key: 'not_right_person', label: 'Not the right person' },
      { key: 'have_someone', label: 'Already have consultant or team' },
      { key: 'whats_the_catch', label: 'Asked cost, or why it is free' },
      { key: 'cant_share', label: "Can't share company data" },
      { key: 'send_writing', label: 'Send something in writing' },
      { key: 'no_need', label: 'No need right now' },
    ],
  },
  {
    n: 7,
    key: 'next_step',
    name: 'Next step',
    goal: 'Agree one concrete thing: a document on a channel, or a call at a named time.',
    lead: 'One thing, named, with a time or a channel.',
    endedHere: 46,
    insight:
      'Most were "send it on WhatsApp", which can be politeness. A time they name ("Tuesday, after 2") is worth more. Get the official email, not the personal one.',
    maySay: [
      'Tuesday is a good day. After 2 PM.',
      'WhatsApp on this number.',
      "That's my personal ID. Send it to my official ID.",
    ],
    taps: [
      { key: 'report_whatsapp', label: 'Report on WhatsApp' },
      { key: 'report_email', label: 'Report on email' },
      { key: 'call_time', label: 'Call at a time they named' },
      { key: 'meeting', label: 'Meeting with our founder' },
      { key: 'referral_number', label: 'Referral, with a number' },
      { key: 'referral_no_number', label: 'Referral, no number' },
    ],
    hasWhen: true,
  },
  {
    n: 8,
    key: 'close',
    name: 'Close',
    goal: 'End the call clearly and record what happened.',
    lead: 'Outcome, next step, and their words from stage 5.',
    endedHere: null,
    insight:
      '26 of 100 logged outcomes did not match the call. 13 logged nothing, including calls with a report and a time agreed.',
    maySay: [
      '(The line drops mid-sentence.)',
      '(A warm "thank you, thank you" after a no. Still a no.)',
      '("Hold on one second." The call never resumes.)',
    ],
    taps: [],
  },
];

export const OUTCOMES = [
  { key: 'next_step_agreed', label: 'Next step agreed', meaning: 'A meeting, a call at a set time, or a report plus a follow-up call was agreed.' },
  { key: 'agreed_to_receive_report', label: 'Agreed to receive report', meaning: 'The prospect agreed to receive a document, on WhatsApp or email.' },
  { key: 'interested', label: 'Interested', meaning: 'Said they were interested, without a fixed next step.' },
  { key: 'follow_up', label: 'Follow up', meaning: 'The caller is to call again.' },
  { key: 'call_again', label: 'Call again', meaning: 'Call the number again, often because of language or line quality.' },
  { key: 'not_interested', label: 'Not interested', meaning: 'The prospect declined.' },
  { key: 'do_not_call', label: 'Do not call', meaning: 'The prospect asked not to be called again.' },
  { key: 'wrong_person', label: 'Wrong person', meaning: 'The person reached is not the person listed, or not the right person.' },
  { key: 'moved_company', label: 'Moved company', meaning: 'The person no longer works at the listed company.' },
];

export const OUTCOME_KEYS = OUTCOMES.map((o) => o.key);

export const COMPANY_KINDS = [
  'India arm of a multinational',
  'mid-size private company',
  'mid-size private manufacturer',
  'listed Indian company',
  'large private company',
  'startup',
  'small private company',
  'public sector utility',
  'not known',
];

export const NEXT_STEP_CHANNELS = ['WhatsApp', 'Email', 'Call', 'Meeting', 'Referral', 'None'];

export function stageByN(n) {
  return STAGES.find((s) => s.n === Number(n));
}

export function tapLabel(stageN, tapKey) {
  const s = stageByN(stageN);
  return s?.taps.find((t) => t.key === tapKey)?.label ?? tapKey;
}

// Deterministic outcome suggestion from the taps alone. Used to prefill the
// close screen, and as the fallback when the LLM is unavailable.
// `results` is { [stageN]: { tap, words } }.
export function suggestOutcome(results) {
  const tap = (n) => results?.[n]?.tap;

  const s7 = tap(7);
  if (s7 === 'meeting' || s7 === 'call_time') return 'next_step_agreed';
  if (s7 === 'report_whatsapp' || s7 === 'report_email') return 'agreed_to_receive_report';
  if (s7 === 'referral_number' || s7 === 'referral_no_number') return 'follow_up';

  const s1 = tap(1);
  if (s1 === 'wrong_number') return 'wrong_person';
  if (s1 === 'moved') return 'moved_company';
  if (s1 === 'language') return 'call_again';
  if (s1 === 'busy') return 'follow_up';

  if (tap(2) === 'line_bad') return 'call_again';

  const s3 = tap(3);
  if (s3 === 'gave_time' || s3 === 'busy_no_time') return 'follow_up';
  if (s3 === 'no') return 'not_interested';

  const s6 = tap(6);
  if (s6 === 'not_right_person') return 'wrong_person';
  if (s6) return 'not_interested';

  if (tap(2) === 'not_interested') return 'not_interested';
  if (tap(5) === 'goal' || tap(5) === 'problem') return 'interested';
  return 'follow_up';
}
