import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);const configRequire=createRequire(require.resolve('@prisma/config'));
const {deepmerge}=await import(pathToFileURL(configRequire.resolve('deepmerge-ts')).href);
test('Prisma config dependency preserves the plain nested config used by this app',()=>{assert.deepEqual(deepmerge({schema:'prisma/schema.prisma',migrations:{path:'prisma/migrations'}},{migrations:{seed:'node seed.mjs'}}),{schema:'prisma/schema.prisma',migrations:{path:'prisma/migrations',seed:'node seed.mjs'}})});
test('Prisma config merger handles recursive input without stack exhaustion',()=>{const a={};a.self=a;const b={};b.self=b;try{deepmerge(a,b)}catch(e){assert.notEqual(e.name,'RangeError')}});
