// The check after a new wallet's recovery phrase is shown: three positions,
// each with four words to choose from.
//
// It used to ask for all twenty-four words in order, tapped from a shuffle of
// the phrase. Three positions are quicker and still fail anyone without a copy:
// a blind guess passes one time in 64.
//
// The wrong options are other words of the same phrase, not words from the
// BIP-39 list: a stranger word would be spotted as "not mine" without knowing
// where anything goes. A phrase can repeat a word, so options are distinct
// words and the right one is any word equal to the one at that position.

const QUESTIONS = 3;
const OPTIONS = 4;

// An unbiased index below `n`, from the platform's CSPRNG.
const randomIndex = (n) => {
  const limit = Math.floor(0x100000000 / n) * n;
  const cell = new Uint32Array(1);
  do {
    crypto.getRandomValues(cell);
  } while (cell[0] >= limit);
  return cell[0] % n;
};

const shuffle = (items, random = randomIndex) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = random(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

// [{ position, options }], `position` 0-based, in phrase order.
//
// The asked words are three different words, and no word is offered in two
// questions, so one answer never hints at another. A phrase with too few
// distinct words for that (only a contrived one) reuses words across
// questions rather than offering fewer options.
const makePhraseQuiz = (words, { questions = QUESTIONS, options = OPTIONS, random = randomIndex } = {}) => {
  const positions = [];
  for (const position of shuffle(words.map((_, index) => index), random)) {
    if (positions.length === questions) break;
    if (!positions.some((taken) => words[taken] === words[position])) positions.push(position);
  }
  positions.sort((a, b) => a - b);

  const answers = positions.map((position) => words[position]);
  const distinct = [...new Set(words)];
  const unused = shuffle(distinct.filter((word) => !answers.includes(word)), random);
  return positions.map((position, question) => {
    const answer = answers[question];
    const decoys = unused.splice(0, options - 1);
    if (decoys.length < options - 1) {
      const others = distinct.filter((word) => word !== answer && !decoys.includes(word));
      decoys.push(...shuffle(others, random).slice(0, options - 1 - decoys.length));
    }
    return { position, options: shuffle([answer, ...decoys], random) };
  });
};

const isQuizAnswered = (quiz, words, chosen) =>
  quiz.length > 0 && quiz.every(({ position }, index) => chosen[index] === words[position]);

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd, 24th.
const ordinal = (n) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${suffix}`;
};

export { makePhraseQuiz, isQuizAnswered, ordinal };
