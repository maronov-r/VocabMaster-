// packs.js — built-in curated word packs, free for everyone.
// Each word: { word, phonetic?, meanings:[{partOfSpeech, definition, example}] }
// Packs are browsable in Explore and can be added to the user's own list.

const m = (partOfSpeech, definition, example) => ({ partOfSpeech, definition, example });

export const PACKS = [
  {
    id: 'refined', title: 'Refined & Elegant', emoji: '🕊️',
    blurb: 'Graceful, literary words to make your writing shine.',
    words: [
      { word: 'gentility', phonetic: 'dʒɛnˈtɪlɪti', meanings: [m('noun', 'Social superiority or refined, well-bred manners.', 'She carried herself with quiet gentility.')] },
      { word: 'eloquent', phonetic: 'ˈɛləkwənt', meanings: [m('adjective', 'Fluent or persuasive in speaking or writing.', 'He gave an eloquent speech at the wedding.')] },
      { word: 'sublime', phonetic: 'səˈblaɪm', meanings: [m('adjective', 'Of such excellence or beauty as to inspire awe.', 'The view from the summit was sublime.')] },
      { word: 'ephemeral', phonetic: 'ɪˈfɛm(ə)rəl', meanings: [m('adjective', 'Lasting for a very short time.', 'Fame can be ephemeral.')] },
      { word: 'mellifluous', phonetic: 'mɛˈlɪflʊəs', meanings: [m('adjective', 'Sweet or musical; pleasant to hear.', 'Her mellifluous voice filled the hall.')] },
      { word: 'opulent', phonetic: 'ˈɒpjʊlənt', meanings: [m('adjective', 'Ostentatiously rich and luxurious.', 'They dined in an opulent ballroom.')] },
      { word: 'pristine', phonetic: 'ˈprɪstiːn', meanings: [m('adjective', 'Clean and fresh as if new; unspoiled.', 'The beach was pristine at dawn.')] },
      { word: 'serene', phonetic: 'sɪˈriːn', meanings: [m('adjective', 'Calm, peaceful, and untroubled.', 'A serene smile crossed her face.')] },
      { word: 'luminous', phonetic: 'ˈluːmɪnəs', meanings: [m('adjective', 'Full of or shedding light; radiant.', 'The moon was luminous over the sea.')] },
      { word: 'quintessential', phonetic: 'ˌkwɪntɪˈsɛnʃ(ə)l', meanings: [m('adjective', 'Representing the most perfect example of a quality.', 'He is the quintessential gentleman.')] },
    ],
  },
  {
    id: 'emotions', title: 'Emotions', emoji: '💛',
    blurb: 'Name exactly how you feel.',
    words: [
      { word: 'melancholy', phonetic: 'ˈmɛlənkəli', meanings: [m('noun', 'A thoughtful or gentle sadness.', 'A wave of melancholy came with the autumn.')] },
      { word: 'euphoria', phonetic: 'juːˈfɔːrɪə', meanings: [m('noun', 'A feeling of intense happiness and excitement.', 'She felt euphoria as she crossed the finish line.')] },
      { word: 'nostalgia', phonetic: 'nɒˈstaldʒə', meanings: [m('noun', 'A sentimental longing for the past.', 'Old songs fill him with nostalgia.')] },
      { word: 'apprehension', phonetic: 'ˌaprɪˈhɛnʃ(ə)n', meanings: [m('noun', 'Anxiety or unease about the future.', 'She waited with growing apprehension.')] },
      { word: 'contentment', phonetic: 'kənˈtɛntm(ə)nt', meanings: [m('noun', 'A state of peaceful happiness and satisfaction.', 'He sighed with contentment after the meal.')] },
      { word: 'resentment', phonetic: 'rɪˈzɛntm(ə)nt', meanings: [m('noun', 'Bitter indignation at unfair treatment.', 'Years of resentment finally surfaced.')] },
      { word: 'elation', phonetic: 'ɪˈleɪʃ(ə)n', meanings: [m('noun', 'Great happiness and exhilaration.', 'The win brought a rush of elation.')] },
      { word: 'serenity', phonetic: 'sɪˈrɛnɪti', meanings: [m('noun', 'The state of being calm and peaceful.', 'The garden was a place of serenity.')] },
      { word: 'indignation', phonetic: 'ˌɪndɪɡˈneɪʃ(ə)n', meanings: [m('noun', 'Anger at something unjust or unworthy.', 'She spoke with righteous indignation.')] },
      { word: 'empathy', phonetic: 'ˈɛmpəθi', meanings: [m('noun', 'The ability to understand and share another’s feelings.', 'A good nurse shows real empathy.')] },
    ],
  },
  {
    id: 'people', title: 'Describing People', emoji: '🧑‍🤝‍🧑',
    blurb: 'Words that capture character and personality.',
    words: [
      { word: 'gregarious', phonetic: 'ɡrɪˈɡɛːrɪəs', meanings: [m('adjective', 'Fond of company; sociable.', 'Her gregarious nature made her the host.')] },
      { word: 'meticulous', phonetic: 'mɪˈtɪkjʊləs', meanings: [m('adjective', 'Showing great attention to detail; very careful.', 'He kept meticulous records.')] },
      { word: 'candid', phonetic: 'ˈkandɪd', meanings: [m('adjective', 'Truthful and straightforward; frank.', 'I’ll be candid: it needs work.')] },
      { word: 'tenacious', phonetic: 'tɪˈneɪʃəs', meanings: [m('adjective', 'Holding firmly to a purpose; persistent.', 'A tenacious reporter chased the story.')] },
      { word: 'aloof', phonetic: 'əˈluːf', meanings: [m('adjective', 'Distant, cool, or reserved.', 'He stayed aloof at the party.')] },
      { word: 'benevolent', phonetic: 'bɪˈnɛvələnt', meanings: [m('adjective', 'Kind, generous, and well-meaning.', 'A benevolent patron funded the school.')] },
      { word: 'affable', phonetic: 'ˈafəb(ə)l', meanings: [m('adjective', 'Friendly, good-natured, and easy to talk to.', 'The affable clerk put us at ease.')] },
      { word: 'obstinate', phonetic: 'ˈɒbstɪnət', meanings: [m('adjective', 'Stubbornly refusing to change one’s mind.', 'He was obstinate about the plan.')] },
      { word: 'magnanimous', phonetic: 'maɡˈnanɪməs', meanings: [m('adjective', 'Generous or forgiving, especially toward a rival.', 'She was magnanimous in victory.')] },
      { word: 'diligent', phonetic: 'ˈdɪlɪdʒ(ə)nt', meanings: [m('adjective', 'Showing steady, careful effort.', 'A diligent student, she never missed class.')] },
    ],
  },
  {
    id: 'mind', title: 'The Mind & Thinking', emoji: '🧠',
    blurb: 'For ideas, insight, and reflection.',
    words: [
      { word: 'astute', phonetic: 'əˈstjuːt', meanings: [m('adjective', 'Having sharp judgement; shrewd.', 'An astute investor, she saw it coming.')] },
      { word: 'lucid', phonetic: 'ˈluːsɪd', meanings: [m('adjective', 'Expressed clearly; easy to understand.', 'She gave a lucid explanation.')] },
      { word: 'pensive', phonetic: 'ˈpɛnsɪv', meanings: [m('adjective', 'Deeply or wistfully thoughtful.', 'He grew pensive at the window.')] },
      { word: 'discern', phonetic: 'dɪˈsəːn', meanings: [m('verb', 'To perceive or recognize clearly.', 'I could just discern a figure in the fog.')] },
      { word: 'cognizant', phonetic: 'ˈkɒɡnɪz(ə)nt', meanings: [m('adjective', 'Aware of something; having knowledge.', 'Be cognizant of the risks.')] },
      { word: 'introspective', phonetic: 'ˌɪntrəˈspɛktɪv', meanings: [m('adjective', 'Examining one’s own thoughts and feelings.', 'A quiet, introspective child.')] },
      { word: 'sagacious', phonetic: 'səˈɡeɪʃəs', meanings: [m('adjective', 'Having keen mental discernment; wise.', 'A sagacious old teacher.')] },
      { word: 'intuitive', phonetic: 'ɪnˈtjuːɪtɪv', meanings: [m('adjective', 'Understood instinctively, without conscious reasoning.', 'She had an intuitive grasp of people.')] },
      { word: 'contemplate', phonetic: 'ˈkɒntɛmpleɪt', meanings: [m('verb', 'To think about something deeply and at length.', 'He sat to contemplate his next move.')] },
      { word: 'rational', phonetic: 'ˈraʃ(ə)n(ə)l', meanings: [m('adjective', 'Based on reason or logic.', 'Let’s make a rational decision.')] },
    ],
  },
  {
    id: 'society', title: 'Society & People', emoji: '🏛️',
    blurb: 'The language of the world around us.',
    words: [
      { word: 'ubiquitous', phonetic: 'juːˈbɪkwɪtəs', meanings: [m('adjective', 'Present or found everywhere.', 'Smartphones are now ubiquitous.')] },
      { word: 'egalitarian', phonetic: 'ɪˌɡalɪˈtɛːrɪən', meanings: [m('adjective', 'Believing all people are equal.', 'An egalitarian society values fairness.')] },
      { word: 'autonomy', phonetic: 'ɔːˈtɒnəmi', meanings: [m('noun', 'The right or state of self-government; independence.', 'The region was granted autonomy.')] },
      { word: 'dissent', phonetic: 'dɪˈsɛnt', meanings: [m('noun', 'The holding or expression of opinions at odds with those held by most.', 'A lone voice of dissent.'), m('verb', 'To hold or express a differing opinion.', 'Two judges dissented.')] },
      { word: 'conformity', phonetic: 'kənˈfɔːmɪti', meanings: [m('noun', 'Behaviour in line with socially accepted standards.', 'Peer pressure encourages conformity.')] },
      { word: 'solidarity', phonetic: 'ˌsɒlɪˈdarɪti', meanings: [m('noun', 'Unity or agreement of feeling and action within a group.', 'The workers stood in solidarity.')] },
      { word: 'reciprocity', phonetic: 'ˌrɛsɪˈprɒsɪti', meanings: [m('noun', 'Exchanging things with others for mutual benefit.', 'Trade depends on reciprocity.')] },
      { word: 'prejudice', phonetic: 'ˈprɛdʒʊdɪs', meanings: [m('noun', 'A preconceived opinion not based on reason or experience.', 'We must fight prejudice.')] },
      { word: 'marginalize', phonetic: 'ˈmɑːdʒɪnəlʌɪz', meanings: [m('verb', 'To treat a person or group as insignificant.', 'The policy marginalized the poor.')] },
      { word: 'hierarchy', phonetic: 'ˈhʌɪərɑːki', meanings: [m('noun', 'A system in which people or things are ranked by status.', 'The company has a strict hierarchy.')] },
    ],
  },
  {
    id: 'nature', title: 'Nature & the World', emoji: '🌿',
    blurb: 'Beautiful words for the natural world.',
    words: [
      { word: 'petrichor', phonetic: 'ˈpɛtrɪkɔː', meanings: [m('noun', 'The pleasant, earthy smell after rain.', 'Petrichor rose from the warm pavement.')] },
      { word: 'verdant', phonetic: 'ˈvəːd(ə)nt', meanings: [m('adjective', 'Green with growing plants; lush.', 'Verdant hills rolled to the horizon.')] },
      { word: 'tempest', phonetic: 'ˈtɛmpɪst', meanings: [m('noun', 'A violent, windy storm.', 'The ship was tossed by the tempest.')] },
      { word: 'zephyr', phonetic: 'ˈzɛfə', meanings: [m('noun', 'A soft, gentle breeze.', 'A warm zephyr drifted through the trees.')] },
      { word: 'halcyon', phonetic: 'ˈhalsɪən', meanings: [m('adjective', 'Denoting a peaceful, happy, idyllic period.', 'The halcyon days of summer.')] },
      { word: 'arid', phonetic: 'ˈarɪd', meanings: [m('adjective', 'Very dry; having little rainfall.', 'Cacti thrive in arid deserts.')] },
      { word: 'pastoral', phonetic: 'ˈpast(ə)r(ə)l', meanings: [m('adjective', 'Portraying country life in an idealized way.', 'A pastoral scene of sheep and meadows.')] },
      { word: 'crepuscular', phonetic: 'krɪˈpʌskjʊlə', meanings: [m('adjective', 'Relating to or resembling twilight.', 'Deer are crepuscular, active at dusk.')] },
      { word: 'cascade', phonetic: 'kaˈskeɪd', meanings: [m('noun', 'A small waterfall; a flow pouring downward.', 'A cascade tumbled over the rocks.')] },
      { word: 'luminescent', phonetic: 'ˌluːmɪˈnɛs(ə)nt', meanings: [m('adjective', 'Emitting light not caused by heat; glowing.', 'Luminescent plankton lit the waves.')] },
    ],
  },
];

export function getPack(id) {
  return PACKS.find((p) => p.id === id) || null;
}
