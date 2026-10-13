'use strict';
// The recovery phrase check (src/services/wallet/phraseQuiz.js): three
// distinct positions in phrase order, four distinct options each with the
// right word among them, decoys from the phrase itself, repeats handled.
//
//   node utils/phrase-quiz-test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

const filename = path.join(__dirname, '..', 'src/services/wallet/phraseQuiz.js');
const { code } = babel.transformFileSync(filename, { presets: [['@babel/preset-env', { targets: { node: 'current' } }]], babelrc: false, configFile: false });
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const { makePhraseQuiz, isQuizAnswered, ordinal } = mod.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

const phrase = Array.from({ length: 24 }, (_, index) => `word${index}`);

check('shape', () => {
  for (let run = 0; run < 500; run += 1) {
    const quiz = makePhraseQuiz(phrase);
    assert.equal(quiz.length, 3);
    const positions = quiz.map((q) => q.position);
    assert.equal(new Set(positions).size, 3, 'positions repeat');
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'positions out of phrase order');
    for (const { position, options } of quiz) {
      assert.ok(position >= 0 && position < 24);
      assert.equal(options.length, 4);
      assert.equal(new Set(options).size, 4, 'options repeat');
      assert.ok(options.includes(phrase[position]), 'right word missing');
      assert.ok(options.every((word) => phrase.includes(word)), 'decoy not from the phrase');
    }
  }
});

check('every position and option slot is reachable', () => {
  const seenPositions = new Set();
  const seenSlots = new Set();
  for (let run = 0; run < 2000; run += 1) {
    for (const { position, options } of makePhraseQuiz(phrase)) {
      seenPositions.add(position);
      seenSlots.add(options.indexOf(phrase[position]));
    }
  }
  assert.equal(seenPositions.size, 24);
  assert.equal(seenSlots.size, 4, 'the right word sits in a fixed slot');
});

check('three different words asked, no word offered twice', () => {
  // 24 words, only 12 of them distinct: exactly enough for 12 options, and
  // only because answers and decoys are drawn from distinct words.
  const repeats = Array.from({ length: 24 }, (_, index) => `w${index % 12}`);
  for (const words of [phrase, repeats]) {
    for (let run = 0; run < 2000; run += 1) {
      const quiz = makePhraseQuiz(words);
      const answers = quiz.map(({ position }) => words[position]);
      assert.equal(new Set(answers).size, 3, `asked the same word twice: ${answers}`);
      const offered = quiz.flatMap(({ options }) => options);
      assert.equal(offered.length, 12);
      assert.equal(new Set(offered).size, 12, 'a word is offered in two questions');
    }
  }
});

check('a repeated word is never its own decoy', () => {
  const repeats = ['able', 'able', 'baker', 'charlie', 'delta', 'echo', 'able', 'fox', 'golf', 'hotel', 'india', 'juliet'];
  for (let run = 0; run < 500; run += 1) {
    for (const { position, options } of makePhraseQuiz(repeats)) {
      assert.equal(options.filter((word) => word === repeats[position]).length, 1);
      assert.equal(new Set(options).size, options.length);
    }
  }
});

check('fewer distinct words than options', () => {
  const quiz = makePhraseQuiz(['a', 'b', 'a', 'b', 'a', 'c']);
  for (const { options } of quiz) assert.deepEqual([...options].sort(), ['a', 'b', 'c']);
});

check('answers', () => {
  const quiz = makePhraseQuiz(phrase);
  const right = quiz.map(({ position }) => phrase[position]);
  assert.equal(isQuizAnswered(quiz, phrase, right), true);
  assert.equal(isQuizAnswered(quiz, phrase, right.slice(0, 2)), false);
  const wrong = [...right];
  wrong[1] = quiz[1].options.find((word) => word !== right[1]);
  assert.equal(isQuizAnswered(quiz, phrase, wrong), false);
  assert.equal(isQuizAnswered([], phrase, []), false, 'an empty quiz passes');
});

check('ordinals', () => {
  const expected = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 10: '10th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 22: '22nd', 23: '23rd', 24: '24th' };
  for (const [n, text] of Object.entries(expected)) assert.equal(ordinal(Number(n)), text);
});

console.log(`phrase-quiz: positions, options, repeats and answers: ${passed} passed`);
