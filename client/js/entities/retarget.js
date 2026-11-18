// Animasyon aktarma: Soldier modelinin yürüme/koşma/bekleme animasyonlarını
// aynı (mixamo) kemik adlarını kullanan başka bir karaktere uyarlar.
// Kemiklerin dinlenme duruşları farklı olabileceği için dünya uzayında aktarılır:
// her karede kaynağın dinlenmeden sapması (Δ) hedefin dinlenme duruşuna uygulanır.
// Ayrıca kaynakla hedefin dinlenme pozu farklıysa (A-poz / T-poz) kemik yönleri önce hizalanır.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const strip = (n) => n.replace(/^mixamorig[:_]?/i, '');
// kemik yönü için tercih edilen çocuk (birden fazla çocuğu olanlarda)
const PREF_CHILD = { Hips: 'Spine', Spine2: 'Neck' };

export function retargetClips(srcScene, dstScene, clips, fps = 30) {
  const S = SkeletonUtils.clone(srcScene);
  S.updateMatrixWorld(true); dstScene.updateMatrixWorld(true);
  const sb = {};
  S.traverse((o) => { if (o.isBone) sb[strip(o.name)] = o; });
  const dst = [];
  dstScene.traverse((o) => { if (o.isBone && sb[strip(o.name)]) dst.push(o); });  // ebeveynler önce gelir
  const key = (o) => strip(o.name);
  const mapped = new Set(dst.map(key));
  const restS = {}, restT = {}, C = {}, restParentT = {};
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  for (const b of dst) {
    const k = key(b);
    restS[k] = sb[k].getWorldQuaternion(new THREE.Quaternion());
    restT[k] = b.getWorldQuaternion(new THREE.Quaternion());
    restParentT[k] = b.parent.getWorldQuaternion(new THREE.Quaternion());
    const kids = b.children.filter((c) => c.isBone && mapped.has(key(c)));
    const ch = kids.find((c) => key(c) === PREF_CHILD[k]) || kids[0];
    if (ch) {
      const dT = wp(ch).sub(wp(b)), dS = wp(sb[key(ch)]).sub(wp(sb[k]));
      C[k] = dT.lengthSq() > 1e-10 && dS.lengthSq() > 1e-10 ? new THREE.Quaternion().setFromUnitVectors(dT.normalize(), dS.normalize()) : new THREE.Quaternion();
    } else C[k] = (b.parent && C[key(b.parent)]) ? C[key(b.parent)].clone() : new THREE.Quaternion();
  }
  const hipT = dst.find((b) => key(b) === 'Hips');
  const hipS = sb.Hips;
  const hipRestS = hipS ? wp(hipS) : null, hipRestT = hipT ? wp(hipT) : null;
  const ratio = hipRestS && hipRestT && hipRestS.y > 0.01 ? hipRestT.y / hipRestS.y : 1;
  const mixer = new THREE.AnimationMixer(S);
  const out = [];
  const Ws = new THREE.Quaternion(), D = new THREE.Quaternion(), inv = new THREE.Quaternion();
  for (const clip of clips) {
    mixer.stopAllAction();
    const act = mixer.clipAction(clip); act.play();
    const n = Math.max(2, Math.ceil(clip.duration * fps) + 1);
    const times = new Float32Array(n);
    const q = {}; for (const b of dst) q[key(b)] = new Float32Array(n * 4);
    const hp = new Float32Array(n * 3);
    const Wt = {};
    for (let i = 0; i < n; i++) {
      const t = Math.min(clip.duration, i / fps); times[i] = t;
      act.time = t; mixer.update(0); S.updateMatrixWorld(true);
      for (const b of dst) {
        const k = key(b);
        sb[k].getWorldQuaternion(Ws);
        D.copy(Ws).multiply(inv.copy(restS[k]).invert());
        const w = (Wt[k] = Wt[k] || new THREE.Quaternion()).copy(D).multiply(C[k]).multiply(restT[k]);
        const pk = b.parent && mapped.has(key(b.parent)) ? Wt[key(b.parent)] : restParentT[k];
        const l = inv.copy(pk).invert().multiply(w);
        l.toArray(q[k], i * 4);
      }
      if (hipT && hipS) {
        const d = wp(hipS).sub(hipRestS).multiplyScalar(ratio);
        const p = hipRestT.clone().add(d);
        hipT.parent.worldToLocal(p);
        p.toArray(hp, i * 3);
      }
    }
    act.stop(); mixer.uncacheAction(clip);
    const tracks = dst.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, q[key(b)]));
    if (hipT && hipS) tracks.push(new THREE.VectorKeyframeTrack(`${hipT.name}.position`, times, hp));
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  out.corr = C; out.restT = restT;
  return out;
}

// Kemiğe bağlı bir yerleşimi (silah tutuşu, kask) hedefin kendi dinlenme pozundan
// kaynağın dinlenme pozuna göre düzeltir; böylece aktarılan animasyonlarda silah
// kaynak modeldeki gibi durur. frame: { bone, p, q, s }
export function correctFrame(frame, clips) {
  if (!frame || !clips || !clips.corr) return frame;
  const k = strip(frame.bone), C = clips.corr[k], R = clips.restT[k];
  if (!C || !R) return frame;
  const M = R.clone().invert().multiply(C.clone().invert()).multiply(R);
  return { ...frame, p: frame.p.clone().applyQuaternion(M), q: M.clone().multiply(frame.q) };
}
