/** Viewer script: the render loop. */
export const LOOP = `let last = performance.now();
renderer.setAnimationLoop((now) => {
  const w = innerWidth, h = innerHeight;
  if (renderer.domElement.width !== w * devicePixelRatio) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  if (playing) { tick = (tick + ((now - last) / 50) * +$("speed").value) % end; $("tick").value = tick; }
  last = now;
  $("tickOut").textContent = tick.toFixed(1);
  apply(editing !== null ? keyPose(editing) : poseAt(gesture, tick));
  controls.update();
  renderer.render(scene, camera);
});
`;
