// Data layer: Firebase (Auth + Firestore) when configured, otherwise browser localStorage.
// Both backends expose the same API so app.js doesn't care which one is active.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.3.0/';

export const isConfigured =
  !!firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith('PASTE');

/* ---------- Firebase backend ---------- */
async function firebaseBackend() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
  });
  let uid = null;
  const col = (name) => F.collection(db, 'users', uid, name);
  const ref = (name, id) => F.doc(db, 'users', uid, name, id);

  return {
    local: false,
    onUser(cb) {
      A.onAuthStateChanged(auth, (u) => {
        uid = u ? u.uid : null;
        cb(u ? { name: u.displayName || u.email } : null);
      });
    },
    signInGoogle: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    signInEmail: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    createAccount: (email, pw) => A.createUserWithEmailAndPassword(auth, email, pw),
    signOut: () => A.signOut(auth),
    watch(name, cb) {
      return F.onSnapshot(col(name), (snap) =>
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      );
    },
    add: (name, data) => F.addDoc(col(name), data),
    update: (name, id, patch) => F.updateDoc(ref(name, id), patch),
    set: (name, id, data) => F.setDoc(ref(name, id), data, { merge: true }),
    remove: (name, id) => F.deleteDoc(ref(name, id)),
  };
}

/* ---------- localStorage backend ---------- */
function localBackend() {
  const listeners = {};
  const key = (name) => 'dash:' + name;
  const read = (name) => {
    try { return JSON.parse(localStorage.getItem(key(name))) || []; } catch { return []; }
  };
  const write = (name, items) => {
    localStorage.setItem(key(name), JSON.stringify(items));
    (listeners[name] || []).forEach((cb) => cb(read(name)));
  };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Keep multiple open tabs in sync.
  window.addEventListener('storage', (e) => {
    const name = e.key?.startsWith('dash:') && e.key.slice(5);
    if (name) (listeners[name] || []).forEach((cb) => cb(read(name)));
  });

  return {
    local: true,
    onUser: (cb) => cb({ name: 'Local mode' }),
    signOut: async () => {},
    watch(name, cb) {
      (listeners[name] ||= []).push(cb);
      cb(read(name));
      return () => (listeners[name] = listeners[name].filter((l) => l !== cb));
    },
    async add(name, data) { write(name, [...read(name), { id: newId(), ...data }]); },
    async update(name, id, patch) {
      write(name, read(name).map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    async set(name, id, data) {
      const items = read(name);
      const i = items.findIndex((x) => x.id === id);
      if (i >= 0) items[i] = { ...items[i], ...data }; else items.push({ id, ...data });
      write(name, items);
    },
    async remove(name, id) { write(name, read(name).filter((x) => x.id !== id)); },
  };
}

export function initDb() {
  return isConfigured ? firebaseBackend() : Promise.resolve(localBackend());
}
