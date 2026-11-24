import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectCorners,validCorners,defaultCorners} from '../receipt-image.js';

test('perspective transform maps all four corners of an oblique receipt',()=>{
  const points=[{x:.21,y:.05},{x:.79,y:.12},{x:.88,y:.93},{x:.11,y:.91}];
  assert.equal(validCorners(points),true);
  const map=projectCorners(points);
  for(const [index,[u,v]] of [[0,0],[1,0],[1,1],[0,1]].entries()){
    const p=map(u,v);
    assert.ok(Math.hypot(p.x-points[index].x,p.y-points[index].y)<1e-10);
  }
});
test('rejects crossing corners and accepts a full-frame fallback',()=>{
  const points=defaultCorners();
  assert.equal(validCorners(points),true);
  assert.equal(validCorners([points[0],points[2],points[1],points[3]]),false);
});
