'use strict';
// Build the token-id search worker (src/services/token/ztsSearch.js) as one
// static file: the installed js-sha3, the search compiled from source, and a
// handler that checks what it is given. A static file, as for the PoW worker:
// no Blob URL, nothing fetched.
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

module.exports = () => {
  const sha3 = fs.readFileSync(require.resolve('js-sha3/src/sha3.js'), 'utf8');
  const license = fs.readFileSync(path.join(path.dirname(require.resolve('js-sha3/package.json')), 'LICENSE.txt'), 'utf8').replace(/\*\//g, '* /');
  const { code } = babel.transformFileSync(path.join(__dirname, '../src/services/token/ztsSearch.js'), {
    presets: [['@babel/preset-env', { targets: { chrome: '110' }, modules: 'commonjs' }]], babelrc: false, configFile: false,
  });
  return '/*! js-sha3, generated at build time.\n' + license + '*/\n' + sha3 + '\n' +
    '(function(){var module={exports:{}};var exports=module.exports;\n' + code + '\n' +
    'var core=module.exports;var search=core.createSearch(self.sha3_256).search;\n' +
    // One job per worker: a head of whole bytes, a pattern from the charset,
    // a start, and a chunk size. Progress after every chunk; the popup ends
    // the search by terminating the worker.
    "self.onmessage=function(event){var j=event.data||{};" +
    "if(!/^([0-9a-f]{2}){64,1024}$/.test(j.head)||typeof j.prefix!=='string'||typeof j.suffix!=='string'||core.patternError(j.prefix,j.suffix)||!(j.prefix||j.suffix)||!(j.hi>=0&&j.hi<4294967296)||!(j.chunk>0&&j.chunk<=1e7)){self.postMessage({error:'Invalid search'});return;}" +
    'var head=new Uint8Array(j.head.length/2);for(var i=0;i<head.length;i++)head[i]=parseInt(j.head.substr(i*2,2),16);' +
    'var lo=0;for(;;){var r=search({head:head,prefix:j.prefix,suffix:j.suffix,hi:j.hi,lo:lo,count:j.chunk});' +
    'if(r.found){self.postMessage({found:true,nonce:r.nonce,zts:r.zts,tried:r.tried});return;}' +
    // Wrapping past 2^32 means this worker's whole range was tried.
    "self.postMessage({tried:r.tried});if(r.lo<=lo){self.postMessage({error:'Search space used up'});return;}lo=r.lo;}};\n" +
    'self.postMessage({ready:true});})();\n';
};
