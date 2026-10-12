'use strict';
// Build a static worker from the exact installed/pinned SDK constants. Parsing
// the exported literals avoids executing dependency code during generation.
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const sdkRoot = path.dirname(require.resolve('znn-ts-sdk/package.json'));
const literal = (file, name) => {
  const ast = babel.parseSync(fs.readFileSync(path.join(sdkRoot, file), 'utf8'), { configFile: false, babelrc: false, sourceType: 'module' });
  const declarations = ast.program.body.flatMap(node => node.type === 'ExportNamedDeclaration' ? node.declaration?.declarations || [] : []);
  const value = declarations.find(node => node.id?.name === name)?.init;
  if (value?.type !== 'TemplateLiteral' || value.expressions.length || value.quasis.length !== 1 || typeof value.quasis[0].value.cooked !== 'string') throw Error('Unexpected pinned SDK PoW source: ' + name);
  return value.quasis[0].value.cooked;
};
module.exports = () => {
  const wasm = literal('lib/src/pow/base/base64.ts', 'base64Wasm');
  const runtime = literal('lib/src/pow/base/znn-pow-string.ts', 'stringPow');
  const license = fs.readFileSync(path.join(sdkRoot, 'LICENSE'), 'utf8').replace(/\*\//g, '* /');
  return '/*! PoW runtime from pinned znn-ts-sdk 0.1.3; generated at build time.\n' + license + '*/\n' +
    'var wasmPath=' + JSON.stringify(wasm) + ';\n' +
    'var Module={onRuntimeInitialized:function(){self.postMessage({ready:true});}};\n' + runtime + '\n' +
    // A benchmark message leaves the worker usable. benchmark() starts from a
    // zero nonce and counts up, so the nonce it returns (little-endian) is the
    // number of hashes it took: time it, and that is this device's hash rate,
    // which the wallet's "about N s" for plasma is made from (wallet/pow.js).
    `let used=false;self.onmessage=function(event){const request=event.data;if(request&&request.benchmark===true){try{if(!(request.ms>0&&request.ms<=1000))throw Error('Invalid benchmark');const bench=Module.cwrap('benchmark','string',['string']);const start=performance.now();let difficulty=1024,hashes=0,ms=0;while((ms=performance.now()-start)<request.ms){const nonce=bench(String(difficulty));let count=0;for(let i=14;i>=0;i-=2)count=count*256+parseInt(nonce.slice(i,i+2),16);hashes+=count+1;difficulty*=2;}self.postMessage({hashes:hashes,ms:ms});}catch(error){self.postMessage({benchmarkFailed:true});}return;}if(used)return;used=true;try{const input=event.data;if(!input||!/^[0-9a-f]{64}$/i.test(input.hash)||!/^\\d{1,20}$/.test(input.difficulty))throw Error('Invalid PoW input');const compute=Module.cwrap('generatePoW','string',['string','string']);self.postMessage({nonce:compute(input.hash,input.difficulty)});}catch(error){self.postMessage({error:'Proof of work failed'});}};\n`;
};
