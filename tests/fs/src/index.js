import * as Comlink from "comlink";

const worker = new Worker('./worker.mjs', {type: 'module'});
const wrapper = Comlink.wrap(worker);

console.log(`wrapper.asyncfun(): ${await wrapper.asyncfun()}`);
console.log(`wrapper.syncfun(): ${await wrapper.syncfun()}`);