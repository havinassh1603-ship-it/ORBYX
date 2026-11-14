/// <reference types="node" />
import {test,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
test('local signalling registers peers and forwards offers and answers',()=>{const r=spawnSync(process.execPath,[fileURLToPath(new URL('./signalling-worker.mjs',import.meta.url))],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000});expect(r.status,String(r.error||r.stderr||r.stdout)).toBe(0);},20000);
