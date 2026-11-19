// game_world.js — the photo memory in the frame (load saved photo defensively, show new ones).

export function createWorldFx({ THREE, tl, A, frame, drawingTex, engine }) {
  let current = null; // texture currently shown (owned here)

  function setDrawing() {
    try { frame.userData.setPhoto(drawingTex); } catch (e) { /* ignore */ }
  }
  function valid(url) {
    return typeof url === 'string' && url.length > 64 && url.length < 3e6 && /^data:image\/(jpeg|png|webp);base64,/.test(url);
  }
  function apply(img) {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    frame.userData.setPhoto(tex);
    if (current) { try { current.dispose(); } catch (e) { /* ignore */ } }
    current = tex;
  }
  function load(url, onOk, onFail) {
    if (!valid(url)) { onFail(); return; }
    try {
      const img = new Image();
      img.onload = () => {
        try {
          if (!(img.naturalWidth > 8 && img.naturalHeight > 8)) { onFail(); return; }
          onOk(img);
        } catch (e) { onFail(); }
      };
      img.onerror = () => onFail();
      img.src = url;
    } catch (e) { onFail(); }
  }
  function hopFrame() {
    const y0 = frame.position.y, rx = frame.rotation.x;
    tl.tween(0.4, (e, k) => {
      frame.position.y = y0 + 0.016 * Math.sin(Math.PI * k);
      frame.rotation.x = rx - 0.15 * Math.sin(Math.PI * k) * (1 - k);
    }, () => { frame.position.y = y0; frame.rotation.x = rx; });
    A.play('frameHop');
  }
  return {
    loadSavedPhoto() {
      setDrawing();
      let url = null;
      try { url = engine.save.get('photo', null); } catch (e) { url = null; }
      load(url, apply, setDrawing);
    },
    showPhoto(url, hop) {
      load(url, (img) => { apply(img); if (hop) hopFrame(); }, () => { if (hop) hopFrame(); });
    },
  };
}
