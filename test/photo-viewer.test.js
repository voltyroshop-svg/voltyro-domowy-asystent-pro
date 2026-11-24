import {test} from 'node:test';
import assert from 'node:assert/strict';
import {photoTransform} from '../photo-viewer.js';

const frame={width:320,height:400},photo={width:320,height:240};
const original={scale:1,x:0,y:0},center={x:0,y:0};
test('pinching keeps the point under the fingers and allows panning inside image bounds',()=>{
  const nearEdge={x:80,y:15};
  const zoomed=photoTransform(frame,photo,original,{from:nearEdge,to:{x:100,y:20},scale:3});
  assert.deepEqual(zoomed,{scale:3,x:-140,y:-25});
  assert.deepEqual(photoTransform(frame,photo,zoomed,{from:center,to:{x:-900,y:900}}),{scale:3,x:-320,y:160});
});
test('full view resets offsets and clamps scale without affecting the page',()=>{
  const prior={scale:3,x:-140,y:-25};
  assert.deepEqual(photoTransform(frame,photo,prior,{from:center,scale:0}),original);
  assert.equal(photoTransform(frame,photo,prior,{from:center,scale:12}).scale,6);
});
